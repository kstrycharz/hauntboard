// Checks actual local probe unlock material without printing it or its config.
import { readdir, readFile, writeFile } from 'node:fs/promises';
const materials = [];
for (const role of ['sender', 'receiver']) {
  try {
    const config = await readFile(`secrets/spike-${role}.toml`, 'utf8');
    const match = config.match(/override_keyring_password\s*=\s*\[([^\]]+)\]/);
    if (match) materials.push(Buffer.from(match[1].split(',').map(Number)).toString());
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
const failures = [];
let inspectedFiles = 0;
async function scan(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (['node_modules', 'walkthrough'].includes(entry.name)) continue;
    const target = `${path}/${entry.name}`;
    if (entry.isDirectory()) {
      await scan(target);
      continue;
    }
    if (!entry.isFile()) continue;
    const bytes = await readFile(target);
    inspectedFiles++;
    if (materials.some((secret) => bytes.includes(Buffer.from(secret)))) failures.push(target);
  }
}
await scan('apps/web');
await scan('docs');
const record = {
  checkedAt: new Date().toISOString(),
  inspectedFiles,
  localUnlockValuesChecked: materials.length,
  leaks: failures,
  status: failures.length ? 'FAILED' : 'PASSED',
  scope:
    'Exact local preflight unlock values in source, built web assets, and public evidence. This is not a general secret scanner or a full live data-leak test.',
};
await writeFile('docs/evidence/m1/secret-scan.json', JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify(record, null, 2));
if (failures.length) process.exitCode = 1;
