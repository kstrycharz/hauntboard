// Checks actual local probe unlock material without printing it or its config.
import { readdir, readFile, writeFile } from 'node:fs/promises';
const materials = [];
for (const name of ['spike-sender', 'spike-receiver', 'beta-receipt', 'beta-reward']) {
  try {
    const config = await readFile(`secrets/${name}.toml`, 'utf8');
    const match = config.match(/override_keyring_password\s*=\s*\[([^\]]+)\]/);
    if (match) materials.push(Buffer.from(match[1].split(',').map(Number)).toString());
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
const failures = [];
let localCiValuesChecked = 0;
try {
  for (const name of await readdir('/private')) {
    let value;
    if (name.endsWith('-passkey.json'))
      value = JSON.parse(await readFile(`/private/${name}`, 'utf8')).privateKey;
    else if (name.endsWith('-token')) value = (await readFile(`/private/${name}`, 'utf8')).trim();
    if (value) {
      materials.push(value);
      localCiValuesChecked++;
    }
  }
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
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
for (const path of ['scripts', 'tests', 'infra', 'spikes']) await scan(path);
const record = {
  checkedAt: new Date().toISOString(),
  inspectedFiles,
  localUnlockValuesChecked: materials.length - localCiValuesChecked,
  localCiValuesChecked,
  leaks: failures,
  status: failures.length ? 'FAILED' : 'PASSED',
  scope:
    'Exact local preflight/beta unlock values and any mounted local CI passkey/token values in web assets, docs, scripts, tests, infra and spikes. This is not a general secret scanner or a full live data-leak test.',
};
await writeFile('docs/evidence/m1/secret-scan.json', JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify(record, null, 2));
if (failures.length) process.exitCode = 1;
