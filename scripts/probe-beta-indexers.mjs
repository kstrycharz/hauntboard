// Unauthenticated GET-only public infrastructure probe; never creates accounts or claims funds.
import { writeFile } from 'node:fs/promises';
import { validateBetaConfig } from './lib/beta-config.mjs';
const config = validateBetaConfig(process.env);
const results = await Promise.all(
  config.indexers.map(async (origin) => {
    try {
      const response = await fetch(`${origin}network`, {
        signal: AbortSignal.timeout(15000),
        redirect: 'error',
      });
      const body = await response.json();
      const matches =
        response.ok && body.network === config.network && body.network_byte === config.networkByte;
      return { origin, reachable: response.ok, networkMatches: matches };
    } catch {
      return { origin, reachable: false, networkMatches: false };
    }
  }),
);
const wallets = [];
if (process.argv.includes('--wallets')) {
  for (const role of ['receipt-wallet', 'reward-wallet']) {
    const port = role === 'receipt-wallet' ? 5101 : 5102;
    let matches = false;
    for (let attempt = 0; !matches && attempt < 12; attempt++) {
      try {
        const response = await fetch(`http://${role}:${port}/json_rpc`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'wallet.get_info', params: {} }),
          signal: AbortSignal.timeout(3000),
          redirect: 'error',
        });
        const body = await response.json();
        matches =
          response.ok &&
          body.result?.network === config.network &&
          body.result?.network_byte === config.networkByte &&
          body.result?.version === '0.43.0';
      } catch {
        /* Safe readiness reads only. */
      }
      if (!matches) await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    let unauthenticatedAccountReadBlocked = false;
    if (matches) {
      try {
        const response = await fetch(`http://${role}:${port}/json_rpc`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            method: 'accounts.list',
            params: { offset: 0, limit: 1 },
          }),
          signal: AbortSignal.timeout(3000),
          redirect: 'error',
        });
        unauthenticatedAccountReadBlocked =
          response.status === 401 || (await response.json()).error?.code === 401;
      } catch {
        /* Read failure is not authentication evidence. */
      }
    }
    wallets.push({ role, networkAndVersionMatches: matches, unauthenticatedAccountReadBlocked });
  }
}
const passed =
  results.every((r) => r.networkMatches) &&
  wallets.every((w) => w.networkAndVersionMatches && w.unauthenticatedAccountReadBlocked);
const result = {
  checkedAt: new Date().toISOString(),
  status: passed ? 'PASSED_READ_ONLY_BETA_INDEXERS' : 'FAILED_BETA_INDEXERS',
  network: config.network,
  indexers: results,
  wallets,
  scope:
    'Endpoint availability, network name/byte and optional wallet startup version only; not reset identity, faucet availability, funded compatibility or release acceptance.',
};
await writeFile('docs/evidence/m2/beta-indexers.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
if (!passed) process.exitCode = 1;
