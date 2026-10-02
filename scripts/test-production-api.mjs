// Test schemas only; never enroll or replace the installation's actual host.
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const password = (await readFile('/run/hauntbox/postgres-password', 'utf8')).trim();
const result = spawnSync(
  process.execPath,
  ['--experimental-strip-types', '--test', ...process.argv.slice(2)],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: `postgres://hauntbox:${encodeURIComponent(password)}@hauntbox-production-database-1:5432/hauntbox`,
    },
  },
);
process.exitCode = result.status ?? 1;
