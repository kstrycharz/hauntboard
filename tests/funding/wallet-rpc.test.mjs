import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FundingRpc } from '../../scripts/lib/wallet-rpc.mjs';
const policy = {
  environment: 'ci',
  network: 'localnet',
  instance: 'local-genesis',
  resource: 'native',
  account: 'sender',
  purpose: 'tests',
  runId: '1',
  provider: 'local-faucet',
  enabled: true,
  maxFee: '10',
  runCap: '10',
  dailyCap: '10',
  requiredBalance: '1',
  targetBalance: '1',
  hotCap: '1000',
  maxClaims: 1,
  maxClaimsPerRun: 1,
};
function setup(t, fetchImpl) {
  const dir = mkdtempSync(join(tmpdir(), 'hauntbox-rpc-'));
  const tokenFile = join(dir, 'credential');
  writeFileSync(tokenFile, 'secret-test-bearer', { mode: 0o600 });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return new FundingRpc({
    policy,
    endpoint: 'http://wallet:5100/json_rpc',
    tokenFile,
    fetchImpl,
    timeoutMs: 100,
  });
}
test('only allowlisted method and configured account/fee can reach transport', async (t) => {
  let calls = 0;
  const rpc = setup(t, async (_url, options) => {
    calls++;
    assert.equal(options.headers.Authorization, 'Bearer secret-test-bearer');
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }));
  });
  await assert.rejects(rpc.call('accounts.stealth_transfer'), /RPC_METHOD_FORBIDDEN/);
  await assert.rejects(
    rpc.call('accounts.create_free_test_coins', { account: 'other', max_fee: '10' }),
    /UNAPPROVED/,
  );
  await assert.rejects(
    rpc.call('accounts.create_free_test_coins', { account: 'sender', max_fee: '11' }),
    /UNAPPROVED/,
  );
  await rpc.call('accounts.create_free_test_coins', { account: 'sender', max_fee: '10' });
  assert.equal(calls, 1);
});
test('reads can retry; mutations run once even when response is lost', async (t) => {
  let calls = 0;
  const rpc = setup(t, async () => {
    calls++;
    throw new Error('private raw error secret-test-bearer');
  });
  await assert.rejects(rpc.call('wallet.get_info'), { code: 'NETWORK_UNAVAILABLE' });
  assert.equal(calls, 3);
  calls = 0;
  await assert.rejects(
    rpc.call('accounts.create_free_test_coins', { account: 'sender', max_fee: '10' }),
    { code: 'NETWORK_UNAVAILABLE' },
  );
  assert.equal(calls, 1);
});
test('auth and malformed errors fail without retry and never echo raw upstream content', async (t) => {
  let calls = 0;
  const rpc = setup(t, async () => {
    calls++;
    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        error: { code: 401, message: 'secret-test-bearer recipient amount' },
      }),
    );
  });
  await assert.rejects(
    rpc.call('accounts.get_balances'),
    (error) => error.code === 'AUTHENTICATION_FAILED' && !error.message.includes('secret'),
  );
  assert.equal(calls, 1);
  rpc.fetch = async () => new Response('not-json-private-data');
  await assert.rejects(rpc.call('wallet.get_info'), { code: 'RPC_SHAPE_MISMATCH' });
});
test('mainnet never constructs a faucet RPC transport', () => {
  assert.throws(
    () =>
      new FundingRpc({
        policy: { ...policy, network: 'mainnet', provider: 'treasury' },
        endpoint: 'http://wallet/json_rpc',
        tokenFile: '/secret',
      }),
    /FAUCET_RPC_FORBIDDEN/,
  );
});
