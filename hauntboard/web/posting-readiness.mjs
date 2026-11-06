// Shared browser-wallet policy. Output provenance is retained across policy changes.
export const POSTING_FEE_LIMIT = 1000000n;
export const postingPolicy = material => material?.postingPolicy === 'standard' ? 'standard' : 'isolated';
export const eligibleCoin = (coin, policy) => coin.state === 'ready' || (policy === 'standard' && coin.state === 'quarantined');

export function fundsReadiness(balance, { incomplete = false } = {}) {
  if (!balance || balance.unavailable) return {code: 'provider-unavailable', message: 'We could not check your funds right now. Displayed amounts are from the last successful check.', action: 'sync'};
  if (BigInt(balance.ready ?? 0) > 0n) return {code: 'ready', message: 'Funds are available. Post will check the exact network fee before submitting.', action: null};
  if (BigInt(balance.reserved ?? 0) > 0n) return {code: 'pending-operation', message: 'Your funds belong to a submission that is still being checked. Check its status before posting again.', action: 'status'};
  if (BigInt(balance.quarantined ?? 0) > 0n && balance.postingPolicy !== 'standard') return {code: 'change-held', message: 'You still own these tokens. Your current setting holds the remaining tokens aside to reduce links between posts.', action: 'policy'};
  if (BigInt(balance.revealed ?? 0) > 0n) return {code: 'preparation-needed', message: 'Your tokens are in a standard account. Prepare posting funds to use them here; you will see the preparation fee before confirming.', action: 'prepare'};
  if (balance.discoveryCapacityReached) return {code: 'capacity-reached', message: 'Your wallet has reached its tracked-funds limit. Existing operations must be checked before more funds can be imported.', action: 'wallet'};
  if (incomplete || balance.discoveryUnavailable || balance.discoveryHistoryIncomplete) return {code: 'checking', message: 'Still checking for incoming funds. The amount found so far may be incomplete.', action: 'sync'};
  return {code: 'funding-needed', message: 'No usable test tokens have been found in this wallet. Get free test tokens or check for incoming funds.', action: 'fund'};
}

export function postingFee(required, value) {
  const cost = BigInt(required), available = BigInt(value);
  const fee = cost + (cost + 4n) / 5n + 1000n;
  if (cost <= 0n || fee > POSTING_FEE_LIMIT) throw Object.assign(new Error('This post exceeds the 1 test TARI network-fee limit. Your post has not been submitted.'), {code: 'fee-limit'});
  if (fee >= available) throw Object.assign(new Error('The available posting input cannot cover this post and its change. Prepare posting funds or receive more test tokens.'), {code: 'insufficient-eligible-funds'});
  return fee;
}
