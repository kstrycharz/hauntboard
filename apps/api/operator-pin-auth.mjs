import { randomUUID, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { pinHash } from './pin-security.mjs';
import { hash, token, same, problem, rateLimit, privateRateKey } from './security.mjs';
export function installOperatorPinAuth(app, db, config, startSession, limited) {
  const pin = z.string().regex(/^[0-9]{8,12}$/),
    code = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
  const testnetOnly = () => {
    if (!['localnet', 'esmeralda'].includes(config.network))
      throw problem('PIN_SIGN_IN_TESTNET_ONLY', 403);
  };
  app.post('/api/auth/pin/register', async (req, reply) => {
    testnetOnly();
    await limited(req);
    const input = z.object({ pin, bootstrapCode: code }).strict().parse(req.body);
    if (!config.bootstrapCode || !same(hash(input.bootstrapCode), hash(config.bootstrapCode)))
      throw problem('REGISTRATION_NOT_AVAILABLE', 403);
    const loginCode = token(),
      salt = randomBytes(16).toString('base64url'),
      digest = await pinHash(input.pin, salt);
    const id = await db.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(47389111)');
      if ((await client.query('SELECT 1 FROM curator LIMIT 1')).rowCount)
        throw problem('CURATOR_ALREADY_REGISTERED', 409);
      const id = randomUUID();
      await client.query(
        'INSERT INTO curator(id,user_id,pin_login_hash,pin_salt,pin_hash) VALUES($1,$2,$3,$4,$5)',
        [id, 'hauntbox-curator', hash(loginCode), salt, digest],
      );
      return id;
    });
    return { ...(await startSession(id, reply, 'pin')), loginCode };
  });
  app.post('/api/auth/pin/login', async (req, reply) => {
    testnetOnly();
    await limited(req);
    const input = z.object({ pin, loginCode: code }).strict().parse(req.body),
      loginHash = hash(input.loginCode);
    await rateLimit(db, privateRateKey(config.intentKey, loginHash, 'host-pin-attempt'), 5, 900);
    const id = await db.transaction(async (client) => {
      const row = (
        await client.query('SELECT * FROM curator WHERE pin_login_hash=$1 FOR UPDATE', [loginHash])
      ).rows[0];
      if (row?.pin_locked_until && new Date(row.pin_locked_until) > new Date()) return null;
      const derived = await pinHash(input.pin, row?.pin_salt ?? 'hauntbox-unknown-host');
      if (!row || !same(derived, row.pin_hash)) {
        if (row)
          await client.query(
            "UPDATE curator SET pin_failures=pin_failures+1,pin_locked_until=CASE WHEN pin_failures>=4 THEN now()+interval '15 minutes' ELSE pin_locked_until END WHERE id=$1",
            [row.id],
          );
        return null;
      }
      await client.query('UPDATE curator SET pin_failures=0,pin_locked_until=null WHERE id=$1', [
        row.id,
      ]);
      return row.id;
    });
    if (!id) throw problem('PARTICIPANT_SIGN_IN_FAILED', 401);
    return startSession(id, reply, 'pin');
  });
}
