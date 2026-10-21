import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const suites = [
  'room-keys.test.mjs',
  'provider-state.test.mjs',
  'sealed-posts.test.mjs',
  'stealth-fee-privacy.test.mjs',
  'privacy-audit.test.mjs',
  'state.test.mjs',
  'output-ledger.test.mjs',
  'api-client.test.mjs',
  'delivery.test.mjs',
  'relay-reconciliation.test.mjs',
  'post-proof.test.mjs',
  'component-provider.mjs',
].map((name) => `hauntboard/tests/${name}`);
const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...suites], {
  encoding: 'utf8',
});
const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
process.stdout.write(output);
const metric = (name) => Number(new RegExp(`^# ${name} (\\d+)$`, 'm').exec(output)?.[1] ?? 0);
const sourceFiles = [
  ...suites,
  'hauntboard/web/sealed-posts.mjs',
  'hauntboard/web/stealth-fee.mjs',
  'hauntboard/lib/privacy-audit.mjs',
];
const sourceHashes = Object.fromEntries(
  await Promise.all(
    sourceFiles.map(async (path) => [
      path,
      createHash('sha256')
        .update(await readFile(path))
        .digest('hex'),
    ]),
  ),
);
const report = {
  checkedAt: new Date().toISOString(),
  status: run.status === 0 ? 'PASSED' : 'FAILED',
  runtime: process.version,
  tests: metric('tests'),
  passed: metric('pass'),
  failed: metric('fail'),
  scope:
    'Local adversarial/unit checks. Actual released Tari SDK/WASM cryptography uses synthetic provider rows; no chain spends. Browser and native-engine evidence are separate.',
  suites,
  sourceHashes,
  strongUnlinkabilityProven: false,
};
await writeFile('hauntboard/evidence/privacy-tests.tap', output);
await writeFile('hauntboard/evidence/privacy-tests.json', JSON.stringify(report, null, 2) + '\n');
if (run.status !== 0) process.exitCode = 1;
