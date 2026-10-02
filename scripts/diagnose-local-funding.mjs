// Local-only schema diagnostics. No identifiers, amounts, arguments, credentials or raw errors.
import { chromium } from '@playwright/test';
import { openLocalWallet } from './lib/local-test-auth.mjs';
const browser = await chromium.launch();
let wallet;
try {
  wallet = await openLocalWallet(browser, 'sender', '/private');
  const { readFile } = await import('node:fs/promises');
  const response = await fetch('http://sender:5100/json_rpc', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${(await readFile(wallet.tokenFile, 'utf8')).trim()}`,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'transactions.get_all',
      params: { account: wallet.account.component_address, status: null },
    }),
  });
  const body = await response.json();
  console.log(
    JSON.stringify({
      rows: body.result?.transactions?.map((row) => ({
        status: row.status,
        keys: Object.keys(row),
        finalizeKeys: Object.keys(row.finalize ?? {}),
        outcomeKeys: Object.keys(row.finalize?.result ?? {}),
        feeKeys: Object.keys(row.finalize?.fee_receipt ?? {}),
        events: row.finalize?.events?.map((event) => ({
          keys: Object.keys(event),
          faucet: event.component_address === 'component_010203' + '00'.repeat(29),
          take: event.topic === 'take',
        })),
        transactionKeys: Object.keys(row.transaction ?? {}),
      })),
    }),
  );
} catch {
  console.log(JSON.stringify({ status: 'LOCAL_DIAGNOSTIC_FAILED' }));
  process.exitCode = 1;
} finally {
  if (wallet) await wallet.close();
  await browser.close();
}
