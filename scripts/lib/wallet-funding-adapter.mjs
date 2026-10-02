// v0.43.0 local bootstrap adapter. Public deployment identity/provenance support is a separate gate.
import { units, validatePolicy } from './funding.mjs';

export const NATIVE_RESOURCE = `resource_${'01'.repeat(32)}`;
export const FAUCET_COMPONENT = `component_010203${'00'.repeat(29)}`;
function fail(code = 'WALLET_SHAPE_MISMATCH') {
  throw Object.assign(new Error(code), { code });
}
export function exactRpcUnits(value) {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) fail('UNSAFE_RPC_AMOUNT');
    value = String(value);
  }
  units(value);
  return value;
}
export function finalizedFunding(transactionId, result, status) {
  if (!/^[a-f0-9]{64}$/.test(transactionId ?? '')) return { status: 'unknown' };
  if (['New', 'Pending'].includes(status)) return { status: 'pending', transactionId };
  if (!result || result.transaction_hash !== transactionId)
    return { status: 'unknown', transactionId };
  const outcome = result.result;
  const accepted = status === 'Accepted' && outcome && Object.hasOwn(outcome, 'Accept');
  const rejected =
    ['Rejected', 'OnlyFeeAccepted'].includes(status) &&
    outcome &&
    (Object.hasOwn(outcome, 'Reject') || Object.hasOwn(outcome, 'AcceptFeeRejectRest'));
  if (!accepted && !rejected) return { status: 'unknown', transactionId };
  // The claim response's top-level fee is max_fee, not settled expenditure.
  const fee = exactRpcUnits(result.fee_receipt?.total_fees_paid);
  return { status: accepted ? 'confirmed' : 'rejected', transactionId, fee };
}
export function isFaucetClaim(row) {
  return (
    row?.is_dry_run === false &&
    Array.isArray(row.finalize?.events) &&
    row.finalize.events.some(
      (event) => event.substate_id === FAUCET_COMPONENT && event.topic === 'XtrFaucet.take',
    )
  );
}
export class WalletFundingAdapter {
  constructor({ policy, rpc, witness }) {
    this.policy = validatePolicy(policy);
    if (this.policy.network !== 'localnet' || this.policy.provider !== 'local-faucet')
      fail('LOCAL_BOOTSTRAP_ONLY');
    if (!/^component_[a-f0-9]{64}$/.test(this.policy.account) || typeof witness !== 'function')
      fail('CANONICAL_ACCOUNT_WITNESS_REQUIRED');
    this.rpc = rpc;
    this.witness = witness;
  }
  async history() {
    const body = await this.rpc.call('transactions.get_all', {
      account: this.policy.account,
      status: null,
    });
    if (!Array.isArray(body?.transactions)) fail();
    return body.transactions;
  }
  async inspect(account) {
    if (account !== this.policy.account) fail('ACCOUNT_MISMATCH');
    const identity = await this.witness();
    if (
      identity.network !== 'localnet' ||
      identity.instance !== this.policy.instance ||
      identity.resource !== NATIVE_RESOURCE ||
      identity.resource !== this.policy.resource ||
      identity.divisibility !== 6
    )
      fail('NETWORK_RESOURCE_MISMATCH');
    const info = await this.rpc.call('wallet.get_info');
    if (info.network !== 'localnet' || info.network_byte !== 16 || info.version !== '0.43.0')
      fail('WALLET_VERSION_NETWORK_MISMATCH');
    const owned = (await this.rpc.call('accounts.get', { name_or_address: account })).account;
    if (owned?.component_address !== account || !owned.owner_key_id) fail('ACCOUNT_AUTH_REQUIRED');
    const body = await this.rpc.call('accounts.get_balances', {
      account,
      refresh: owned.is_confirmed_on_chain === true,
    });
    if (body.address !== account || !Array.isArray(body.balances)) fail();
    let spendable = 0n;
    for (const entry of body.balances.filter((e) => e.resource_address === NATIVE_RESOURCE)) {
      if (
        entry.resource_type !== 'Stealth' ||
        entry.divisibility !== 6 ||
        units(exactRpcUnits(entry.confidential_balance)) !== 0n
      )
        fail('UNSUPPORTED_BOOTSTRAP_INPUT_CLASS');
      spendable += units(exactRpcUnits(entry.balance));
    }
    const history = await this.history();
    const claims = history.filter(isFaucetClaim);
    let origin = 'unknown';
    if (history.length === 1 && claims.length === 1) {
      const claim = claims[0];
      const settled = finalizedFunding(claim.id, claim.finalize, claim.status);
      if (settled.status === 'confirmed' && spendable <= 1000000000n - units(settled.fee))
        origin = 'faucet';
    }
    const faucet = await this.rpc.call('accounts.get_faucet_balance');
    const claimAmount = exactRpcUnits(faucet.claim_amount);
    if (claimAmount !== '1000000000') fail('FAUCET_AMOUNT_MISMATCH');
    return {
      network: identity.network,
      instance: identity.instance,
      resource: identity.resource,
      owned: true,
      authenticated: true,
      spendable: spendable.toString(),
      fundingOrigin: origin,
      faucetBalance: exactRpcUnits(faucet.balance),
      claimAmount,
      eligible: claims.length
        ? false
        : !owned.is_confirmed_on_chain && history.length === 0
          ? true
          : null,
    };
  }
  async claim({ account, maxFee }) {
    if (account !== this.policy.account || maxFee !== this.policy.maxFee)
      fail('UNAPPROVED_FUNDING_REQUEST');
    const body = await this.rpc.call('accounts.create_free_test_coins', {
      account: { ComponentAddress: account },
      max_fee: maxFee,
    });
    if (body.account?.component_address !== account || exactRpcUnits(body.amount) !== '1000000000')
      return { status: 'unknown' };
    const settled = finalizedFunding(body.transaction_id, body.result, 'Accepted');
    if (
      settled.status !== 'confirmed' ||
      !isFaucetClaim({ is_dry_run: false, finalize: body.result })
    )
      return { status: 'unknown', transactionId: body.transaction_id };
    return settled;
  }
  async reconcile(record) {
    const history = await this.history();
    const candidates = history.filter((row) =>
      record.tx ? row.id === record.tx : isFaucetClaim(row),
    );
    if (candidates.length !== 1) return { status: 'unknown' };
    const row = candidates[0];
    // Known transaction must also be a finalized faucet claim; other account-linked operations cannot clear uncertainty.
    if (!isFaucetClaim(row)) return { status: 'unknown', transactionId: row.id };
    return finalizedFunding(row.id, row.finalize, row.status);
  }
}
