import {test} from 'node:test';
import assert from 'node:assert/strict';
import {postingPolicy, eligibleCoin, fundsReadiness, postingFee} from '../web/posting-readiness.mjs';

test('existing wallets retain isolation and explicit standard policy survives change rediscovery', () => {
  assert.equal(postingPolicy({}), 'isolated');
  const change = {state:'quarantined'};
  assert.equal(eligibleCoin(change, postingPolicy({})), false);
  assert.equal(eligibleCoin(change, postingPolicy({postingPolicy:'standard'})), true);
  for (const state of ['reserved','used']) assert.equal(eligibleCoin({state}, 'standard'), false);
});

test('99 remaining tokens are explained as held, never missing; standard funds remain usable during an incomplete scan', () => {
  const isolated = {ready:'0', quarantined:'99000000', reserved:'0', revealed:'0'};
  assert.equal(fundsReadiness(isolated).code, 'change-held');
  assert.equal(fundsReadiness(isolated).action, 'policy');
  assert.equal(fundsReadiness({...isolated, ready:'99000000', postingPolicy:'standard'}, {incomplete:true}).code, 'ready');
});

test('outages and unfinished discovery are distinct from verified insufficient funds', () => {
  assert.equal(fundsReadiness({unavailable:true,total:'99000000'}).code, 'provider-unavailable');
  assert.equal(fundsReadiness({ready:'0', discoveryUnavailable:true}).code, 'checking');
  assert.equal(fundsReadiness({ready:'0'}, {incomplete:true}).code, 'checking');
  assert.equal(fundsReadiness({ready:'0'}).code, 'funding-needed');
  assert.equal(fundsReadiness({ready:'0',revealed:'99000000'}).code, 'preparation-needed');
  assert.equal(fundsReadiness({ready:'0',reserved:'99000000'}).code, 'pending-operation');
});

test('a usable input smaller than one token can fund its actual simulated fee; limits remain enforced', () => {
  assert.equal(postingFee(10000n, 500000n), 13000n);
  assert.throws(() => postingFee(1000000n, 99000000n), {code:'fee-limit'});
  assert.throws(() => postingFee(10000n, 13000n), {code:'insufficient-eligible-funds'});
  assert.throws(() => postingFee(0n, 1000000n), {code:'fee-limit'});
});
