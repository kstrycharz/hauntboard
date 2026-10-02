// Hardcoded read allowlist. No fund, account-create, seed-export, signing, or submit methods.
import { mkdir, writeFile } from 'node:fs/promises';
const methods = new Set([
  'wallet.get_info',
  'accounts.list',
  'auth.request',
  'accounts.get_faucet_balance',
  'settings.get',
]);
async function rpc(role, method, params, token) {
  if (!methods.has(method)) throw new Error('Disallowed probe method');
  let response;
  try {
    response = await fetch(`http://${role}:5100/json_rpc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    return { error: 'wallet-read-unavailable' };
  }
  if (!response.ok) return { error: `HTTP ${response.status}` };
  const body = await response.json();
  if (body.error)
    return {
      error: `RPC error ${body.error.code}`,
      category: /not found|not_found|does not exist|404/i.test(body.error.message)
        ? 'not-found'
        : /decode|deserialize|invalid type/i.test(body.error.message)
          ? 'shape-mismatch'
          : /connect|timeout|unreachable/i.test(body.error.message)
            ? 'indexer-unavailable'
            : 'unclassified-rpc-failure',
    };
  return body.result;
}
const results = {
  inspectedAt: new Date().toISOString(),
  status: 'UNFUNDED_READ_ONLY_PREFLIGHT_NOT_M2_COMPLETION',
  wallets: [],
};
for (const role of ['sender', 'receiver']) {
  const info = await rpc(role, 'wallet.get_info', {});
  const unauthenticated = await rpc(role, 'accounts.list', { offset: 0, limit: 10 });
  const session = await rpc(role, 'auth.request', {
    permissions: [{ Accounts: ['Read', null] }, { Substates: 'Read' }, { Settings: 'Read' }],
    credentials: 'None',
  });
  const accounts = session.token
    ? await rpc(role, 'accounts.list', { offset: 0, limit: 10 }, session.token)
    : { error: session.error };
  const faucet = session.token
    ? await rpc(role, 'accounts.get_faucet_balance', {}, session.token)
    : { error: session.error };
  const settings = session.token
    ? await rpc(role, 'settings.get', {}, session.token)
    : { error: session.error };
  // Do not export addresses, keys, balance amounts, or full RPC bodies.
  results.wallets.push({
    role,
    info,
    unauthenticatedAccountRead: unauthenticated.error ?? 'unexpected-success',
    accountCount: accounts.accounts?.length ?? null,
    accountReadError: accounts.error ?? null,
    faucetState: faucet.error
      ? faucet.error
      : BigInt(faucet.balance ?? 0) === 0n
        ? 'empty'
        : 'non-empty',
    faucetErrorCategory: faucet.category ?? null,
    configuredIndexer: settings.indexer_url ?? null,
    currentEpoch: settings.current_epoch ?? null,
  });
}
await mkdir('docs/evidence/m2', { recursive: true });
await writeFile(
  process.argv.includes('--post-restart')
    ? 'docs/evidence/m2/wallet-restart.json'
    : 'docs/evidence/m2/wallet-preflight.json',
  JSON.stringify(results, null, 2) + '\n',
);
console.log(JSON.stringify(results, null, 2));
