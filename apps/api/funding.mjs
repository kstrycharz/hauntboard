import { problem } from './security.mjs';
export function fundingService(db, config, wallet) {
  let cached = null,
    checked = 0;
  async function inspect() {
    if (!wallet?.fundingStatus)
      return {
        provider: config.network === 'localnet' ? 'local-faucet' : 'public-faucet',
        configured: false,
        receiptReady: false,
        rewardReady: false,
        reason: 'OPERATOR_WALLETS_NOT_CONNECTED',
      };
    try {
      const balances =
        cached && Date.now() - checked < 15000 ? cached : await wallet.fundingStatus();
      if (balances !== cached) {
        cached = balances;
        checked = Date.now();
      }
      const backlog = (
        await db.query(
          "SELECT count(*)::int AS count FROM jobs WHERE kind IN ('create_room','anchor','close_room') AND state IN ('queued','preparing','submitting','submitted','unknown')",
        )
      ).rows[0].count;
      const required = BigInt(config.maxFee) * BigInt(backlog + 1);
      return {
        ...balances,
        configured: true,
        receiptReady: BigInt(balances.receiptRevealed) >= required,
        rewardReady:
          BigInt(balances.rewardConcealed) >= BigInt(config.maxReward) + BigInt(config.maxFee),
        receiptReserve: required.toString(),
        provider: config.network === 'localnet' ? 'local-faucet' : 'public-faucet',
      };
    } catch {
      return {
        configured: true,
        receiptReady: false,
        rewardReady: false,
        provider: config.network === 'localnet' ? 'local-faucet' : 'public-faucet',
        reason: 'FUNDING_STATUS_UNAVAILABLE',
      };
    }
  }
  async function requireReceipt() {
    if (!(await inspect()).receiptReady) throw problem('RECEIPT_FUNDING_PAUSED', 503);
  }
  function publicStatus(status) {
    return {
      provider: status.provider,
      automationEnabled: false,
      operatorWalletsConnected: status.configured,
      receiptFundingReady: status.receiptReady,
      rewardFundingReady: status.rewardReady,
      reason:
        status.reason ??
        (!status.receiptReady
          ? 'RECEIPT_FUNDING_PAUSED'
          : !status.rewardReady
            ? 'REWARD_FUNDING_LOW'
            : null),
    };
  }
  return { inspect, requireReceipt, publicStatus };
}
