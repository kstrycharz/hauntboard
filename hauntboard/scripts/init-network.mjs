// Container-only isolated test network initialization. Never exports wallet/validator secrets.
import { readFile, writeFile, mkdir, chmod, chown, access } from 'node:fs/promises';
import { randomBytes, randomUUID, createHash } from 'node:crypto';

process.umask(0o077);
const root = '/network';
const identity = await readFile(`${root}/validator/localnet/validator_node_id.json`, 'utf8');
const publicKey = identity.match(/(?:"?public_key"?)\s*:\s*["']([a-f0-9]{64})["']/)?.[1];
if (!publicKey) throw new Error('LOCAL_IDENTITY_SHAPE_MISMATCH');
const oraclePath = `${root}/oracle.json`;
let oracle;
try {
  oracle = JSON.parse(await readFile(oraclePath, 'utf8'));
  if (oracle.validators[0].public_key !== publicKey) throw new Error('LOCAL_INSTANCE_MISMATCH');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  oracle = {
    epoch_time: 3600,
    initial_epoch: 1,
    base_time: new Date(Date.now() - 3600000).toISOString(),
    validators: [
      {
        public_key: publicKey,
        claim_key: publicKey,
        shard_group: { start: 1, end_inclusive: 256 },
        registration_epoch: 0,
      },
    ],
  };
  await writeFile(oraclePath, JSON.stringify(oracle), { mode: 0o600 });
}
const hash = createHash('sha256')
  .update(await readFile(oraclePath))
  .digest('hex');
await writeFile(
  `${root}/indexer.toml`,
  `[p2p.seeds]\npeer_seeds = ["${publicKey}::/ip4/172.30.89.2/tcp/18100"]\n[localnet.p2p.seeds]\npeer_seeds = ["${publicKey}::/ip4/172.30.89.2/tcp/18100"]\n`,
  { mode: 0o644 },
);
const manifestPath = `${root}/instance.json`;
try {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.oracleHash !== hash) throw new Error('LOCAL_INSTANCE_MISMATCH');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  await writeFile(
    manifestPath,
    JSON.stringify({ instance: randomUUID(), oracleHash: hash, publicKey }),
    { mode: 0o600 },
  );
}
for (const role of ['sender', 'receiver']) {
  await mkdir(`/data-${role}`, { recursive: true });
  await chown(`/data-${role}`, 10001, 10001);
  const dir = `/unlock-${role}`;
  await mkdir(dir, { recursive: true });
  const path = `${dir}/wallet.toml`;
  try {
    await access(path);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await writeFile(
      path,
      `[ootle_wallet_daemon]\noverride_keyring_password = [${[...Buffer.from(randomBytes(32).toString('hex'))].join(',')}]\nauto_claim_burns = false\n`,
      { mode: 0o400 },
    );
  }
  await chown(path, 10001, 10001);
  await chmod(path, 0o400);
  await chown(dir, 10001, 10001);
}
for (const path of [root, oraclePath, manifestPath, `${root}/indexer.toml`])
  await chown(path, 10001, 10001);
console.log(
  JSON.stringify({
    status: 'LOCAL_TEST_CONFIG_READY',
    network: 'localnet',
    externalFunding: false,
  }),
);

