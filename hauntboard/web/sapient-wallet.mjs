// Stock Sapient transaction-request integration. Wallet-managed signing and change
// differ from the browser wallet's isolated posting policy; disclose this in review.
import { networkProfile } from './network-profile.mjs';

export const SAPIENT_REVIEW = Object.freeze({
  version: '0.6.17',
  commit: 'e2f7bf9772faa35c4bce55f5e2b741a37b38a36c',
  sdkVersion: '0.1.30',
  postingEnabled: true,
  blockers: Object.freeze([
    'The reviewed private-fee posting path still signs with the persistent wallet key.',
    'Posting change cannot be isolated through the reviewed provider interface.',
    'Interrupted submission recovery does not expose a durable original transaction identity to Hauntboard.',
    'The provider reports a network name but no Hauntboard reset binding.',
    'Room administration requires an additional signer that this interface does not accept.',
  ]),
});

export function discoverTariProviders(surface = globalThis) {
  const candidates = Array.isArray(surface.tariProviders) ? [...surface.tariProviders] : [];
  candidates.push(surface.tari);
  return [...new Set(candidates)].filter(p => p && typeof p.request === 'function');
}

export function providerLabel(provider, index = 0) {
  const name = provider?.info?.name;
  return typeof name === 'string' && name.trim() ? name.trim().slice(0, 80) : `Tari wallet ${index + 1}`;
}

// Capability claims come from the page's injected provider, not an authenticated
// version handshake. They cannot override the source-review release gate.
export function postingReadiness(profile, connection) {
  const expected = networkProfile(profile);
  const blockers = [];
  if (!connection) blockers.unshift('Connect a wallet to check its network and capabilities.');
  else {
    if (connection.network !== expected.network) blockers.unshift('The connected wallet is on a different network.');
    for (const capability of ['supportsPrivateFees', 'transactionRequests', 'transactionResultLookup']) {
      if (connection.capabilities?.[capability] !== true) blockers.push(`The connected account does not support ${capability}.`);
    }
  }
  return { postingEnabled: blockers.length === 0, recommendedWallet: connection ? 'sapient' : 'browser', blockers };
}

const READ_METHODS = new Set(['tari_getNetwork', 'tari_requestAccounts', 'tari_getCapabilities', 'tari_disconnect']);
const POST_METHODS = new Set(['tari_createTransactionRequest', 'tari_getTransactionRequest', 'tari_submitTransactionRequest']);

export class SapientWallet {
  constructor({ timeoutMs = 15000, changed = () => {} } = {}) {
    this.timeoutMs = timeoutMs;
    this.changed = changed;
    this.generation = 0;
    this.connection = null;
    this.provider = null;
    this.unsubscribe = null;
  }

  async call(provider, method, params) {
    if (!READ_METHODS.has(method) && !POST_METHODS.has(method)) throw new Error('Unsupported Sapient method.');
    let timer;
    try {
      return await Promise.race([
        Promise.resolve().then(() => provider.request({ method, ...(params === undefined ? {} : { params }) })),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Wallet response timed out. Check the extension before trying again.')), this.timeoutMs); }),
      ]);
    } finally { clearTimeout(timer); }
  }

  async review(body, profile, api) {
    if (!postingReadiness(profile, this.connection).postingEnabled) throw new Error('Connect Sapient on the configured network before posting.');
    if (!['thread', 'reply'].includes(body.kind)) throw new Error('Use the browser wallet for room administration.');
    const sdk = await import('./vendor/wallet-sdk.mjs');
    const target = body.kind === 'thread' ? body.board : body.thread;
    const state = await api(body.kind === 'thread' ? `/api/board?address=${target}` : `/api/thread?address=${target}`);
    if (state.schema !== 4) throw new Error('This board is not supported by Sapient posting.');
    const builder = new sdk.TransactionBuilder(profile.networkByte, 0);
    const inputs = [{substate_id: target, version: null, is_write: true}];
    if (body.kind === 'thread') builder.callMethod({componentAddress: target, methodName: 'create_thread'}, [sdk.literalArg(body.title), sdk.intLiteral(0n), sdk.vectorLiteral(body.uid), sdk.vectorLiteral(body.payload)]);
    else {
      builder.callMethod({componentAddress: target, methodName: 'append'}, [sdk.vectorLiteral(body.nonce), sdk.intLiteral(BigInt(body.parent ?? -1)), sdk.vectorLiteral(body.payload)]);
      const hint = new DataView(new Uint8Array(body.nonce).buffer).getUint32(0, true);
      if (state.pages[hint]) inputs.push({substate_id: state.pages[hint], version: null, is_write: true});
    }
    return {sapient: true, operation: crypto.randomUUID().replaceAll('-', ''), account: this.connection.account, network: this.connection.network, reset: profile.resetIdentity, maxFee: '1000000', operationRequest: {kind: 'instructions', instructions: builder.buildUnsignedTransaction().instructions, inputs, maxFee: '1000000', feeType: 'private', enforceFeeType: true}};
  }

