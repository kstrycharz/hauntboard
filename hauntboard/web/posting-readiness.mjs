// Shared browser-wallet policy. Output provenance is retained across policy changes.
export const POSTING_FEE_LIMIT = 1000000n;
export const postingPolicy = material => material?.postingPolicy === 'standard' ? 'standard' : 'isolated';
export const eligibleCoin = (coin, policy) => coin.state === 'ready' || (policy === 'standard' && coin.state === 'quarantined');

export function fundsReadiness(balance, { incomplete = false } = {}) {
  if (!balance || balance.unavailable) return {code: 'provider-unavailable', message: 'The balance check could not finish. Your last verified funds and draft are kept. Try Check posting funds again.', action: 'sync'};
  if (balance.pendingOperation) return {code:'pending-operation',message:'Your saved submission is still being checked. Your tokens may be reserved for it. Check its status; you do not need to post again.',action:'status'};
  if (BigInt(balance.ready ?? 0) > 0n) return {code: 'ready', message: 'Ready to post using your test tokens. Post or Reply checks the fee and submits your message.', action: null};
  if (BigInt(balance.reserved ?? 0) > 0n) return {code: 'pending-operation', message: 'Your funds belong to a submission that is still being checked. Check its status before posting again.', action: 'status'};
  if (BigInt(balance.quarantined ?? 0) > 0n && balance.postingPolicy !== 'standard') return {code: 'change-held', message: 'You still own these tokens. Your posting setting holds them aside after a post. Enable remaining tokens to use them for replies and later posts.', action: 'policy'};
  if (BigInt(balance.revealed ?? 0) > 0n) return {code: 'preparation-needed', message: 'Your tokens are in a standard account. Prepare posting funds to use them here; you will see the preparation fee before confirming.', action: 'prepare'};
  if (balance.discoveryCapacityReached) return {code: 'capacity-reached', message: 'Your wallet has reached its tracked-funds limit. Existing operations must be checked before more funds can be imported.', action: 'wallet'};
  if (incomplete || balance.discoveryUnavailable || balance.discoveryHistoryIncomplete) return {code: 'checking', message: 'Still checking for received tokens. Your draft is kept; the check will continue automatically.', action: 'sync'};
  return {code: 'funding-needed', message: 'No usable test tokens have been found in this wallet. Get free test tokens or check for incoming funds.', action: 'fund'};
}

export function postingFee(required, value) {
  const cost = BigInt(required), available = BigInt(value);
  const fee = cost + (cost + 4n) / 5n + 1000n;
  if (cost <= 0n || fee > POSTING_FEE_LIMIT) throw Object.assign(new Error('This post exceeds the 1 test TARI network-fee limit. Your post has not been submitted.'), {code: 'fee-limit'});
  if (fee >= available) throw Object.assign(new Error('The available posting input cannot cover this post and its change. Prepare posting funds or receive more test tokens.'), {code: 'insufficient-eligible-funds'});
  return fee;
}
