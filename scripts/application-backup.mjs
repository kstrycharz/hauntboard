// Encrypted application backup and restore into an isolated recovery database only.
import { readFile, writeFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { CompactEncrypt, compactDecrypt } from 'jose';
import pg from 'pg';
const tables = [
  'schema_migrations',
  'curator',
  'passkeys',
  'ceremonies',
  'sessions',
  'rooms',
  'challenges',
  'envelopes',
  'jobs',
  'reward_quotes',
  'rewards',
  'rate_limits',
  'audit',
  'participants',
  'participant_passkeys',
  'participant_ceremonies',
  'participant_sessions',
];
const maximum = 64 * 1024 * 1024;
const demand = (condition) => {
  if (!condition) throw new Error('RECOVERY_CHECK_FAILED');
};
const key = Buffer.from((await readFile('/backup-keys/backup-key', 'utf8')).trim(), 'base64url');
demand(key.length === 32);
const sourcePassword =
  process.env.SOURCE_PASSWORD || (await readFile('/source/postgres-password', 'utf8')).trim();
const targetPassword = (await readFile('/backup-keys/restore-password', 'utf8')).trim();
const source = {
  host: process.env.SOURCE_HOST ?? 'database',
  port: 5432,
  user: 'hauntbox',
  database: 'hauntbox',
  password: sourcePassword,
};
const target = {
  host: 'restore-database',
  port: 5432,
  user: 'hauntbox',
  database: 'hauntbox_restore',
  password: targetPassword,
};
function native(command, args, connection, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: {
        ...process.env,
        PGHOST: connection.host,
        PGPORT: '5432',
        PGUSER: connection.user,
        PGDATABASE: connection.database,
        PGPASSWORD: connection.password,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const chunks = [];
    let size = 0;
    child.stdout.on('data', (chunk) => {
      size += chunk.length;
      if (size > maximum) child.kill();
      else chunks.push(chunk);
    });
    let diagnostic = '';
    child.stderr.on('data', (chunk) => {
      if (diagnostic.length < 4096) diagnostic += chunk.toString();
    });
    child.on('error', () => reject(new Error('RECOVERY_TOOL_UNAVAILABLE')));
    child.on('close', (code) =>
      code === 0 && size <= maximum
        ? resolve(Buffer.concat(chunks))
        : reject(
            new Error(
              ['snapshot', 'version', 'connection', 'permission', 'query failed', 'not found'].find(
                (category) => diagnostic.toLowerCase().includes(category),
              ) ?? 'RECOVERY_TOOL_FAILED',
            ),
          ),
    );
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}
async function fingerprints(client) {
  const result = {};
  for (const table of tables) {
    const rows = (
      await client.query(
        `SELECT row_to_json(t)::text AS value FROM ${table} t ORDER BY row_to_json(t)::text`,
      )
    ).rows;
    result[table] = {
      count: rows.length,
      digest: createHash('sha256')
        .update(rows.map((row) => row.value).join('\n'))
        .digest('hex'),
    };
  }
  return result;
}
let sourceClient, targetClient;
let phase = 'connect_source';
try {
  demand(process.argv[2] === 'drill');
  sourceClient = new pg.Client(source);
  await sourceClient.connect();
  await sourceClient.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const snapshot = (await sourceClient.query('SELECT pg_export_snapshot() AS id')).rows[0].id;
  phase = 'snapshot';
  const expected = await fingerprints(sourceClient);
  phase = 'dump';
  const dump = await native(
    'pg_dump',
    ['--format=custom', '--no-owner', '--no-acl', `--snapshot=${snapshot}`],
    source,
  );
  demand(dump.length > 0);
  phase = 'read_service_key';
  const intentKey = (await readFile('/source/intent-key', 'utf8')).trim();
  demand(Buffer.from(intentKey, 'base64url').length === 32);
  const bundle = Buffer.from(
    JSON.stringify({
      version: 1,
      createdAt: new Date().toISOString(),
      dump: dump.toString('base64'),
      intentKey,
      fingerprints: expected,
    }),
  );
  demand(bundle.length <= maximum);
  phase = 'encrypt';
  const encrypted = await new CompactEncrypt(bundle)
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM', typ: 'hauntbox-database-backup', version: 1 })
    .encrypt(key);
  await writeFile('/backups/application-backup.jwe.tmp', encrypted, { mode: 0o600 });
  await rename('/backups/application-backup.jwe.tmp', '/backups/application-backup.jwe');
  await sourceClient.query('COMMIT');
  await sourceClient.end();
  sourceClient = null;
  // Reject a changed authenticated ciphertext before invoking any restore tool.
  const parts = encrypted.split('.');
  parts[3] = (parts[3][0] === 'A' ? 'B' : 'A') + parts[3].slice(1);
  let tamperRejected = false;
  try {
    await compactDecrypt(parts.join('.'), key);
  } catch {
    tamperRejected = true;
  }
  demand(tamperRejected);
  phase = 'decrypt';
  const { plaintext, protectedHeader } = await compactDecrypt(
    await readFile('/backups/application-backup.jwe', 'utf8'),
    key,
    { keyManagementAlgorithms: ['dir'], contentEncryptionAlgorithms: ['A256GCM'] },
  );
  demand(protectedHeader.typ === 'hauntbox-database-backup' && protectedHeader.version === 1);
  const restored = JSON.parse(Buffer.from(plaintext).toString());
  demand(restored.version === 1);
  // Destination is hardcoded to hauntbox_restore; source credentials never reach pg_restore.
  phase = 'restore';
  await native(
    'pg_restore',
    [
      '--clean',
      '--if-exists',
      '--no-owner',
      '--no-acl',
      '--exit-on-error',
      '--dbname=hauntbox_restore',
    ],
    target,
    Buffer.from(restored.dump, 'base64'),
  );
  phase = 'verify_restore';
  targetClient = new pg.Client(target);
  await targetClient.connect();
  demand(
    JSON.stringify(await fingerprints(targetClient)) === JSON.stringify(restored.fingerprints),
  );
  phase = 'verify_intents';
  const quotes = (await targetClient.query('SELECT sealed_intent FROM reward_quotes')).rows;
  for (const quote of quotes)
    await compactDecrypt(quote.sealed_intent, Buffer.from(restored.intentKey, 'base64url'), {
      keyManagementAlgorithms: ['dir'],
      contentEncryptionAlgorithms: ['A256GCM'],
    });
  await targetClient.query('DELETE FROM sessions');
  await targetClient.query('DELETE FROM ceremonies');
  await targetClient.query('DELETE FROM participant_sessions');
  await targetClient.query('DELETE FROM participant_ceremonies');
  const evidence = {
    checkedAt: new Date().toISOString(),
    status: 'PASSED_ISOLATED_APPLICATION_RESTORE',
    checks: {
      consistentSnapshot: true,
      authenticatedEncryptedBackup: true,
      tamperRejected,
      allTableFingerprintsMatched: true,
      payoutIntentsDecryptWithRestoredKey: true,
      payoutIntentsChecked: quotes.length,
      restoredSessionsInvalidated: true,
      sourceDatabaseUnmodified: true,
      noWalletOrSigningConnection: true,
    },
    limits:
      'Application database/intent-key drill only; wallet data, unlock material, browser-key recovery and off-host backup custody are separate.',
  };
  await writeFile('/backups/restore-evidence.json', JSON.stringify(evidence, null, 2) + '\n', {
    mode: 0o600,
  });
  console.log(JSON.stringify(evidence));
} catch (error) {
  console.log(
    JSON.stringify({
      status: 'APPLICATION_RESTORE_FAILED',
      phase,
      code: [
        'snapshot',
        'version',
        'connection',
        'permission',
        'query failed',
        'not found',
      ].includes(error.message)
        ? error.message
        : 'RECOVERY_CHECK_FAILED',
    }),
  );
  process.exitCode = 1;
} finally {
  if (sourceClient) await sourceClient.end();
  if (targetClient) await targetClient.end();
}
