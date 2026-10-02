// Generate independent production-beta unlock material only. No wallets or funds touched.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
process.umask(0o077);
await mkdir('secrets', { recursive: true, mode: 0o700 });
const values = [];
for (const role of ['receipt', 'reward']) {
  const path = `secrets/beta-${role}.toml`;
  try {
    values.push(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const bytes = [...Buffer.from(randomBytes(32).toString('hex'))];
    const config = `[ootle_wallet_daemon]\noverride_keyring_password = [${bytes.join(',')}]\nauto_claim_burns = false\n`;
    await writeFile(path, config, { mode: 0o400, flag: 'wx' });
    values.push(config);
  }
}
if (values[0] === values[1]) throw new Error('INDEPENDENT_BETA_UNLOCKS_REQUIRED');
console.log('Independent beta unlock files prepared; existing files preserved.');
