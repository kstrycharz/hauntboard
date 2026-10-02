import pg from 'pg';
import { readFile } from 'node:fs/promises';
export function database(connectionString) {
  const pool = new pg.Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 5000,
    statement_timeout: 15000,
  });
  return {
    pool,
    query: (sql, values) => pool.query(sql, values),
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const value = await fn(client);
        await client.query('COMMIT');
        return value;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async migrate() {
      await this.transaction(async (client) => {
        await client.query('SELECT pg_advisory_xact_lock(47389110)');
        const exists = await client.query("SELECT to_regclass('schema_migrations') AS table_name");
        if (exists.rows[0].table_name) {
          const version = await client.query(
            'SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1',
          );
          if (version.rows[0]?.version === 3) return;
          if ([1, 2].includes(version.rows[0]?.version)) {
            if (version.rows[0].version === 1)
              await client.query(
                await readFile(new URL('./migrations/002.sql', import.meta.url), 'utf8'),
              );
            await client.query(
              await readFile(new URL('./migrations/003.sql', import.meta.url), 'utf8'),
            );
            return;
          }
          throw new Error('UNSUPPORTED_DATABASE_VERSION');
        }
        await client.query(
          await readFile(new URL('./migrations/001.sql', import.meta.url), 'utf8'),
        );
        await client.query(
          await readFile(new URL('./migrations/002.sql', import.meta.url), 'utf8'),
        );
        await client.query(
          await readFile(new URL('./migrations/003.sql', import.meta.url), 'utf8'),
        );
      });
    },
    close: () => pool.end(),
  };
}
