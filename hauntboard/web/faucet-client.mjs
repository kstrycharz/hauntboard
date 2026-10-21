const terminal = new Set(['confirmed', 'rejected', 'failed']);
const statuses = new Set(['unknown', 'queued', 'prepared', 'pending', 'uncertain', ...terminal]);
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

export class FaucetClient {
  constructor({api, storage = localStorage, locks = navigator.locks, now = Date.now, newReceipt = () => crypto.randomUUID()}) {
    Object.assign(this, {api, storage, locks, now, newReceipt});
  }
  key(config, address) { return `hauntboard-faucet:v1:${config.network}:${config.resetIdentity}:${address}`; }
  read(config, address) {
    const raw = this.storage.getItem(this.key(config, address));
    if (!raw) return null;
    let record;
    try { record = JSON.parse(raw); } catch { throw new Error('Your saved faucet receipt cannot be read. Keep this browser data and check incoming funds before requesting again.'); }
    if (!uuid.test(record.receipt ?? '') || record.address !== address || record.amountTokens !== 100 || !statuses.has(record.status))
      throw new Error('Your saved faucet receipt is invalid. Check incoming funds before requesting again.');
    return record;
  }
  async run(config, address, request = false) {
    if (!config.faucetEnabled) throw new Error('In-app funding is unavailable. Use the TariTracker faucet link.');
    const key = this.key(config, address);
    return this.locks.request(key, async () => {
      let record = this.read(config, address);
      if (!request && (!record || terminal.has(record.status) || record.retryAt > this.now())) return record;
      if (request && record && terminal.has(record.status) && record.createdAt + 3600000 > this.now()) return record;
      if (request && (!record || terminal.has(record.status))) {
        record = {receipt: this.newReceipt(), address, amountTokens: 100, status: 'unknown', createdAt: this.now(), retryAt: 0, failures: 0};
        // If storage fails, stop here; never send an unrecorded withdrawal.
        this.storage.setItem(key, JSON.stringify(record));
      }
      if (record.retryAt > this.now()) return record;
      try {
        const data = await this.api(request && record.status === 'unknown' ? '/api/faucet-claim' : '/api/faucet-status', request && record.status === 'unknown' ? {receipt: record.receipt, address, amountTokens: 100} : {receipt: record.receipt});
        if (data.receipt !== record.receipt || !statuses.has(data.status)) throw new Error('Unexpected funding response. Keep the same receipt and check again.');
        record = {...record, status: data.status, transactionId: data.transactionId, retryAt: this.now() + 4000, failures: 0, error: null};
      } catch (error) {
        record.failures = (record.failures ?? 0) + 1;
        const retry = /^\d+$/.test(error.retryAfter ?? '') ? Number(error.retryAfter) * 1000 : Math.min(60000, 4000 * 2 ** Math.min(record.failures, 4));
        record.retryAt = this.now() + Math.max(4000, retry);
        record.error = error.message;
      }
      this.storage.setItem(key, JSON.stringify(record));
      return record;
    });
  }
}

export function faucetMessage(record) {
  if (!record) return 'Request 100 test tXTR for this wallet. One withdrawal per wallet owner per hour; shared faucet limits apply.';
  if (record.error) return `${record.error} Your receipt is saved. Check this request before starting another withdrawal.`;
  return {
    unknown: 'Payment is not confirmed. Retry this saved request using the same receipt.',
    queued: 'Your request is queued. Waiting for the faucet to prepare payment…',
    prepared: 'Payment is prepared. Waiting for chain confirmation…',
    pending: 'Payment was submitted. Waiting for chain confirmation…',
    uncertain: 'The faucet is reconciling the original payment. Keep checking; do not create a replacement request.',
    confirmed: '100 test tXTR confirmed. Checking for incoming funds; your wallet must scan the output before the balance updates.',
    rejected: 'The payment was rejected. No replacement was sent automatically. Check incoming funds before trying again.',
    failed: 'The request failed before payment preparation. No replacement was sent automatically.',
  }[record.status];
}
