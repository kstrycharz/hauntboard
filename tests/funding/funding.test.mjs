import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  FundingLedger,
  FundingService,
  validatePolicy,
  units,
  policyFromEnv,
} from '../../scripts/lib/funding.mjs';

const policy = {
  environment: 'ci',
  network: 'localnet',
  instance: 'test-genesis',
  resource: 'native-test-resource',
  account: 'sender',
  purpose: 'receipt-tests',
  runId: 'run-1',
  provider: 'local-faucet',
  enabled: true,
  maxFee: '10',
  runCap: '20',
  dailyCap: '30',
  requiredBalance: '50',
  targetBalance: '50',
  hotCap: '2000',
  maxClaims: 1,
  maxClaimsPerRun: 1,
};
const tx = 'a'.repeat(64);
function fixture(t, changes = {}, adapterChanges = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'hauntbox-funding-'));
  const path = join(dir, 'ledger.sqlite');
  const ledger = new FundingLedger(path);
  const adapter = {
    calls: 0,
    balance: '0',
    async inspect() {
      return {
        network: 'localnet',
        instance: 'test-genesis',
        resource: 'native-test-resource',
        owned: true,
        authenticated: true,
        spendable: this.balance,
        fundingOrigin: 'faucet',
        faucetBalance: '1000',
        claimAmount: '100',
        eligible: true,
      };
    },
    async claim() {
      this.calls++;
      this.balance = '95';
      return { status: 'confirmed', transactionId: tx, fee: '5' };
    },
    async reconcile() {
      this.balance = '95';
      return { status: 'confirmed', transactionId: tx, fee: '5' };
    },
    ...adapterChanges,
  };
  const service = new FundingService({ ...policy, ...changes }, ledger, adapter);
  t.after(() => {
    ledger.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return { service, ledger, adapter, path };
}
test('zero balance claims once and accounts actual fees; existing funds make no claim', async (t) => {
  const { service, adapter, ledger } = fixture(t);
  assert.equal((await service.ensureFunded()).state, 'funded');
  assert.equal(ledger.get(service.id).fee, '5');
  assert.equal(ledger.get(service.id).reserved, '0');
  assert.equal((await service.ensureFunded()).state, 'funded');
  assert.equal(adapter.calls, 1);
});
test('enough existing funds never calls the faucet', async (t) => {
  const { service, adapter } = fixture(t, {}, { balance: '50' });
  assert.equal((await service.ensureFunded()).state, 'funded');
  assert.equal(adapter.calls, 0);
});

test('existing balance above the hot-wallet cap is not ready and sends no claim', async (t) => {
  const { service, adapter } = fixture(t, {}, { balance: '2001' });
  assert.equal((await service.ensureFunded()).state, 'policy_breach');
  assert.equal(service.summary().status, 'FAILED');
  assert.equal(adapter.calls, 0);
});

test('a concurrent credit above the cap after confirmation keeps the actual fee and blocks readiness', async (t) => {
  const { service, adapter, ledger } = fixture(t);
  adapter.claim = async () => {
    adapter.calls++;
    adapter.balance = '2001';
    return { status: 'confirmed', transactionId: tx, fee: '5' };
  };
  assert.equal((await service.ensureFunded()).state, 'policy_breach');
  assert.equal(ledger.get(service.id).fee, '5');
  assert.equal(ledger.get(service.id).reserved, '0');
  assert.equal((await service.ensureFunded()).state, 'policy_breach');
  assert.equal(adapter.calls, 1);
});
for (const [name, modify, expected] of [
  ['empty', { faucetBalance: '0' }, 'empty'],
  ['positive but insufficient', { faucetBalance: '99' }, 'empty'],
  ['missing faucet', { faucetBalance: null }, 'missing_faucet'],
  ['already claimed', { eligible: false }, 'ineligible'],
  ['unknown eligibility', { eligible: null }, 'eligibility_unknown'],
  ['oversized fixed claim', { claimAmount: '3000', faucetBalance: '3000' }, 'claim_exceeds_cap'],
  ['wrong network', { network: 'mainnet' }, 'failed'],
  ['wrong resource', { resource: 'wrong' }, 'failed'],
  ['wrong instance', { instance: 'reset-genesis' }, 'failed'],
  ['expired or revoked credentials', { authenticated: false }, 'failed'],
  ['wrong owner', { owned: false }, 'failed'],
  ['unverified existing funding origin', { spendable: '50', fundingOrigin: 'unknown' }, 'failed'],
])
  test(`${name} sends zero mutations`, async (t) => {
    const { service, adapter } = fixture(t);
    const inspect = adapter.inspect.bind(adapter);
    adapter.inspect = async () => ({ ...(await inspect()), ...modify });
    assert.equal((await service.ensureFunded()).state, expected);
    assert.equal(adapter.calls, 0);
  });
test('concurrent ledger connections reserve one claim across purposes', async (t) => {
  const { service, adapter, path } = fixture(t);
  const second = new FundingLedger(path);
  t.after(() => second.close());
  const other = new FundingService({ ...policy, purpose: 'reward-tests' }, second, adapter);
  await Promise.all([service.ensureFunded(), other.ensureFunded()]);
  assert.equal(adapter.calls, 1);
});
test('timeout without transaction ID persists unknown through reopen; reconcile never resubmits', async (t) => {
  const { service, ledger, adapter, path } = fixture(
    t,
    {},
    {
      async claim() {
        this.calls++;
        throw new Error('secret-token-and-private-address');
      },
    },
  );
  assert.equal((await service.ensureFunded()).state, 'unknown');
  assert.equal(ledger.get(service.id).reserved, '10');
  const reopened = new FundingLedger(path);
  t.after(() => reopened.close());
  const restarted = new FundingService(policy, reopened, adapter);
  assert.equal((await restarted.ensureFunded()).state, 'unknown');
  assert.equal((await restarted.reconcile()).state, 'funded');
  assert.equal(adapter.calls, 1);
  assert(!JSON.stringify(restarted.summary()).includes('secret'));
});
test('pending and malformed responses are never treated as success or retried', async (t) => {
  const { service, adapter } = fixture(
    t,
    {},
    {
      async claim() {
        this.calls++;
        return { status: 'pending', transactionId: tx };
      },
    },
  );
  assert.equal((await service.ensureFunded()).state, 'pending');
  adapter.reconcile = async () => ({ status: 'confirmed', transactionId: tx, fee: 5 });
  assert.equal((await service.reconcile()).state, 'unknown');
  await service.ensureFunded();
  assert.equal(adapter.calls, 1);
});
test('known rejection accounts fees and prohibits second claim', async (t) => {
  const { service, adapter, ledger } = fixture(
    t,
    {},
    {
      async claim() {
        this.calls++;
        return { status: 'rejected', transactionId: tx, fee: '3' };
      },
    },
  );
  assert.equal((await service.ensureFunded()).state, 'rejected');
  assert.equal(ledger.get(service.id).fee, '3');
  assert.equal((await service.ensureFunded()).state, 'ineligible');
  assert.equal(adapter.calls, 1);
});
test('over-cap actual fees persist breach and block further mutations', async (t) => {
  const { service, adapter, ledger } = fixture(
    t,
    {},
    {
      async claim() {
        this.calls++;
        return { status: 'confirmed', transactionId: tx, fee: '11' };
      },
    },
  );
  assert.equal((await service.ensureFunded()).state, 'policy_breach');
  assert.equal(ledger.get(service.id).fee, '11');
  await service.ensureFunded();
  assert.equal(adapter.calls, 1);
});
test('confirmed transaction without sufficient refreshed funds is not funded', async (t) => {
  const { service } = fixture(
    t,
    {},
    {
      async claim() {
        this.calls++;
        return { status: 'confirmed', transactionId: tx, fee: '5' };
      },
    },
  );
  assert.equal((await service.ensureFunded()).state, 'insufficient_after_claim');
});
test('daily reservations include unresolved claims from previous day', async (t) => {
  const { service, adapter, ledger } = fixture(
    t,
    { runCap: '10', dailyCap: '10' },
    {
      async claim() {
        this.calls++;
        throw new Error('timeout');
      },
    },
  );
  await service.ensureFunded();
  ledger.save(service.id, { day: '2000-01-01' });
  const other = new FundingService(
    { ...policy, account: 'receiver', runId: 'run-2', runCap: '10', dailyCap: '10' },
    ledger,
    adapter,
  );
  assert.equal((await other.ensureFunded()).state, 'budget_exhausted');
  assert.equal(adapter.calls, 1);
});
test('per-run claim count is shared between distinct accounts', async (t) => {
  const { service, ledger, adapter } = fixture(t);
  await service.ensureFunded();
  adapter.balance = '0';
  const other = new FundingService({ ...policy, account: 'receiver' }, ledger, adapter);
  assert.equal((await other.ensureFunded()).state, 'budget_exhausted');
  assert.equal(adapter.calls, 1);
});
test('stopped-worker recovery preserves uncertainty rather than retrying mutation', async (t) => {
  const { service, ledger, adapter } = fixture(t);
  await service.ensureFunded();
  ledger.save(service.id, { state: 'claiming', owner: 'crashed-worker', reserved: '10' });
  assert.equal((await service.ensureFunded()).state, 'claiming');
  assert.equal(service.recoverStoppedWorker().state, 'unknown');
  await service.ensureFunded();
  assert.equal(adapter.calls, 1);
});
test('mainnet policy rejects faucet paths before any adapter calls; treasury requests require separate provider', async (t) => {
  assert.throws(
    () => validatePolicy({ ...policy, network: 'mainnet', provider: 'public-faucet' }),
    /MAINNET_FAUCET/,
  );
  assert.throws(
    () =>
      validatePolicy({
        ...policy,
        network: 'mainnet',
        provider: 'treasury',
        faucetTokenFile: '/secret',
      }),
    /MAINNET_FAUCET/,
  );
  const { service, adapter } = fixture(t, { network: 'mainnet', provider: 'treasury' });
  assert.equal((await service.ensureFunded()).state, 'treasury_required');
  assert.equal(adapter.calls, 0);
});
test('integer and policy boundaries reject float, overflow, overprecision, leading zero and inconsistent caps', () => {
  for (const value of ['1.1', '-1', '01', 1, '18446744073709551616'])
    assert.throws(() => units(value));
  assert.throws(() => validatePolicy({ ...policy, hotCap: '49' }));
  assert.throws(() => validatePolicy({ ...policy, maxClaims: 2 }));
});

test('infrastructure read failure is distinct from authentication or malformed snapshot failure', async (t) => {
  const { service, adapter } = fixture(
    t,
    {},
    {
      async inspect() {
        const error = new Error('unreachable');
        error.code = 'NETWORK_UNAVAILABLE';
        throw error;
      },
    },
  );
  assert.equal((await service.ensureFunded()).state, 'unavailable');
  adapter.inspect = async () => {
    throw new Error('private-authentication-diagnostics');
  };
  assert.equal((await service.ensureFunded()).state, 'failed');
  assert.equal(adapter.calls, 0);
});

test('reconciliation cannot replace a reserved transaction with a different transaction', async (t) => {
  const { service, adapter, ledger } = fixture(
    t,
    {},
    {
      async claim() {
        this.calls++;
        return { status: 'pending', transactionId: tx };
      },
    },
  );
  await service.ensureFunded();
  adapter.reconcile = async () => ({
    status: 'confirmed',
    transactionId: 'b'.repeat(64),
    fee: '1',
  });
  assert.equal((await service.reconcile()).state, 'unknown');
  assert.equal(ledger.get(service.id).tx, tx);
  assert.equal(ledger.get(service.id).reserved, '10');
});

test('environment mapping selects purpose account, fails closed, and keeps automation off by default', () => {
  const env = {
    APP_ENV: 'ci',
    NETWORK: 'localnet',
    NETWORK_INSTANCE_ID: 'local-genesis',
    EXPECTED_NATIVE_RESOURCE: 'native',
    FUNDING_PURPOSE: 'ci',
    CI_RESERVE_ACCOUNT: 'ci-account',
    FUNDING_RUN_ID: 'run',
    FUNDING_PROVIDER: 'local-faucet',
    FAUCET_ENABLED: 'true',
    FAUCET_MAX_FEE_BASE_UNITS: '10',
    MAX_RUN_SPEND_BASE_UNITS: '20',
    MAX_DAILY_SPEND_BASE_UNITS: '30',
    CI_LOW_WATERMARK: '50',
    TARGET_BALANCE: '50',
    HOT_WALLET_CAP: '2000',
  };
  const mapped = policyFromEnv(env);
  assert.equal(mapped.account, 'ci-account');
  assert.equal(mapped.enabled, false);
  assert.throws(() => policyFromEnv({ ...env, FAUCET_ENABLED: 'false' }), /FAUCET_DISABLED/);
  assert.throws(() => policyFromEnv({ ...env, FUNDING_AUTOMATION_ENABLED: '1' }));
  assert.throws(
    () => policyFromEnv({ ...env, NETWORK: 'mainnet', FUNDING_PROVIDER: 'treasury' }),
    /MAINNET_FAUCET/,
  );
});
