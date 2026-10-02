import { configuration } from '../api/config.mjs';
import { database } from '../api/db.mjs';
import { configuredWallet } from './wallet.mjs';
import { Worker } from './worker.mjs';
const config = await configuration(),
  db = database(config.databaseUrl);
await db.migrate();
const wallet = await configuredWallet(config);
if (!wallet) throw new Error('WALLET_SETTINGS_REQUIRED');
const worker = new Worker(db, config, wallet);
let stopping = false;
process.on('SIGTERM', () => {
  stopping = true;
});
while (!stopping) {
  try {
    await worker.tick();
  } catch {
    console.log(JSON.stringify({ event: 'worker_dependency_unavailable' }));
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
await db.close();
