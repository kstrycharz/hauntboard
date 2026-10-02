import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { database } from '../../apps/api/db.mjs';
import { createApp } from '../../apps/api/server.mjs';
import { configuration } from '../../apps/api/config.mjs';
import { token } from '../../apps/api/security.mjs';
let db, admin, app;
const schema = `test_local_host_${randomUUID().replaceAll('-', '')}`;
const config = {
  origin: 'http://localhost:8180',
  rpId: 'localhost',
  network: 'esmeralda',
  secureCookie: false,
  intentKey: Buffer.alloc(32, 9),
  bootstrapCode: token(),
  localHostSetup: true,
  submissions: false,
  anchoring: false,
  payouts: false,
};
before(async () => {
  admin = database(process.env.DATABASE_URL);
  await admin.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(process.env.DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${schema}`);
  db = database(url.toString());
  await db.migrate();
  app = await createApp(db, config, null);
});
after(async () => {
  await app?.close();
  await db?.close();
  if (admin) {
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.close();
  }
});
function post(path, body, headers = {}) {
  return app.inject({
    method: 'POST',
    url: path,
    payload: body,
    headers: {
      origin: config.origin,
      host: 'localhost:8180',
      'content-type': 'application/json',
      ...headers,
    },
  });
}
test('status identifies the configured origin and an IPv4 alias cannot bypass origin checks', async () => {
  const status = await app.inject({ method: 'GET', url: '/api/status' });
  assert.equal(status.json().origin, config.origin);
  const alias = await post(
    '/api/auth/setup',
    {},
    {
      origin: 'http://127.0.0.1:8180',
      host: '127.0.0.1:8180',
    },
  );
  assert.equal(alias.statusCode, 403);
  assert.equal(alias.json().code, 'ORIGIN_CHECK_FAILED');
});
test('local setup rejects remote origins, rebound hosts, cross-site requests and disabled configuration', async () => {
  const initial = await post('/api/auth/setup', {});
  assert.deepEqual(initial.json(), { registered: false, method: null, localSetupAvailable: true });
  assert(!JSON.stringify(initial.json()).includes(config.bootstrapCode));
  const pin = '12345678';
  assert.equal(
    (await post('/api/auth/pin/register', { pin }, { origin: 'https://evil.invalid' })).statusCode,
    403,
  );
  assert.equal(
    (await post('/api/auth/pin/register', { pin }, { host: 'evil.invalid' })).statusCode,
    403,
  );
  assert.equal(
    (await post('/api/auth/pin/register', { pin }, { 'sec-fetch-site': 'cross-site' })).statusCode,
    403,
  );
  config.localHostSetup = false;
  assert.equal((await post('/api/auth/pin/register', { pin })).statusCode, 403);
  config.localHostSetup = true;
  assert.equal((await db.query('SELECT 1 FROM curator')).rowCount, 0);
  await db.query('DELETE FROM rate_limits');
  const passkey = await post('/api/auth/register/options', {});
  assert.equal(passkey.statusCode, 200);
  assert.equal(passkey.json().options.authenticatorSelection.userVerification, 'required');
});
test('web-only PIN enrollment creates exactly one host, cannot overwrite, and signs in with saved credentials', async () => {
  const pin = '12345678';
  const results = await Promise.all([
    post('/api/auth/pin/register', { pin }),
    post('/api/auth/pin/register', { pin }),
  ]);
  assert.deepEqual(results.map((r) => r.statusCode).sort(), [200, 409]);
  const winner = results.find((r) => r.statusCode === 200).json();
  assert.equal(winner.authMethod, 'pin');
  assert.equal((await db.query('SELECT 1 FROM curator')).rowCount, 1);
  assert.deepEqual((await post('/api/auth/setup', {})).json(), {
    registered: true,
    method: 'pin',
    localSetupAvailable: false,
  });
  assert.equal((await post('/api/auth/pin/register', { pin: '23456789' })).statusCode, 409);
  assert.equal((await post('/api/auth/register/options', {})).statusCode, 409);
  assert.equal(
    (await post('/api/auth/pin/login', { pin, loginCode: winner.loginCode })).statusCode,
    200,
  );
  assert.equal(
    (await post('/api/auth/pin/login', { pin: '23456789', loginCode: winner.loginCode }))
      .statusCode,
    401,
  );
});
test('public origin cannot enable local host setup', async () => {
  await assert.rejects(
    configuration({
      APP_ORIGIN: 'https://example.test',
      APP_NETWORK: 'esmeralda',
      LOCAL_HOST_SETUP: 'true',
    }),
    /LOCAL_HOST_SETUP_REQUIRES_LOOPBACK/,
  );
});
