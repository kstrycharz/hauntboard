// Test-only virtual passkeys authenticate isolated local wallets. Never run against public wallets.
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { openLocalWallet } from './lib/local-test-auth.mjs';
import { localNetworkWitness } from './lib/local-network-witness.mjs';
import { writePrivateJson } from './lib/private-json.mjs';
const browser = await chromium.launch();
let stopping = false;
process.on('SIGTERM', () => {
  stopping = true;
});
process.on('SIGINT', () => {
  stopping = true;
});
try {
  const witness = await localNetworkWitness();
  const deployment = JSON.parse(await readFile('/private/app-receipt-config.json', 'utf8'));
  if (deployment.instance !== witness.instance || deployment.network !== 'localnet')
    throw new Error('LOCAL_DEPLOYMENT_INSTANCE_MISMATCH');
  while (!stopping) {
    const wallets = [];
    try {
      for (const role of ['sender', 'receiver'])
        wallets.push(await openLocalWallet(browser, role, '/private'));
      await writePrivateJson('/private/app-wallet-settings.json', {
        ...deployment,
        reward: {
          account: wallets[1].account.component_address,
          rpcUrl: 'http://receiver:5100/json_rpc',
          tokenFile: '/private/receiver-token',
        },
      });
      // Token renewal is shorter than the ten-minute local CI API-key expiration.
      const until = Date.now() + 480000;
      while (!stopping && Date.now() < until)
        await new Promise((resolve) => setTimeout(resolve, 1000));
    } finally {
      for (const wallet of wallets) {
        try {
          await wallet.close();
        } catch {
          console.log(
            JSON.stringify({
              event: 'local_ci_api_key_expiration_cleanup',
              boundedExpirySeconds: 600,
            }),
          );
        }
      }
    }
  }
} finally {
  await browser.close();
}
