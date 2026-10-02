import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { database } from '../../apps/api/db.mjs';
import { createApp } from '../../apps/api/server.mjs';
import { token, hash, privateRateKey } from '../../apps/api/security.mjs';
let db, admin, app, config;
const schema = `test_signin_${randomUUID().replaceAll('-', '')}`;
before(async () => {
  admin = database(process.env.DATABASE_URL);
  await admin.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(process.env.DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${schema}`);
  db = database(url.toString());
  await db.migrate();
  await db.migrate();
  config = {
    origin: 'http://localhost:5173',
    rpId: 'localhost',
    network: 'localnet',
    secureCookie: false,
    intentKey: Buffer.alloc(32, 8),
    bootstrapCode: token(),
    submissions: false,
    anchoring: false,
    payouts: false,
  };
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
function post(path, body, cookie = '', csrf = '') {
  return app.inject({
    method: 'POST',
    url: path,
    payload: body,
    headers: {
      origin: config.origin,
      'content-type': 'application/json',
      cookie,
      'x-hauntbox-csrf': csrf,
    },
  });
}
const authCookie = (r) => r.headers['set-cookie'].split(';')[0];
const pin = '86753099';
test('PIN registration stores salted hash and hashed code, never PIN/code; participant cannot authorize host', async () => {
  const response = await post('/api/participant/auth/pin/register', { pin });
  assert.equal(response.statusCode, 200);
  const body = response.json(),
    row = (await db.query('SELECT * FROM participants WHERE id=$1', [body.participantId])).rows[0];
  assert.equal(body.role, 'participant');
  assert.equal(row.pin_login_hash, hash(body.loginCode));
  assert.notEqual(row.pin_hash, pin);
  assert.equal(row.pin_salt.length, 22);
  assert(!JSON.stringify(row).includes(body.loginCode));
  assert(!JSON.stringify(row).includes(pin));
  const cookie = authCookie(response);
  assert.match(response.headers['set-cookie'], /HttpOnly; SameSite=Strict/);
  const session = await app.inject({ url: '/api/participant/auth/session', headers: { cookie } });
  assert.equal(session.statusCode, 200);
  const host = await app.inject({ url: '/api/auth/session', headers: { cookie } });
  assert.equal(host.statusCode, 401);
  const funding = await app.inject({ url: '/api/curator/funding/status', headers: { cookie } });
  assert.equal(funding.statusCode, 401);
  assert.equal((await post('/api/participant/auth/logout', {}, cookie)).statusCode, 403);
  assert.equal(
    (await post('/api/participant/auth/logout', {}, cookie, session.json().csrf)).statusCode,
    200,
  );
  assert.equal(
    (await app.inject({ url: '/api/participant/auth/session', headers: { cookie } })).statusCode,
    401,
  );
  const signedIn = await post('/api/participant/auth/pin/login', {
    loginCode: body.loginCode,
    pin,
  });
  assert.equal(signedIn.statusCode, 200);
  assert.equal(signedIn.json().participantId, body.participantId);
});
test('wrong PIN locks account durably; retries are rate-limited and cannot reset the lock', async () => {
  const created = (await post('/api/participant/auth/pin/register', { pin })).json();
  for (let i = 0; i < 5; i++)
    assert.equal(
      (
        await post('/api/participant/auth/pin/login', {
          loginCode: created.loginCode,
          pin: '00000000',
        })
      ).statusCode,
      401,
    );
  const row = (await db.query('SELECT * FROM participants WHERE id=$1', [created.participantId]))
    .rows[0];
  assert.equal(row.pin_failures, 5);
  assert(new Date(row.pin_locked_until) > new Date());
  assert.equal(
    (await post('/api/participant/auth/pin/login', { loginCode: created.loginCode, pin }))
      .statusCode,
    429,
  );
  await db.query('DELETE FROM rate_limits WHERE bucket=$1', [
    privateRateKey(config.intentKey, hash(created.loginCode), 'participant-pin-attempt'),
  ]);
  assert.equal(
    (await post('/api/participant/auth/pin/login', { loginCode: created.loginCode, pin }))
      .statusCode,
    401,
  );
});
test('unknown account, invalid lengths, extra fields and foreign origins fail closed', async () => {
  assert.equal(
    (await post('/api/participant/auth/pin/login', { loginCode: token(), pin })).statusCode,
    401,
  );
  assert.equal((await post('/api/participant/auth/pin/register', { pin: '1234' })).statusCode, 400);
  assert.equal(
    (await post('/api/participant/auth/pin/register', { pin, operator: true })).statusCode,
    400,
  );
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/api/participant/auth/pin/register',
        payload: { pin },
        headers: { origin: 'https://foreign.invalid', 'content-type': 'application/json' },
      })
    ).statusCode,
    403,
  );
});
test('host PIN requires bootstrap, creates one host and grants no participant session', async () => {
  assert.equal(
    (await post('/api/auth/pin/register', { pin, bootstrapCode: token() })).statusCode,
    403,
  );
  const created = await post('/api/auth/pin/register', {
    pin,
    bootstrapCode: config.bootstrapCode,
  });
  assert.equal(created.statusCode, 200);
  assert.equal(created.json().authMethod, 'pin');
  const cookie = authCookie(created),
    body = created.json();
  assert.equal(
    (await app.inject({ url: '/api/participant/auth/session', headers: { cookie } })).statusCode,
    401,
  );
  assert.equal(
    (await post('/api/auth/pin/register', { pin, bootstrapCode: config.bootstrapCode })).statusCode,
    409,
  );
  assert.equal(
    (await post('/api/auth/register/options', { bootstrapCode: config.bootstrapCode })).statusCode,
    409,
  );
  assert.equal(
    (await post('/api/auth/pin/login', { loginCode: body.loginCode, pin })).statusCode,
    200,
  );
});
test('passkey enrollment is role-bound, discoverable login exposes no credential list', async () => {
  await db.query('DELETE FROM rate_limits');
  const options = await post('/api/participant/auth/register/options', {});
  assert.equal(options.statusCode, 200);
  assert.equal(options.json().options.authenticatorSelection.userVerification, 'required');
  const login = await post('/api/participant/auth/login/options', {});
  assert.equal(login.statusCode, 200);
  assert.equal(login.json().options.userVerification, 'required');
  assert(!login.json().options.allowCredentials?.length);
  const hostChallenge = randomUUID();
  await db.query(
    "INSERT INTO ceremonies(id,kind,challenge,expires_at) VALUES($1,'register','foreign',now()+interval '1 minute')",
    [hostChallenge],
  );
  assert.equal(
    (
      await post('/api/participant/auth/register/verify', {
        ceremonyId: hostChallenge,
        response: { id: 'fake' },
      })
    ).statusCode,
    401,
  );
});
test('PIN endpoints cannot activate on mainnet', async () => {
  config.network = 'mainnet';
  assert.equal((await post('/api/participant/auth/pin/register', { pin })).statusCode, 403);
  assert.equal((await post('/api/auth/pin/login', { pin, loginCode: token() })).statusCode, 403);
  config.network = 'localnet';
});
