import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
for (const milestone of ['m1', 'm2']) {
  const base = `docs/evidence/${milestone}`;
  const files = (await readdir(base, { withFileTypes: true }))
    .filter((file) => file.isFile() && file.name !== 'SHA256SUMS')
    .map((file) => file.name)
    .sort();
  const sums = [];
  for (const name of files)
    sums.push(
      `${createHash('sha256')
        .update(await readFile(`${base}/${name}`))
        .digest('hex')}  ${name}`,
    );
  await writeFile(`${base}/SHA256SUMS`, sums.join('\n') + '\n');
}
console.log('Hashed sanitized milestone evidence.');