  async submit(quote, saved, persist) {
    const provider = this.provider, connection = this.connection;
    if (!connection || quote.account !== connection.account || quote.network !== connection.network) throw new Error('Reconnect the reviewed Sapient account before continuing.');
    if (quote.expiresAt && quote.expiresAt < Date.now()) throw Object.assign(new Error('Review expired. Review your post again.'), {notSubmitted: true});
    if (await this.call(provider, 'tari_getNetwork') !== quote.network) throw new Error('Sapient network changed.');
    if (!saved.sapientRequest) {
      saved.sapientCreating = true; persist();
      const created = await this.call(provider, 'tari_createTransactionRequest', quote.operationRequest);
      if (typeof created?.requestId !== 'string' || !created.requestId) throw new Error('Sapient did not return a transaction request ID. Check its history before retrying.');
      saved.sapientRequest = created.requestId; saved.sapientCreating = false; persist();
    }
    for (let i = 0; i < 180; i++) {
      if (this.provider !== provider || this.connection !== connection) throw new Error('Reconnect Sapient to check the pending request.');
      const record = await this.call(provider, 'tari_getTransactionRequest', {requestId: saved.sapientRequest});
      if (record.status === 'rejected') throw Object.assign(new Error('Sapient approval declined. Your draft is preserved.'), {notSubmitted: true});
      if (record.status === 'approved' && !saved.sapientAttempted) {
        saved.sapientAttempted = true; persist();
        const result = await this.call(provider, 'tari_submitTransactionRequest', {requestId: saved.sapientRequest});
        return {transactionId: sapientTransactionId(result)};
      }
      if (record.status === 'submitted') return {transactionId: sapientTransactionId(record.result)};
      if (['failed', 'submitting'].includes(record.status)) throw new Error('Check this request in Sapient. Its submission outcome is unresolved; do not post it again.');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new Error('Approve the request in Sapient, then check the existing submission.');
  }

  async recover(pending) {
    if (!this.provider || !pending.sapientRequest) throw new Error('Reconnect Sapient and check its history for the pending submission.');
    return this.submit({account: pending.sapientAccount, network: pending.sapientNetwork}, pending, () => localStorage.setItem('hauntboard-pending', JSON.stringify(pending)));
  }

  clear() {
    this.generation++;
    try { this.unsubscribe?.(); } catch { /* Provider listener cleanup is best effort. */ }
    this.unsubscribe = null;
    this.provider = null;
    this.connection = null;
    this.changed();
  }

  async connect(provider, profile) {
    const expected = networkProfile(profile);
    if (!provider || typeof provider.request !== 'function') throw new Error('No injected Tari wallet was found.');
    this.clear();
    const generation = this.generation;
    this.provider = provider;
    const current = () => {
      if (generation !== this.generation) throw new Error('The wallet connection changed. Check it again.');
    };
    try {
      if (typeof provider.on === 'function') {
        const listener = () => this.clear();
        const remove = provider.on('accountsChanged', listener);
        this.unsubscribe = typeof remove === 'function' ? remove : () => provider.removeListener?.('accountsChanged', listener);
      }
      const network = await this.call(provider, 'tari_getNetwork');
      current();
      if (network !== expected.network) throw new Error(`Switch your wallet to ${expected.network}, then check it again.`);
      const accounts = await this.call(provider, 'tari_requestAccounts');
      current();
      if (!Array.isArray(accounts) || !accounts.length || !accounts.every(a => typeof a === 'string' && /^component_[a-f0-9]{64}$/.test(a))) {
        throw new Error('The wallet did not return a valid connected account.');
      }
      const raw = await this.call(provider, 'tari_getCapabilities');
      current();
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('The wallet returned invalid capabilities.');
      const capabilities = Object.fromEntries(['supportsPrivateFees', 'transactionRequests', 'transactionResultLookup'].map(k => [k, raw[k] === true]));
      this.connection = Object.freeze({ account: accounts[0], network, capabilities: Object.freeze(capabilities) });
      this.changed();
      return this.connection;
    } catch (error) {
      if (generation === this.generation) this.clear();
      if (error?.code === 4001) throw Object.assign(new Error('Wallet connection declined. Your browser wallet is unchanged.'), { code: 4001 });
      // Provider messages can contain arbitrary account/transaction details. Keep
      // the public UI error bounded and use only our own known diagnostic text.
      if (error instanceof Error && /^(Switch your wallet|The wallet|Wallet response)/.test(error.message)) throw error;
      throw new Error('Could not check the wallet. Unlock the extension and try again.');
    }
  }

  async disconnect() {
    const provider = this.provider;
    this.clear();
    if (provider) await this.call(provider, 'tari_disconnect');
  }
}

export function sapientTransactionId(result) {
  const id = result?.transactionId ?? result?.transaction_id;
  if (typeof id !== 'string' || !/^[a-f0-9]{64}$/i.test(id)) throw new Error('Sapient has not returned a valid transaction identity. Check the existing request.');
  return id;
}
