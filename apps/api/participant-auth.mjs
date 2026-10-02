import { randomUUID, randomBytes } from 'node:crypto';
import { pinHash } from './pin-security.mjs';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { z } from 'zod';
import { authResponse } from '../../packages/schema/index.mjs';
import { hash, token, same, problem, rateLimit, privateRateKey } from './security.mjs';

export function installParticipantAuth(app, db, config) {
  const cookie = (value, age) =>
    `hauntbox_participant=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${config.secureCookie ? '; Secure' : ''}`;
  const limited = (req) =>
    rateLimit(db, privateRateKey(config.intentKey, req.ip, 'participant-auth'), 20, 300);
  const empty = z.object({}).strict();
  const pin = z.string().regex(/^[0-9]{8,12}$/);
  const pinLogin = z.object({ loginCode: z.string().regex(/^[A-Za-z0-9_-]{43}$/), pin }).strict();
  function testnetOnly() {
    if (!['localnet', 'esmeralda'].includes(config.network))
      throw problem('PIN_SIGN_IN_TESTNET_ONLY', 403);
  }
  async function ceremony(client, id, kind) {
    const row = (
      await client.query('SELECT * FROM participant_ceremonies WHERE id=$1 FOR UPDATE', [id])
    ).rows[0];
    if (!row || row.kind !== kind || row.consumed || new Date(row.expires_at) <= new Date())
      throw problem('AUTH_CHALLENGE_EXPIRED', 401);
    await client.query('UPDATE participant_ceremonies SET consumed=true WHERE id=$1', [id]);
    return row;
  }
  async function session(id, reply) {
    const value = token(),
      csrf = token();
    await db.query(
      "INSERT INTO participant_sessions(token_hash,participant_id,csrf_hash,expires_at) VALUES($1,$2,$3,now()+interval '8 hours')",
      [hash(value), id, hash(csrf)],
    );
    reply.header('Set-Cookie', cookie(value, 28800));
    return { authenticated: true, role: 'participant', participantId: id, csrf };
  }
  async function authorize(req) {
    const value = /(?:^|;\s*)hauntbox_participant=([A-Za-z0-9_-]{43})(?:;|$)/.exec(
      req.headers.cookie ?? '',
    )?.[1];
    const row = value
      ? (
          await db.query(
            'SELECT * FROM participant_sessions WHERE token_hash=$1 AND expires_at>now()',
            [hash(value)],
          )
        ).rows[0]
      : null;
    if (!row) throw problem('PARTICIPANT_SIGN_IN_REQUIRED', 401);
    if (
      req.method !== 'GET' &&
      !same(hash(String(req.headers['x-hauntbox-csrf'] ?? '')), row.csrf_hash)
    )
      throw problem('CSRF_CHECK_FAILED', 403);
    return row;
  }
  app.post('/api/participant/auth/register/options', async (req) => {
    await limited(req);
    empty.parse(req.body);
    const id = randomUUID();
    const options = await generateRegistrationOptions({
      rpName: 'Hauntbox participant',
      rpID: config.rpId,
      userName: `participant-${id}`,
      userID: new TextEncoder().encode(id),
      attestationType: 'none',
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    });
    const ceremonyId = randomUUID();
    await db.query(
      "INSERT INTO participant_ceremonies(id,kind,participant_id,challenge,expires_at) VALUES($1,'register',$2,$3,now()+interval '3 minutes')",
      [ceremonyId, id, options.challenge],
    );
    return { ceremonyId, options };
  });
  app.post('/api/participant/auth/register/verify', async (req, reply) => {
    await limited(req);
    const input = authResponse.parse(req.body);
    const id = await db.transaction(async (client) => {
      const row = await ceremony(client, input.ceremonyId, 'register');
      const verified = await verifyRegistrationResponse({
        response: input.response,
        expectedChallenge: row.challenge,
        expectedOrigin: config.origin,
        expectedRPID: config.rpId,
        requireUserVerification: true,
      });
      if (!verified.verified || !verified.registrationInfo)
        throw problem('PASSKEY_NOT_VERIFIED', 401);
      const credential = verified.registrationInfo.credential;
      await client.query('INSERT INTO participants(id) VALUES($1)', [row.participant_id]);
      await client.query(
        'INSERT INTO participant_passkeys(id,participant_id,public_key,counter,transports) VALUES($1,$2,$3,$4,$5)',
        [
          credential.id,
          row.participant_id,
          Buffer.from(credential.publicKey),
          credential.counter,
          JSON.stringify(credential.transports ?? []),
        ],
      );
      return row.participant_id;
    });
    return session(id, reply);
  });
  app.post('/api/participant/auth/login/options', async (req) => {
    await limited(req);
    empty.parse(req.body);
    // Discoverable credentials avoid exposing every participant credential ID to other users.
    const options = await generateAuthenticationOptions({
      rpID: config.rpId,
      userVerification: 'required',
    });
    const ceremonyId = randomUUID();
    await db.query(
      "INSERT INTO participant_ceremonies(id,kind,challenge,expires_at) VALUES($1,'login',$2,now()+interval '3 minutes')",
      [ceremonyId, options.challenge],
    );
    return { ceremonyId, options };
  });
  app.post('/api/participant/auth/login/verify', async (req, reply) => {
    await limited(req);
    const input = authResponse.parse(req.body);
    const id = await db.transaction(async (client) => {
      const row = await ceremony(client, input.ceremonyId, 'login');
      const credential = (
        await client.query('SELECT * FROM participant_passkeys WHERE id=$1 FOR UPDATE', [
          input.response.id,
        ])
      ).rows[0];
      if (!credential) throw problem('PASSKEY_NOT_VERIFIED', 401);
      const verified = await verifyAuthenticationResponse({
        response: input.response,
        expectedChallenge: row.challenge,
        expectedOrigin: config.origin,
        expectedRPID: config.rpId,
        requireUserVerification: true,
        credential: {
          id: credential.id,
          publicKey: new Uint8Array(credential.public_key),
          counter: Number(credential.counter),
          transports: credential.transports,
        },
      });
      if (!verified.verified) throw problem('PASSKEY_NOT_VERIFIED', 401);
      await client.query('UPDATE participant_passkeys SET counter=$2 WHERE id=$1', [
        credential.id,
        verified.authenticationInfo.newCounter,
      ]);
      return credential.participant_id;
    });
    return session(id, reply);
  });
  app.get('/api/participant/auth/session', async (req) => {
    const row = await authorize(req),
      csrf = token();
    await db.query('UPDATE participant_sessions SET csrf_hash=$2 WHERE token_hash=$1', [
      row.token_hash,
      hash(csrf),
    ]);
    return { authenticated: true, role: 'participant', participantId: row.participant_id, csrf };
  });
  app.post('/api/participant/auth/logout', async (req, reply) => {
    empty.parse(req.body);
    const row = await authorize(req);
    await db.query('DELETE FROM participant_sessions WHERE token_hash=$1', [row.token_hash]);
    reply.header('Set-Cookie', cookie('', 0));
    return { authenticated: false };
  });
  app.post('/api/participant/auth/pin/register', async (req, reply) => {
    testnetOnly();
    await limited(req);
    const input = z.object({ pin }).strict().parse(req.body);
    await rateLimit(
      db,
      privateRateKey(config.intentKey, req.ip, 'participant-pin-create'),
      5,
      3600,
    );
    const id = randomUUID(),
      loginCode = token(),
      salt = randomBytes(16).toString('base64url');
    const digest = await pinHash(input.pin, salt);
    await db.query(
      'INSERT INTO participants(id,pin_login_hash,pin_salt,pin_hash) VALUES($1,$2,$3,$4)',
      [id, hash(loginCode), salt, digest],
    );
    return { ...(await session(id, reply)), loginCode };
  });
  app.post('/api/participant/auth/pin/login', async (req, reply) => {
    testnetOnly();
    await limited(req);
    const input = pinLogin.parse(req.body);
    const loginHash = hash(input.loginCode);
    await rateLimit(
      db,
      privateRateKey(config.intentKey, loginHash, 'participant-pin-attempt'),
      5,
      900,
    );
    const result = await db.transaction(async (client) => {
      const row = (
        await client.query('SELECT * FROM participants WHERE pin_login_hash=$1 FOR UPDATE', [
          loginHash,
        ])
      ).rows[0];
      if (row?.pin_locked_until && new Date(row.pin_locked_until) > new Date()) return null;
      const derived = await pinHash(input.pin, row?.pin_salt ?? 'hauntbox-unknown-account');
      if (!row || !same(derived, row.pin_hash)) {
        if (row)
          await client.query(
            "UPDATE participants SET pin_failures=pin_failures+1,pin_locked_until=CASE WHEN pin_failures>=4 THEN now()+interval '15 minutes' ELSE pin_locked_until END WHERE id=$1",
            [row.id],
          );
        return null;
      }
      await client.query(
        'UPDATE participants SET pin_failures=0,pin_locked_until=null WHERE id=$1',
        [row.id],
      );
      return row.id;
    });
    if (!result) throw problem('PARTICIPANT_SIGN_IN_FAILED', 401);
    return session(result, reply);
  });
}
