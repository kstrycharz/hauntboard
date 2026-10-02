import { chromium } from '@playwright/test';
import { openLocalWallet } from './lib/local-test-auth.mjs';
import assert from 'node:assert/strict';
import { FundingLedger, FundingService } from './lib/funding.mjs';
import { FundingRpc } from './lib/wallet-rpc.mjs';
import { WalletFundingAdapter } from './lib/wallet-funding-adapter.mjs';
import { localNetworkWitness } from './lib/local-network-witness.mjs';
import { writeFile, open, unlink } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const checks = {};
const evidencePath = 'docs/evidence/m2/local-funding.json';
await writeFile(evidencePath, JSON.stringify({ status: 'IN_PROGRESS_LOCAL_ONLY' }) + '\n');
const browser = await chromium.launch();
const wallets = [];
let lock;
try {
  lock = await open('/private/integration.lock', 'wx', 0o600);
  for (const role of ['sender', 'receiver']) {
    wallets.push(await openLocalWallet(browser, role, '/private'));
    checks[`${role}AuthenticatedOwnedAccount`] = true;
  }
  assert.notEqual(wallets[0].account.owner_public_key, wallets[1].account.owner_public_key);
  checks.independentOwnerKeys = true;
  const identity = await localNetworkWitness();
  for (const [index, role] of ['sender', 'receiver'].entries()) {
    const wallet = wallets[index];
    const policy = {
      environment: 'ci',
      network: 'localnet',
      instance: identity.instance,
      resource: identity.resource,
      account: wallet.account.component_address,
      purpose: 'ci',
      runId: 'local-bootstrap',
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
    const rpc = new FundingRpc({
      policy,
      endpoint: `http://${role}:5100/json_rpc`,
      tokenFile: wallet.tokenFile,
    });
    const adapter = new WalletFundingAdapter({ policy, rpc, witness: localNetworkWitness });
    const ledger = new FundingLedger('/private/funding.sqlite');
    try {
      const service = new FundingService(policy, ledger, adapter);
      let result = await service.ensureFunded();
      for (let attempt = 0; result.needsReconciliation && attempt < 12; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        result = await service.reconcile();
      }
      checks[`${role}FundingState`] = result.state;
      assert.equal(result.state, 'funded');
      assert.equal((await service.ensureFunded()).state, 'funded');
      checks[`${role}ReusesClaim`] = ledger.get(service.id).claim_attempts <= 1;
      const output = execFileSync(process.execPath, ['scripts/fund-wallet.mjs'], {
        env: {
          ...process.env,
          APP_ENV: 'ci',
          NETWORK: 'localnet',
          NETWORK_INSTANCE_ID: identity.instance,
          EXPECTED_NATIVE_RESOURCE: identity.resource,
          FUNDING_PURPOSE: 'ci',
          CI_RESERVE_ACCOUNT: policy.account,
          FUNDING_RUN_ID: policy.runId,
          FUNDING_PROVIDER: 'local-faucet',
          FAUCET_ENABLED: 'true',
          FUNDING_AUTOMATION_ENABLED: 'true',
          FAUCET_ADMIN_TOKEN_FILE: wallet.tokenFile,
          FAUCET_MAX_FEE_BASE_UNITS: policy.maxFee,
          MAX_RUN_SPEND_BASE_UNITS: policy.runCap,
          MAX_DAILY_SPEND_BASE_UNITS: policy.dailyCap,
          CI_LOW_WATERMARK: policy.requiredBalance,
          TARGET_BALANCE: policy.targetBalance,
          HOT_WALLET_CAP: policy.hotCap,
          MAX_PUBLIC_CLAIMS_PER_RUN: '2',
          FUNDING_ACTION: 'bootstrap',
          WALLET_RPC_URL: `http://${role}:5100/json_rpc`,
        },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      assert.equal(JSON.parse(output).state, 'funded');
      checks[`${role}OneShotJobReusesFunding`] = true;
    } finally {
      ledger.close();
    }
  }
  console.log(JSON.stringify({ status: 'LOCAL_AUTH_FAUCET_PASSED', checks }));
} catch (error) {
  console.error(
    JSON.stringify({
      status: 'LOCAL_INTEGRATION_FAILED',
      checks,
      code: ['LOCAL_AUTH_RPC_REJECTED', 'ERR_ASSERTION'].includes(error.code ?? error.message)
        ? (error.code ?? error.message)
        : 'LOCAL_SETUP_FAILED',
    }),
  );
  process.exitCode = 1;
} finally {
  for (const wallet of wallets) {
    try {
      await wallet.close();
    } catch {
      process.exitCode = 1;
    }
  }
  await browser.close();
  if (lock) {
    await lock.close();
    await unlink('/private/integration.lock');
  }
  await writeFile(
    evidencePath,
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        network: 'localnet',
        status: process.exitCode ? 'FAILED_LOCAL_FUNDING' : 'PASSED_LOCAL_WALLET_FAUCET',
        checks,
      },
      null,
      2,
    ) + '\n',
  );
}
