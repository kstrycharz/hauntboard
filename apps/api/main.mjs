import { configuration } from './config.mjs';
import { database } from './db.mjs';
import { createApp } from './server.mjs';
import { configuredWallet } from '../worker/wallet.mjs';
const config = await configuration();
const db = database(config.databaseUrl);
await db.migrate();
const app = await createApp(db, config, await configuredWallet(config));
await app.listen({ host: '0.0.0.0', port: 3000 });
process.on('SIGTERM', async () => {
  await app.close();
  await db.close();
});
