import test from 'node:test';
import assert from 'node:assert/strict';
import { decryptFaucetDiscovery, discoverFaucetOutputs } from '../web/faucet-discovery.mjs';
const id = n => `utxo_${'01'.repeat(32)}_${n.repeat(64)}`;
test('receipt-known owned outputs activate without a general listing; reserved/change states and restart are preserved', async () => {
  const reserved = { id: id('a'), state: 'reserved', pendingTx: 'a'.repeat(64) };
  let saved;
  const options = { coins: [reserved], outputs: [id('b'), id('c'), id('d')], verifyOwned: async output => output === id('d') ? null : { change: output === id('c') }, checkpoint: async coins => { saved = structuredClone(coins); } };
  const result = await discoverFaucetOutputs(options);
  assert.equal(result.found, 2); assert.deepEqual(result.coins[0], reserved);
  assert.equal(result.coins.find(c => c.id === id('b')).state, 'ready');
  assert.equal(result.coins.find(c => c.id === id('c')).state, 'quarantined');
  assert.equal((await discoverFaucetOutputs({ ...options, coins: saved })).found, 0);
});
test('unverified hints cannot activate coins; capacity and missing provider data are explicit', async () => {
  await assert.rejects(discoverFaucetOutputs({ coins: [], outputs: [id('a')], verifyOwned: async () => { throw Error('unverified'); } }), /unverified/);
  const missing = await discoverFaucetOutputs({ coins: [], outputs: [id('a')], verifyOwned: async () => { throw Object.assign(Error('missing'), { status: 404 }); } });
  assert.equal(missing.unavailable, true); assert.equal(missing.found, 0);
  const full = await discoverFaucetOutputs({ coins: [{ id: id('a'), state: 'ready' }], capacity: 1, outputs: [id('b')], verifyOwned: async () => ({ change: false }) });
  assert.equal(full.capacityReached, true); assert.equal(full.found, 0);
  const used = await discoverFaucetOutputs({ coins: [{ id: id('a'), state: 'used' }], outputs: [id('a')], verifyOwned: async () => { throw Error('must not reactivate spent output'); } });
  assert.equal(used.found, 0);
});
test('encrypted payload validates reset identity and native output IDs', async () => {
  const shared = crypto.getRandomValues(new Uint8Array(32)), address = 'fixture';
  const key = await crypto.subtle.importKey('raw', shared, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const payload = { version: 1, network: 'esmeralda', resetIdentity: 'fixture-reset', outputs: [id('a')], historyComplete: true };
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(`tari-faucet-discovery:v1:${address}`) }, key, new TextEncoder().encode(JSON.stringify(payload)));
  const capsule = { version: 1, publicNonce: 'a'.repeat(64), iv: Buffer.from(iv).toString('hex'), ciphertext: Buffer.from(ct).toString('hex') };
  const options = { capsule, address, deriveAeadKey: async () => shared.slice(), network: 'esmeralda', resetIdentity: 'fixture-reset' };
  assert.deepEqual(await decryptFaucetDiscovery(options), payload);
  await assert.rejects(decryptFaucetDiscovery({ ...options, resetIdentity: 'wrong-reset' }), /identity mismatch/);
  await assert.rejects(decryptFaucetDiscovery({ ...options, address: 'another-address' }));
});
