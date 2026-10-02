import { randomUUID } from 'node:crypto';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { bootstrapRegistration, authResponse } from '../../packages/schema/index.mjs';
import { hash, token, same, problem, rateLimit, privateRateKey } from './security.mjs';
import { installOperatorPinAuth } from './operator-pin-auth.mjs';

export async function installAuth(app, db, config) {
  const userId = 'hauntbox-curator';
  const registrationEnabled = !!config.bootstrapCode;
  const cookie = (value, age) =>
    `hauntbox_session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${config.secureCookie ? '; Secure' : ''}`;
  async function limited(req) {
    await rateLimit(db, privateRateKey(config.intentKey, req.ip, 'auth'), 12, 300);
  }
  async function ceremony(client, id, kind) {
    const result = await client.query('SELECT * FROM ceremonies WHERE id=$1 FOR UPDATE', [id]);
    const row = result.rows[0];
    if (!row || row.kind !== kind || row.consumed || new Date(row.expires_at) <= new Date())
      throw problem('AUTH_CHALLENGE_EXPIRED', 401);
    await client.query('UPDATE ceremonies SET consumed=true WHERE id=$1', [id]);
    return row;
  }
  app.post('/api/auth/register/options', async (req) => {
    await limited(req);
    const input = bootstrapRegistration.parse(req.body);
    if (!registrationEnabled || !same(hash(input.bootstrapCode), hash(config.bootstrapCode)))
      throw problem('REGISTRATION_NOT_AVAILABLE', 403);
    return db.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(47389111)');
      const existing = await client.query('SELECT count(*)::int AS count FROM curator');
      if (existing.rows[0].count) throw problem('CURATOR_ALREADY_REGISTERED', 409);
      // The fixed single-operator user handle is public credential metadata, never a secret.
      const options = await generateRegistrationOptions({
        rpName: 'Hauntbox curator',
        rpID: config.rpId,
        userName: userId,
        userID: new TextEncoder().encode(userId),
        attestationType: 'none',
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      });
      const ceremonyId = randomUUID();
      await client.query(
        "INSERT INTO ceremonies(id,kind,challenge,expires_at) VALUES($1,'register',$2,now()+interval '3 minutes')",
        [ceremonyId, options.challenge],
      );
      return { ceremonyId, options };
    });
  });
  app.post('/api/auth/register/verify', async (req, reply) => {
    await limited(req);
    const input = authResponse.parse(req.body);
    const verified = await db.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(47389111)');
      if ((await client.query('SELECT 1 FROM curator LIMIT 1')).rowCount)
        throw problem('CURATOR_ALREADY_REGISTERED', 409);
      const row = await ceremony(client, input.ceremonyId, 'register');
      const result = await verifyRegistrationResponse({
        response: input.response,
        expectedChallenge: row.challenge,
        expectedOrigin: config.origin,
        expectedRPID: config.rpId,
        requireUserVerification: true,
      });
      if (!result.verified || !result.registrationInfo) throw problem('PASSKEY_NOT_VERIFIED', 401);
      const id = randomUUID();
      const { credential, credentialBackedUp } = result.registrationInfo;
      await client.query('INSERT INTO curator(id,user_id) VALUES($1,$2)', [id, userId]);
      await client.query(
        'INSERT INTO passkeys(id,curator_id,public_key,counter,transports,backed_up) VALUES($1,$2,$3,$4,$5,$6)',
        [
          credential.id,
          id,
          Buffer.from(credential.publicKey),
          credential.counter,
          JSON.stringify(credential.transports ?? []),
          credentialBackedUp,
        ],
      );
      return id;
    });
    return startSession(verified, reply);
  });
  app.post('/api/auth/login/options', async (req) => {
    await limited(req);
    const credentials = await db.query('SELECT id,transports FROM passkeys');
    if (!credentials.rowCount) throw problem('CURATOR_SETUP_REQUIRED', 409);
    const options = await generateAuthenticationOptions({
      rpID: config.rpId,
      allowCredentials: credentials.rows.map((row) => ({ id: row.id, transports: row.transports })),
      userVerification: 'required',
    });
    const ceremonyId = randomUUID();
    await db.query(
      "INSERT INTO ceremonies(id,kind,challenge,expires_at) VALUES($1,'login',$2,now()+interval '3 minutes')",
      [ceremonyId, options.challenge],
    );
    return { ceremonyId, options };
  });
  app.post('/api/auth/login/verify', async (req, reply) => {
    await limited(req);
    const input = authResponse.parse(req.body);
    const curatorId = await db.transaction(async (client) => {
      const row = await ceremony(client, input.ceremonyId, 'login');
      const credentials = await client.query('SELECT * FROM passkeys WHERE id=$1 FOR UPDATE', [
        input.response.id,
      ]);
      const credential = credentials.rows[0];
      if (!credential) throw problem('PASSKEY_NOT_VERIFIED', 401);
      const result = await verifyAuthenticationResponse({
        response: input.response,
        expectedChallenge: row.challenge,
        expectedOrigin: config.origin,
        expectedRPID: config.rpId,
        credential: {
          id: credential.id,
          publicKey: new Uint8Array(credential.public_key),
          counter: Number(credential.counter),
          transports: credential.transports,
        },
        requireUserVerification: true,
      });
      if (!result.verified) throw problem('PASSKEY_NOT_VERIFIED', 401);
      await client.query('UPDATE passkeys SET counter=$2 WHERE id=$1', [
        credential.id,
        result.authenticationInfo.newCounter,
      ]);
      return credential.curator_id;
    });
    return startSession(curatorId, reply);
  });
  async function startSession(curatorId, reply, method = 'passkey') {
    const session = token(),
      csrf = token();
    await db.query(
      "INSERT INTO sessions(token_hash,curator_id,csrf_hash,authenticated_at,expires_at,auth_method) VALUES($1,$2,$3,now(),now()+interval '8 hours',$4)",
      [hash(session), curatorId, hash(csrf), method],
    );
    reply.header('Set-Cookie', cookie(session, 28800));
    return { authenticated: true, csrf, authMethod: method };
  }
  async function authorize(req, fresh = false) {
    const sessionToken = /(?:^|;\s*)hauntbox_session=([A-Za-z0-9_-]{43})(?:;|$)/.exec(
      req.headers.cookie ?? '',
    )?.[1];
    const row = sessionToken
      ? (
          await db.query('SELECT * FROM sessions WHERE token_hash=$1 AND expires_at>now()', [
            hash(sessionToken),
          ])
        ).rows[0]
      : null;
    if (!row) throw problem('CURATOR_SIGN_IN_REQUIRED', 401);
    if (
      req.method !== 'GET' &&
      !same(hash(String(req.headers['x-hauntbox-csrf'] ?? '')), row.csrf_hash)
    )
      throw problem('CSRF_CHECK_FAILED', 403);
    if (fresh && Date.now() - new Date(row.authenticated_at).getTime() > 300000)
      throw problem('FRESH_PASSKEY_REQUIRED', 401);
    return row;
  }
  app.get('/api/auth/session', async (req) => {
    const session = await authorize(req);
    const csrf = token();
    await db.query('UPDATE sessions SET csrf_hash=$2 WHERE token_hash=$1', [
      session.token_hash,
      hash(csrf),
    ]);
    return { authenticated: true, csrf, authMethod: session.auth_method };
  });
  app.post('/api/auth/logout', async (req, reply) => {
    const session = await authorize(req);
    await db.query('DELETE FROM sessions WHERE token_hash=$1', [session.token_hash]);
    reply.header('Set-Cookie', cookie('', 0));
    return { authenticated: false };
  });
  installOperatorPinAuth(app, db, config, startSession, limited);
  return authorize;
}
