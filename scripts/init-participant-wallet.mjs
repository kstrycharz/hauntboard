import { writeFile, chown, chmod } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
process.umask(0o077);
const path = '/unlock/wallet.toml';
try {
  const bytes = [...Buffer.from(randomBytes(32).toString('hex'))];
  await writeFile(
    path,
    `[ootle_wallet_daemon]\noverride_keyring_password = [${bytes.join(',')}]\nauto_claim_burns = false\n`,
    { flag: 'wx', mode: 0o400 },
  );
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
}
await chmod(path, 0o400);
for (const target of [path, '/unlock', '/wallet']) await chown(target, 10001, 10001);
console.log(
  'Participant wallet private storage ready; no account or funding transaction submitted.',
);
