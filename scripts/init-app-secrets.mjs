import { mkdir, writeFile, chmod, chown } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
process.umask(0o077);
await mkdir('/run/hauntbox', { recursive: true });
for (const name of ['intent-key', 'bootstrap-code']) {
  try {
    await writeFile(`/run/hauntbox/${name}`, randomBytes(32).toString('base64url'), {
      flag: 'wx',
      mode: 0o600,
    });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  await chown(`/run/hauntbox/${name}`, 1000, 1000);
  await chmod(`/run/hauntbox/${name}`, 0o600);
}
console.log('Application secrets initialized; existing material retained.');
