import { mkdir, writeFile, chown, chmod, readdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
process.umask(0o077);
await mkdir('/run/hauntbox', { recursive: true });
for (const name of ['intent-key', 'bootstrap-code', 'postgres-password']) {
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
console.log('Production application secrets prepared; existing material retained.');
async function ownDirectory(path) {
  await mkdir(path, { recursive: true });
  await chown(path, 1000, 1000);
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = `${path}/${entry.name}`;
    if (entry.isDirectory()) await ownDirectory(child);
    else if (!entry.isSymbolicLink()) await chown(child, 1000, 1000);
  }
}
for (const path of ['/caddy-data', '/caddy-config']) await ownDirectory(path);
