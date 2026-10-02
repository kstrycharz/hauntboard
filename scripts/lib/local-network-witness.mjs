import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { NATIVE_RESOURCE } from './wallet-funding-adapter.mjs';
export async function localNetworkWitness(root = '/network') {
  async function get(path) {
    const response = await fetch(`http://indexer:18300/${path}`, {
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
    });
    if (!response.ok)
      throw Object.assign(new Error('NETWORK_UNAVAILABLE'), { code: 'NETWORK_UNAVAILABLE' });
    return response.json();
  }
  const manifest = JSON.parse(await readFile(`${root}/instance.json`, 'utf8'));
  const oracle = await readFile(`${root}/oracle.json`);
  if (createHash('sha256').update(oracle).digest('hex') !== manifest.oracleHash)
    throw new Error('LOCAL_INSTANCE_MISMATCH');
  const info = await get('network');
  const roster = await get('validators');
  if (
    info.network !== 'localnet' ||
    info.network_byte !== 16 ||
    roster.validators?.length !== 1 ||
    roster.validators[0].public_key !== manifest.publicKey
  )
    throw new Error('LOCAL_INSTANCE_MISMATCH');
  const native = await get(`resources/${NATIVE_RESOURCE}`);
  if (
    native.resource?.resource_type !== 'Stealth' ||
    native.resource?.divisibility !== 6 ||
    native.resource?.metadata?.SYMBOL !== 'tTARI'
  )
    throw new Error('NETWORK_RESOURCE_MISMATCH');
  const db = await stat(`${root}/validator/localnet/data/validator_node/global_storage.sqlite`);
  // A replacement database gets a different instance lease even with the same oracle and network byte.
  const instance = createHash('sha256')
    .update(JSON.stringify([manifest.instance, manifest.oracleHash, db.ino, db.birthtimeMs]))
    .digest('hex');
  return { network: 'localnet', instance, resource: NATIVE_RESOURCE, divisibility: 6 };
}
