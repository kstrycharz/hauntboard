import { mkdir, readFile, writeFile } from 'node:fs/promises';
const packages = [
  'react',
  'react-dom',
  'scheduler',
  '@fontsource/cormorant-garamond',
  '@fontsource/dm-sans',
  '@scure/bip39',
];
await mkdir('docs/licenses', { recursive: true });
for (const name of packages) {
  const path =
    name === 'scheduler'
      ? 'node_modules/.pnpm/scheduler@0.28.0/node_modules/scheduler/LICENSE'
      : `apps/web/node_modules/${name}/LICENSE`;
  let license;
  try {
    license = await readFile(path, 'utf8');
  } catch {
    if (name !== 'scheduler') throw new Error(`Missing required ${name} notice`);
    // pnpm links the exact scheduler version in react-dom's dependency directory.
    const { readdir } = await import('node:fs/promises');
    const folder = (await readdir('node_modules/.pnpm')).find((entry) =>
      entry.startsWith('scheduler@'),
    );
    if (!folder) throw new Error('Missing scheduler dependency');
    license = await readFile(`node_modules/.pnpm/${folder}/node_modules/scheduler/LICENSE`, 'utf8');
  }
  await writeFile(`docs/licenses/${name.replaceAll('/', '-').replace('@', '')}.txt`, license);
}
console.log('Copied required React, scheduler, and font license notices.');
const { readdir } = await import('node:fs/promises');
for (const name of ['@scure/base', '@noble/hashes']) {
  const prefix = `${name.replace('/', '+')}@`;
  const folder = (await readdir('node_modules/.pnpm')).find((entry) => entry.startsWith(prefix));
  if (!folder) throw new Error('Missing recovery codec dependency notice');
  const license = await readFile(
    `node_modules/.pnpm/${folder}/node_modules/${name}/LICENSE`,
    'utf8',
  );
  await writeFile(`docs/licenses/${name.replaceAll('/', '-').replace('@', '')}.txt`, license);
}
const upstream = await fetch(
  'https://raw.githubusercontent.com/tari-project/tari-ootle/v0.43.0/LICENSE',
  { signal: AbortSignal.timeout(15000) },
);
if (!upstream.ok) throw new Error(`Upstream license unavailable: ${upstream.status}`);
await writeFile('docs/licenses/tari-BSD-3-Clause.txt', await upstream.text());
