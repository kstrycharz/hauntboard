import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Faucet} from '../lib/faucet.mjs';

const receipt = '6cf1df90-7645-44d2-8ed5-a00121aa8001';
const otherReceipt = '6cf1df90-7645-44d2-8ed5-a00121aa8002';
const payload = {receipt, address: 'otl_esm_synthetic', amountTokens: 100};
const result = (status = 'queued') => ({receipt, status, transactionId: status === 'confirmed' ? 'ab'.repeat(32) : null, amountMicrotari: '100000000'});
async function fixture(action) {
  const root = await mkdtemp(join(tmpdir(), 'hauntboard-faucet-'));
  try { await action(root); } finally { await rm(root, {recursive: true, force: true}); }
}

test('signed HttpOnly sessions reject forgery and authenticate receipt access', () => {
  const faucet = new Faucet({key: 'synthetic-api-key'});
  let cookie;
  const session = faucet.session({headers: {}}, {setHeader(name, value) {assert.equal(name, 'Set-Cookie'); cookie = value;}}, true);
  assert.match(cookie, /HttpOnly; SameSite=Strict/);
  assert.match(cookie, /; Secure$/);
  assert(!cookie.includes('synthetic-api-key'));
  assert.equal(faucet.authenticate({headers: {cookie: cookie.split(';')[0]}}), session);
  assert.throws(() => faucet.authenticate({headers: {}}), error => error.status === 401);
  assert.throws(() => faucet.authenticate({headers: {cookie: `hauntboard-faucet-session=${'a'.repeat(64)}.${'b'.repeat(64)}`}}), error => error.status === 401);
});

test('restart and concurrent clicks reuse one immutable claim; status is scoped to session and network', () => fixture(async root => {
  let sends = 0, now = 100000;
  const options = {key: 'synthetic-key', root, now: () => now, fetchImpl: async (url, init) => {
    assert.equal(init.headers.Authorization, 'Bearer synthetic-key');
    assert.equal(init.redirect, 'error');
    if (init.method === 'POST') {sends++; assert.deepEqual(JSON.parse(init.body), payload); return Response.json(result(), {status: 202});}
    return Response.json(result('confirmed'));
  }};
  const faucet = new Faucet(options);
  await Promise.all([faucet.claim('esmeralda:one', 'a', payload), faucet.claim('esmeralda:one', 'a', payload)]);
  const restarted = new Faucet(options);
  assert.equal((await restarted.claim('esmeralda:one', 'a', payload)).status, 'queued');
  assert.equal(sends, 1);
  await assert.rejects(restarted.claim('esmeralda:one', 'a', {...payload, address: 'otl_esm_changed'}), e => e.status === 409);
  await assert.rejects(restarted.status('esmeralda:one', 'b', receipt), e => e.status === 404);
  await assert.rejects(restarted.status('esmeralda:two', 'a', receipt), e => e.status === 404);
  now += 4000;
  assert.equal((await restarted.status('esmeralda:one', 'a', receipt)).status, 'confirmed');
  await assert.rejects(restarted.claim('esmeralda:one', 'a', {...payload, receipt: otherReceipt}), e => e.status === 429 && e.retryAfter > 0);
}));

test('lost acknowledgement survives restart and retries only the exact saved payload', () => fixture(async root => {
  let now = 100000, calls = [];
  const options = {key: 'synthetic-key', root, now: () => now};
  const faucet = new Faucet({...options, fetchImpl: async (url, init) => {calls.push(init.body); throw new Error('lost acknowledgement');}});
  await assert.rejects(faucet.claim('esmeralda:one', 'a', payload), e => e.status === 503 && e.retryAfter === 10);
  const restarted = new Faucet({...options, fetchImpl: async (url, init) => {
    if (init.method === 'GET') return Response.json({error: 'not found'}, {status: 404});
    calls.push(init.body); return Response.json(result('uncertain'), {status: 202});
  }});
  now += 11000;
  assert.equal((await restarted.status('esmeralda:one', 'a', receipt)).status, 'unknown');
  assert.equal((await restarted.claim('esmeralda:one', 'a', payload)).status, 'uncertain');
  assert.equal(calls.length, 2);
  assert.equal(calls[0], calls[1]);
  now += 4000;
  assert.equal((await restarted.status('esmeralda:one', 'a', receipt)).status, 'uncertain', 'An unavailable receipt never erases an acknowledged uncertain payment.');
  assert.equal(calls.length, 2);
}));

test('upstream cooldown is persisted and honored without another request', () => fixture(async root => {
  let now = 100000, calls = 0;
  const options = {key: 'synthetic-key', root, now: () => now, fetchImpl: async () => {calls++; return Response.json({error: 'Wallet cooldown'}, {status: 429, headers: {'Retry-After': '60'}});}};
  await assert.rejects(new Faucet(options).claim('esmeralda:one', 'a', payload), e => e.status === 429 && e.retryAfter === 60);
  await assert.rejects(new Faucet(options).claim('esmeralda:one', 'a', payload), e => e.status === 429 && e.retryAfter === 60);
  assert.equal(calls, 1);
  for (const patch of [{amountTokens: 1000}, {receipt: '../bad'}, {address: 'https://attacker.example'}])
    await assert.rejects(new Faucet(options).claim('esmeralda:one', 'a', {...payload, ...patch}), e => e.status === 400);
}));
