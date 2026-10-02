import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WalletFundingAdapter,
  NATIVE_RESOURCE,
  FAUCET_COMPONENT,
  finalizedFunding,
  exactRpcUnits,
} from '../../scripts/lib/wallet-funding-adapter.mjs';
const account = `component_${'ab'.repeat(32)}`;
const tx = 'a'.repeat(64);
const policy = {
  environment: 'ci',
  network: 'localnet',
  instance: 'isolated-volume',
  resource: NATIVE_RESOURCE,
  account,
  purpose: 'ci',
  runId: 'run',
  provider: 'local-faucet',
  enabled: true,
  maxFee: '1000000',
  runCap: '2000000',
  dailyCap: '2000000',
  requiredBalance: '1000000',
  targetBalance: '1000000',
  hotCap: '1000000000',
  maxClaims: 1,
  maxClaimsPerRun: 2,
};
const result = {
  transaction_hash: tx,
  result: { Accept: {} },
  fee_receipt: { total_fees_paid: 1234 },
  events: [{ substate_id: FAUCET_COMPONENT, topic: 'XtrFaucet.take' }],
};
function fixture(changes = {}) {
  const calls = [];
  const responses = {
    'wallet.get_info': { version: '0.43.0', network: 'localnet', network_byte: 16 },
    'accounts.get': {
      account: {
        component_address: account,
        owner_key_id: { branch: 'account', index: 0 },
        is_confirmed_on_chain: false,
      },
    },
    'accounts.get_balances': { address: account, balances: [] },
    'accounts.get_faucet_balance': { balance: '10000000000', claim_amount: '1000000000' },
    'transactions.get_all': { transactions: [] },
    'accounts.create_free_test_coins': {
      account: { component_address: account },
      transaction_id: tx,
      amount: '1000000000',
      fee: 1000000,
      result,
    },
    ...changes,
  };
  const adapter = new WalletFundingAdapter({
    policy,
    witness: async () => ({
      network: 'localnet',
      instance: policy.instance,
      resource: NATIVE_RESOURCE,
      divisibility: 6,
    }),
    rpc: {
      async call(method, params) {
        calls.push({ method, params });
        return structuredClone(responses[method]);
      },
    },
  });
  return { adapter, calls, responses };
}
test('released request uses canonical account enum and settles paid fee rather than response max_fee', async () => {
  const { adapter, calls } = fixture();
  assert.equal((await adapter.inspect(account)).eligible, true);
  assert.deepEqual(await adapter.claim({ account, maxFee: policy.maxFee }), {
    status: 'confirmed',
    transactionId: tx,
    fee: '1234',
  });
  assert.deepEqual(calls.at(-1).params, {
    account: { ComponentAddress: account },
    max_fee: '1000000',
  });
});
test('canonical target, owner key, resource and version mismatches reject before a claim', async () => {
  for (const changes of [
    {
      'accounts.get': {
        account: { component_address: `component_${'cd'.repeat(32)}`, owner_key_id: {} },
      },
    },
    { 'accounts.get': { account: { component_address: account, owner_key_id: null } } },
    { 'wallet.get_info': { network: 'esmeralda', network_byte: 38, version: '0.43.0' } },
    { 'wallet.get_info': { network: 'localnet', network_byte: 16, version: '0.42.0' } },
  ]) {
    const { adapter, calls } = fixture(changes);
    await assert.rejects(() => adapter.inspect(account));
    assert(calls.every((call) => call.method !== 'accounts.create_free_test_coins'));
  }
});
test('revealed bootstrap balance needs an accepted account-linked faucet claim; concealed balance is a separate class', async () => {
  const balance = {
    resource_address: NATIVE_RESOURCE,
    resource_type: 'Stealth',
    divisibility: 6,
    balance: '999998766',
    confidential_balance: '0',
  };
  const { adapter, responses } = fixture({
    'accounts.get_balances': { address: account, balances: [balance] },
    'transactions.get_all': {
      transactions: [{ id: tx, is_dry_run: false, status: 'Accepted', finalize: result }],
    },
  });
  assert.equal((await adapter.inspect(account)).fundingOrigin, 'faucet');
  responses['transactions.get_all'].transactions[0].is_dry_run = true;
  assert.equal((await adapter.inspect(account)).fundingOrigin, 'unknown');
  responses['accounts.get_balances'].balances[0].confidential_balance = '1';
  await assert.rejects(() => adapter.inspect(account), /UNSUPPORTED_BOOTSTRAP_INPUT_CLASS/);
});
test('unknown claim eligibility for already confirmed accounts never guesses true', async () => {
  const { adapter } = fixture({
    'accounts.get': {
      account: { component_address: account, owner_key_id: {}, is_confirmed_on_chain: true },
    },
  });
  assert.equal((await adapter.inspect(account)).eligible, null);
});
test('reconciliation binds transaction ID and faucet event and makes only reads', async () => {
  const { adapter, calls } = fixture({
    'transactions.get_all': {
      transactions: [{ id: tx, is_dry_run: false, status: 'Accepted', finalize: result }],
    },
  });
  assert.equal((await adapter.reconcile({ tx: null })).status, 'confirmed');
  assert.equal((await adapter.reconcile({ tx: 'b'.repeat(64) })).status, 'unknown');
  assert(calls.every((call) => call.method === 'transactions.get_all'));
});
test('partial acceptance, result hash mismatch and pending responses do not become successful claims', () => {
  assert.equal(
    finalizedFunding(
      tx,
      { ...result, result: { AcceptFeeRejectRest: [{}, 'rejected'] } },
      'OnlyFeeAccepted',
    ).status,
    'rejected',
  );
  assert.equal(
    finalizedFunding(tx, { ...result, transaction_hash: 'b'.repeat(64) }, 'Accepted').status,
    'unknown',
  );
  assert.equal(finalizedFunding(tx, null, 'Pending').status, 'pending');
  assert.equal(finalizedFunding(tx, result, 'DryRun').status, 'unknown');
});
test('RPC monetary parsing rejects unsafe numbers rather than rounding', () => {
  assert.equal(exactRpcUnits(1234), '1234');
  assert.throws(() => exactRpcUnits(Number.MAX_SAFE_INTEGER + 1), /UNSAFE_RPC_AMOUNT/);
  assert.throws(() => exactRpcUnits(0.1), /UNSAFE_RPC_AMOUNT/);
});
test('local adapter rejects public/mainnet configurations and noncanonical aliases', () => {
  assert.throws(
    () =>
      new WalletFundingAdapter({
        policy: { ...policy, account: 'alias' },
        rpc: {},
        witness: async () => ({}),
      }),
    /CANONICAL_ACCOUNT/,
  );
  assert.throws(
    () =>
      new WalletFundingAdapter({
        policy: { ...policy, network: 'esmeralda', provider: 'public-faucet' },
        rpc: {},
        witness: async () => ({}),
      }),
    /LOCAL_BOOTSTRAP_ONLY/,
  );
});
