// Internal, one-shot local bootstrap/reconcile job. Public/mainnet execution remains disabled.
import { mkdir } from 'node:fs/promises';
import { FundingLedger, FundingService, policyFromEnv } from './lib/funding.mjs';
import { FundingRpc } from './lib/wallet-rpc.mjs';
import { WalletFundingAdapter } from './lib/wallet-funding-adapter.mjs';
import { localNetworkWitness } from './lib/local-network-witness.mjs';
process.umask(0o077);
let ledger;
try {
  const policy = policyFromEnv(process.env);
  const action = process.env.FUNDING_ACTION ?? 'inspect';
  if (!['inspect', 'bootstrap', 'reconcile'].includes(action)) throw new Error('INVALID_ACTION');
  if (!policy.enabled || policy.provider === 'disabled' || policy.provider === 'treasury') {
    console.log(
      JSON.stringify({
        status: 'ACTION_REQUIRED',
        state: policy.provider === 'treasury' ? 'treasury_required' : 'disabled',
        execution: 'NOT_SUBMITTED',
      }),
    );
  } else {
    const rpc = new FundingRpc({
      policy,
      endpoint: process.env.WALLET_RPC_URL,
      tokenFile: policy.faucetTokenFile,
    });
    const adapter = new WalletFundingAdapter({ policy, rpc, witness: localNetworkWitness });
    if (action === 'inspect') {
      const snapshot = await adapter.inspect(policy.account);
      console.log(
        JSON.stringify({
          status: 'FUNDING_INSPECTED',
          execution: 'NOT_SUBMITTED',
          eligible: snapshot.eligible,
        }),
      );
    } else {
      await mkdir('/private', { recursive: true, mode: 0o700 });
      ledger = new FundingLedger('/private/funding.sqlite');
      const service = new FundingService(policy, ledger, adapter);
      const result = await (action === 'reconcile' ? service.reconcile() : service.ensureFunded());
      console.log(JSON.stringify(result));
      if (result.status !== 'READY') process.exitCode = 1;
    }
  }
} catch {
  console.error(JSON.stringify({ status: 'FAILED', state: 'configuration_or_wallet_failure' }));
  process.exitCode = 1;
} finally {
  ledger?.close();
}
