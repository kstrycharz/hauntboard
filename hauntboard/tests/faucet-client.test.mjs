import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FaucetClient, faucetMessage} from '../web/faucet-client.mjs';
const config = {network: 'esmeralda', resetIdentity: 'fixture', faucetEnabled: true};
const address = 'otl_esm_synthetic';
const receipt = '6cf1df90-7645-44d2-8ed5-a00121aa8001';
function fixture(api) {
  const data = new Map();
  const storage = {getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value)};
  let now = 100000, tail = Promise.resolve();
  const options = {api, storage, locks: {request: (key, run) => {const work = tail.then(run); tail = work.catch(() => {}); return work;}}, now: () => now, newReceipt: () => receipt};
  return {options, client: new FaucetClient(options), advance: milliseconds => {now += milliseconds;}, data};
}
test('receipt is saved before sending, survives reload, and concurrent clicks cannot replace it', async () => {
  const calls = [];
  const f = fixture(async (path, body) => {
    assert(f.client.read(config, address), 'Receipt must exist before the request');
    calls.push({path, body});
    return {receipt, status: 'queued', transactionId: null};
  });
  await Promise.all([f.client.run(config, address, true), f.client.run(config, address, true)]);
  assert.equal(calls.length, 1);
  f.advance(5000);
  const reloaded = new FaucetClient(f.options);
  await reloaded.run(config, address);
  assert.equal(calls[1].path, '/api/faucet-status');
  assert.equal(calls[1].body.receipt, calls[0].body.receipt);
  assert.equal(reloaded.read({...config, resetIdentity: 'other'}, address), null);
  assert.equal(reloaded.read(config, 'otl_esm_other'), null);
});
test('timeout and cooldown keep the receipt, back off, and never automatically request a payment', async () => {
  let calls = [];
  const f = fixture(async (path, body) => {calls.push({path, body}); throw Object.assign(new Error('Wallet cooldown'), {retryAfter: '60'});});
  const first = await f.client.run(config, address, true);
  assert.equal(first.retryAt, 160000);
  await f.client.run(config, address, true);
  assert.equal(calls.length, 1);
  f.advance(61000);
  await new FaucetClient(f.options).run(config, address);
  assert.equal(calls[1].path, '/api/faucet-status');
  f.advance(61000);
  await f.client.run(config, address, true);
  assert.deepEqual(calls[2], calls[0]);
  assert.match(faucetMessage(first), /receipt is saved/);
});
test('unavailable storage prevents a claim and terminal payments are never polled or replaced automatically', async () => {
  let calls = 0;
  const f = fixture(async () => {calls++; return {receipt, status: 'confirmed', transactionId: 'ab'.repeat(32)};});
  const blocked = new FaucetClient({...f.options, storage: {getItem: () => null, setItem: () => {throw new Error('Storage blocked');}}});
  await assert.rejects(blocked.run(config, address, true), /Storage blocked/);
  assert.equal(calls, 0);
  await f.client.run(config, address, true);
  f.advance(100000);
  await f.client.run(config, address);
  assert.equal(calls, 1);
  assert.match(faucetMessage(f.client.read(config, address)), /must scan/);
  await assert.rejects(f.client.run({...config, faucetEnabled: false}, address, true), /unavailable/);
});
