// Read-only M2 provenance research. Runs inside node-tools. Never creates accounts or spends.
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const headers = {
  'User-Agent': 'Hauntbox-compatibility-research',
  Accept: 'application/vnd.github+json',
};
async function json(url) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Read-only lookup failed: ${response.status} ${url}`);
  return response.json();
}
const release = await json(
  'https://api.github.com/repos/tari-project/tari-ootle/releases/tags/v0.43.0',
);
const result = {
  inspectedAt: new Date().toISOString(),
  status: 'RESEARCH_ONLY_NOT_NETWORK_COMPATIBILITY_PROOF',
  release: {
    tag: release.tag_name,
    target: release.target_commitish,
    publishedAt: release.published_at,
    prerelease: release.prerelease,
    url: release.html_url,
  },
  assets: release.assets
    .filter((asset) => /linux-x86_64|sha|hash|checksum/i.test(asset.name))
    .map((asset) => ({
      name: asset.name,
      url: asset.browser_download_url,
      digest: asset.digest,
      size: asset.size,
    })),
  crates: [],
  npm: [],
  references: [],
  indexers: [],
};
for (const name of ['tari_template_lib', 'tari_template_test_tooling', 'ootle-rs']) {
  const info = await json(`https://crates.io/api/v1/crates/${name}`);
  result.crates.push({
    name,
    stable: info.crate.max_stable_version,
    newest: info.crate.newest_version,
  });
}
for (const name of ['@tari-project/ootle-ts-bindings', '@tari-project/wallet_jrpc_client']) {
  const registry = await json(`https://registry.npmjs.org/${encodeURIComponent(name)}`);
  const version = registry['dist-tags'].latest;
  result.npm.push({
    name,
    version,
    integrity: registry.versions[version].dist.integrity,
    dependencies: registry.versions[version].dependencies,
  });
}
for (const path of [
  'rust-toolchain.toml',
  'crates/template_lib/Cargo.toml',
  'crates/template_test_tooling/Cargo.toml',
  'clients/wallet_daemon_client/src/permissions.rs',
  'clients/wallet_daemon_client/src/types.rs',
]) {
  const url = `https://raw.githubusercontent.com/tari-project/tari-ootle/v0.43.0/${path}`;
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Release source read failed: ${response.status}`);
  const source = await response.text();
  result.references.push({
    path,
    url,
    sha256: createHash('sha256').update(source).digest('hex'),
    rustChannel:
      path === 'rust-toolchain.toml' ? source.match(/channel\s*=\s*"([^"]+)"/)?.[1] : undefined,
  });
}
for (const origin of ['https://ootle-indexer-a.tari.com/', 'https://ootle-indexer-b.tari.com/']) {
  try {
    const response = await fetch(`${origin}network`, { signal: AbortSignal.timeout(15000) });
    const body = await response.json();
    result.indexers.push({ origin, httpStatus: response.status, network: body });
  } catch {
    result.indexers.push({ origin, error: 'network-read-unavailable' });
  }
}
await mkdir('docs/evidence/m2', { recursive: true });
await writeFile('docs/evidence/m2/release-research.json', `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
