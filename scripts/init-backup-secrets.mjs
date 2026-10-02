import { mkdir, writeFile, chmod, chown } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
process.umask(0o077);
for (const directory of ['/backup-keys', '/backups']) {
  await mkdir(directory, { recursive: true });
  await chown(directory, 1000, 1000);
}
for (const name of ['backup-key', 'restore-password']) {
  const path = `/backup-keys/${name}`;
  try {
    await writeFile(path, randomBytes(32).toString('base64url'), { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  await chmod(path, 0o600);
  await chown(path, 1000, 1000);
}
console.log('Private recovery volumes prepared; existing keys retained.');
