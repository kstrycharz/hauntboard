import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SapientWallet, discoverTariProviders, providerLabel, postingReadiness, SAPIENT_REVIEW } from '../web/sapient-wallet.mjs';

const profile = { network: 'esmeralda', networkByte: 38, resetIdentity: 'fixture-reset' };
const account = `component_${'ab'.repeat(32)}`;
const caps = { supportsPrivateFees: true, transactionRequests: true, transactionResultLookup: true };
function fixture(overrides = {}) {
  const calls = [], listeners = new Map();
  const provider = {
    info: { name: 'Sapient' },
    async request({ method }) {
      calls.push(method);
      if (overrides[method]) return overrides[method]();
      return { tari_getNetwork: 'esmeralda', tari_requestAccounts: [account], tari_getCapabilities: caps, tari_disconnect: null }[method];
    },
    on(event, handler) { listeners.set(event, handler); return () => listeners.delete(event); },
  };
  return { provider, calls, listeners };
}

test('provider discovery deduplicates registry/global providers without calling them', () => {
  const a = fixture(), b = fixture();
  assert.deepEqual(discoverTariProviders({ tari: a.provider, tariProviders: [null, {}, a.provider, b.provider, a.provider] }), [a.provider, b.provider]);
  assert.deepEqual(a.calls, []);
  assert.equal(providerLabel({ info: { name: 'x'.repeat(200) } }).length, 80);
  assert.equal(providerLabel({}), 'Tari wallet 1');
});

test('connection checks network before asking for public account; does not read private balances or spend', async () => {
  const f = fixture(), wallet = new SapientWallet();
  const connected = await wallet.connect(f.provider, profile);
  assert.equal(connected.account, account);
  assert.deepEqual(f.calls, ['tari_getNetwork', 'tari_requestAccounts', 'tari_getCapabilities']);
  assert.deepEqual(connected.capabilities, caps);
  const readiness = postingReadiness(profile, connected);
  assert.equal(readiness.postingEnabled, true);
  assert.equal(readiness.recommendedWallet, 'sapient');
  assert.equal(readiness.blockers.length, 0);
  assert(Object.isFrozen(SAPIENT_REVIEW.blockers));
});

test('wrong network blocks connection before requesting accounts', async () => {
  const f = fixture({ tari_getNetwork: () => 'igor' }), wallet = new SapientWallet();
  await assert.rejects(wallet.connect(f.provider, profile), /Switch your wallet to esmeralda/);
  assert.deepEqual(f.calls, ['tari_getNetwork']);
  assert.equal(wallet.connection, null);
});

test('invalid/resetless and mainnet app profiles fail before provider calls', async () => {
  const f = fixture(), wallet = new SapientWallet();
  await assert.rejects(wallet.connect(f.provider, { ...profile, resetIdentity: '' }), /reset identity/);
  await assert.rejects(wallet.connect(f.provider, { ...profile, network: 'mainnet' }), /Mainnet is disabled/);
  assert.deepEqual(f.calls, []);
});

test('user rejection is distinct and does not retain connection/listener', async () => {
  const f = fixture({ tari_requestAccounts: () => { throw { code: 4001, message: 'private provider diagnostic' }; } }), wallet = new SapientWallet();
  await assert.rejects(wallet.connect(f.provider, profile), e => e.code === 4001 && !e.message.includes('private provider diagnostic'));
  assert.equal(wallet.connection, null);
  assert.equal(f.listeners.size, 0);
});

test('invalid account/capability responses fail closed', async () => {
  for (const override of [{ tari_requestAccounts: () => ['not-an-account'] }, { tari_getCapabilities: () => [] }]) {
    const f = fixture(override), wallet = new SapientWallet();
    await assert.rejects(wallet.connect(f.provider, profile));
    assert.equal(wallet.connection, null);
    assert.equal(f.listeners.size, 0);
  }
  const f = fixture({ tari_getCapabilities: () => ({ supportsPrivateFees: 'true' }) }), wallet = new SapientWallet();
  const connection = await wallet.connect(f.provider, profile);
  assert.equal(connection.capabilities.supportsPrivateFees, false);
  assert(postingReadiness(profile, connection).blockers.some(v => v.includes('supportsPrivateFees')));
});

