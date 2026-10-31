// Read-only provider boundary. Spending stays disabled until the reviewed release
// satisfies Hauntboard's transaction signing, recovery and change-isolation gates.
import { networkProfile } from './network-profile.mjs';

export const SAPIENT_REVIEW = Object.freeze({
  version: '0.6.17',
  commit: 'e2f7bf9772faa35c4bce55f5e2b741a37b38a36c',
  sdkVersion: '0.1.30',
  postingEnabled: false,
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
  const blockers = [...SAPIENT_REVIEW.blockers];
  if (!connection) blockers.unshift('Connect a wallet to check its network and capabilities.');
  else {
    if (connection.network !== expected.network) blockers.unshift('The connected wallet is on a different network.');
    for (const capability of ['supportsPrivateFees', 'transactionRequests', 'transactionResultLookup']) {
      if (connection.capabilities?.[capability] !== true) blockers.push(`The connected account does not support ${capability}.`);
    }
  }
  return { postingEnabled: false, recommendedWallet: 'browser', blockers };
}

const READ_METHODS = new Set(['tari_getNetwork', 'tari_requestAccounts', 'tari_getCapabilities', 'tari_disconnect']);

export class SapientWallet {
  constructor({ timeoutMs = 15000, changed = () => {} } = {}) {
    this.timeoutMs = timeoutMs;
    this.changed = changed;
    this.generation = 0;
    this.connection = null;
    this.provider = null;
    this.unsubscribe = null;
  }

  async call(provider, method) {
    if (!READ_METHODS.has(method)) throw new Error('Sapient spending and private-balance access are disabled in this release.');
    let timer;
    try {
      return await Promise.race([
        Promise.resolve().then(() => provider.request({ method })),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Wallet response timed out. Check the extension before trying again.')), this.timeoutMs); }),
      ]);
    } finally { clearTimeout(timer); }
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
