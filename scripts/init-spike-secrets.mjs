import { mkdir, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
await mkdir('secrets', { recursive: true });
for (const role of ['sender', 'receiver']) {
  try {
    const passwordBytes = Array.from(Buffer.from(randomBytes(32).toString('hex')));
    await writeFile(
      `secrets/spike-${role}.toml`,
      `[ootle_wallet_daemon]\noverride_keyring_password = [${passwordBytes.join(',')}]\nauto_claim_burns = false\n`,
      { mode: 0o600, flag: 'wx' },
    );
    console.log(`Created ignored ${role} probe configuration; secret not printed.`);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    console.log(`Preserved existing ${role} probe configuration.`);
  }
}
