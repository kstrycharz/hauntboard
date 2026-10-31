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
  assert.equal(readiness.postingEnabled, false);
  assert.equal(readiness.recommendedWallet, 'browser');
  assert.equal(readiness.blockers.length, 5, 'Even every advertised capability cannot enable spending.');
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

test('method boundary rejects signing, request creation, submission and private reads before provider access', async () => {
  const f = fixture(), wallet = new SapientWallet();
  for (const method of ['tari_createTransactionRequest', 'tari_submitTransactionRequest', 'tari_signAndSubmitTransaction', 'tari_requestViewAccess', 'tari_getPrivateBalances']) {
    await assert.rejects(wallet.call(f.provider, method), /disabled/);
  }
  assert.deepEqual(f.calls, []);
});