test('account change clears a snapshot and prevents late connection results from reviving it', async () => {
  let release;
  const response = new Promise(r => { release = r; });
  const f = fixture({ tari_requestAccounts: () => response }), wallet = new SapientWallet();
  const attempt = wallet.connect(f.provider, profile);
  await new Promise(r => setImmediate(r));
  f.listeners.get('accountsChanged')([]);
  release([account]);
  await assert.rejects(attempt, /connection changed/);
  assert.equal(wallet.connection, null);
  assert(!f.calls.includes('tari_getCapabilities'));
});

test('timeout clears connection; a late provider response cannot connect', async () => {
  let release;
  const response = new Promise(r => { release = r; });
  const f = fixture({ tari_getNetwork: () => response }), wallet = new SapientWallet({ timeoutMs: 10 });
  await assert.rejects(wallet.connect(f.provider, profile), /timed out/);
  release('esmeralda');
  await new Promise(r => setImmediate(r));
  assert.equal(wallet.connection, null);
  assert.deepEqual(f.calls, ['tari_getNetwork']);
});

test('disconnect is explicit and clears local connection even if the provider fails', async () => {
  const f = fixture({ tari_disconnect: () => { throw new Error('offline'); } }), wallet = new SapientWallet();
  await wallet.connect(f.provider, profile);
  await assert.rejects(wallet.disconnect(), /offline/);
  assert.equal(wallet.connection, null);
  assert.equal(f.listeners.size, 0);
  assert.equal(f.calls.at(-1), 'tari_disconnect');
});

test('method boundary rejects direct signing and private reads before provider access', async () => {
  const f = fixture(), wallet = new SapientWallet();
  for (const method of ['tari_signAndSubmitTransaction', 'tari_requestViewAccess', 'tari_getPrivateBalances']) {
    await assert.rejects(wallet.call(f.provider, method), /Unsupported/);
  }
  assert.deepEqual(f.calls, []);
});

test('stock request approval persists request and attempt before submitting exactly once', async () => {
  const id = 'cd'.repeat(32), snapshots = [];
  const f = fixture({tari_createTransactionRequest: () => ({requestId: 'request-1'}), tari_getTransactionRequest: () => ({status: 'approved'}), tari_submitTransactionRequest: () => {
    assert.equal(snapshots.at(-1).sapientAttempted, true);
    assert.equal(snapshots.at(-1).sapientRequest, 'request-1');
    return {transactionId: id};
  }});
  const wallet = new SapientWallet(); await wallet.connect(f.provider, profile);
  const pending = {};
  assert.deepEqual(await wallet.submit({account, network: 'esmeralda', operationRequest: {kind: 'instructions'}}, pending, () => snapshots.push({...pending})), {transactionId: id});
  assert.equal(f.calls.filter(m => m === 'tari_submitTransactionRequest').length, 1);
});

test('interrupted submit recovers the existing result without another submission', async () => {
  let committed = false;
  const id = 'ef'.repeat(32);
  const f = fixture({tari_getTransactionRequest: () => committed ? {status: 'submitted', result: {transaction_id: id}} : {status: 'approved'}, tari_submitTransactionRequest: () => {committed = true; throw new Error('lost acknowledgement');}});
  const wallet = new SapientWallet(); await wallet.connect(f.provider, profile);
  const pending = {sapientRequest: 'request-2'}, quote = {account, network: 'esmeralda'};
  await assert.rejects(wallet.submit(quote, pending, () => {}), /lost acknowledgement/);
  assert.deepEqual(await wallet.submit(quote, pending, () => {}), {transactionId: id});
  assert.equal(f.calls.filter(m => m === 'tari_submitTransactionRequest').length, 1);
});

test('rejected approvals and unresolved submissions never create replacement spends', async () => {
  for (const status of ['rejected', 'failed', 'submitting']) {
    const f = fixture({tari_getTransactionRequest: () => ({status})});
    const wallet = new SapientWallet(); await wallet.connect(f.provider, profile);
    await assert.rejects(wallet.submit({account, network: 'esmeralda'}, {sapientRequest: 'request-3'}, () => {}));
    assert(!f.calls.includes('tari_submitTransactionRequest'));
    assert(!f.calls.includes('tari_createTransactionRequest'));
  }
});
