// Funding-only RPC transport. Credentials and raw upstream errors are never returned/logged.
import { readFile } from 'node:fs/promises';
import { validatePolicy } from './funding.mjs';

const reads = new Set([
  'wallet.get_info',
  'accounts.get_faucet_balance',
  'accounts.get_balances',
  'accounts.get',
  'transactions.get',
  'transactions.get_all',
]);
const mutations = new Set(['accounts.create_free_test_coins']);
export class WalletRpcError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}
export class FundingRpc {
  constructor({
    policy,
    endpoint,
    tokenFile,
    fetchImpl = fetch,
    timeoutMs = 15000,
    readAttempts = 3,
  }) {
    this.policy = validatePolicy(policy);
    const url = new URL(endpoint);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new WalletRpcError('INVALID_RPC_ENDPOINT');
    if (this.policy.network === 'mainnet' || !this.policy.provider.endsWith('faucet'))
      throw new WalletRpcError('FAUCET_RPC_FORBIDDEN');
    if (
      typeof tokenFile !== 'string' ||
      !tokenFile ||
      !Number.isInteger(readAttempts) ||
      readAttempts < 1 ||
      readAttempts > 3 ||
      !Number.isInteger(timeoutMs) ||
      timeoutMs < 1 ||
      timeoutMs > 15000
    )
      throw new WalletRpcError('INVALID_RPC_OPTIONS');
    this.endpoint = url.toString();
    this.tokenFile = tokenFile;
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.readAttempts = readAttempts;
  }
  async call(method, params = {}) {
    if (!reads.has(method) && !mutations.has(method))
      throw new WalletRpcError('RPC_METHOD_FORBIDDEN');
    if (
      mutations.has(method) &&
      (!this.policy.enabled ||
        !(
          params.account === this.policy.account ||
          (params.account &&
            Object.keys(params.account).length === 1 &&
            params.account.ComponentAddress === this.policy.account)
        ) ||
        params.max_fee !== this.policy.maxFee)
    )
      throw new WalletRpcError('UNAPPROVED_FUNDING_REQUEST');
    let token;
    try {
      token = (await readFile(this.tokenFile, 'utf8')).trim();
    } catch {
      throw new WalletRpcError('CREDENTIAL_UNAVAILABLE');
    }
    if (!token || /[\r\n]/.test(token)) throw new WalletRpcError('CREDENTIAL_UNAVAILABLE');
    const attempts = reads.has(method) ? this.readAttempts : 1;
    for (let attempt = 0; attempt < attempts; attempt++) {
      let response;
      try {
        response = await this.fetch(this.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
          signal: AbortSignal.timeout(this.timeoutMs),
          redirect: 'error',
        });
      } catch {
        if (attempt + 1 < attempts) {
          await new Promise((r) => setTimeout(r, 100 + Math.floor(Math.random() * 100)));
          continue;
        }
        throw new WalletRpcError('NETWORK_UNAVAILABLE');
      }
      if (response.status === 401 || response.status === 403)
        throw new WalletRpcError('AUTHENTICATION_FAILED');
      if (!response.ok)
        throw new WalletRpcError(
          response.status >= 500 ? 'NETWORK_UNAVAILABLE' : 'RPC_REQUEST_FAILED',
        );
      let body;
      try {
        body = await response.json();
      } catch {
        throw new WalletRpcError('RPC_SHAPE_MISMATCH');
      }
      if (body.error) {
        if ([401, 403].includes(body.error.code)) throw new WalletRpcError('AUTHENTICATION_FAILED');
        // Exact released faucet error codes are mapped after runtime validation, not guessed from text.
        throw new WalletRpcError('RPC_REJECTED');
      }
      if (body.jsonrpc !== '2.0' || body.id !== 1 || !Object.hasOwn(body, 'result'))
        throw new WalletRpcError('RPC_SHAPE_MISMATCH');
      return body.result;
    }
  }
}
