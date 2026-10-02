import { readFile, writeFile, chmod, chown } from 'node:fs/promises';
import { validateBetaConfig } from './lib/beta-config.mjs';
validateBetaConfig(process.env);
process.umask(0o077);
const configs = await Promise.all(
  ['receipt', 'reward'].map((role) => readFile(`/run/secrets/${role}.toml`, 'utf8')),
);
if (configs[0] === configs[1]) throw new Error('INDEPENDENT_BETA_UNLOCKS_REQUIRED');
for (const [i, role] of ['receipt', 'reward'].entries()) {
  if (
    !/override_keyring_password\s*=\s*\[(?:\s*\d+\s*,?)+\]/.test(configs[i]) ||
    !/auto_claim_burns\s*=\s*false/.test(configs[i])
  )
    throw new Error('BETA_UNLOCK_CONFIG_REQUIRED');
  const path = `/unlock-${role}/wallet.toml`;
  try {
    if ((await readFile(path, 'utf8')) !== configs[i])
      throw new Error('BETA_UNLOCK_CHANGE_REQUIRES_RECOVERY_REVIEW');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await writeFile(path, configs[i], { mode: 0o400, flag: 'wx' });
  }
  await chmod(path, 0o400);
  for (const target of [path, `/unlock-${role}`, `/data-${role}`])
    await chown(target, 10001, 10001);
}
console.log('Private beta wallet volumes ready; live gates closed.');
