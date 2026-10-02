import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { calculateJwkThumbprint } from 'jose';
import { ZodError } from 'zod';
import * as schemas from '../../packages/schema/index.mjs';
import { envelopeDigest, validateEnvelope } from '../../packages/crypto/index.ts';
import {
  hash,
  token,
  problem,
  same,
  rateLimit,
  privateRateKey,
  sealIntent,
  openIntent,
} from './security.mjs';
import { installAuth } from './auth.mjs';
import { installParticipantAuth } from './participant-auth.mjs';
import { openapi } from './openapi.mjs';
import { fundingService } from './funding.mjs';

const publicRoom = (row) => ({
  id: row.id,
  title: row.title,
  prompt: row.prompt,
  publicJwk: row.public_jwk,
  keyThumbprint: row.key_thumbprint,
  policyDigest: row.policy_digest,
  network: row.network,
  capacity: row.capacity,
  state: row.state,
  component: row.component,
});
const envelopeStatus = (row) => ({
  submissionId: row.id,
  roomId: row.room_id,
  digest: row.digest,
  state: row.state,
  receiptAvailable: row.state === 'confirmed',
});
export async function createApp(db, config, wallet) {
  // Neither request bodies nor HTTP headers, URL capabilities, credentials or wallet responses enter logs.
  const app = Fastify({
    logger: false,
    bodyLimit: 16384,
    trustProxy: false,
    requestTimeout: 15000,
  });
  app.setErrorHandler((error, req, reply) => {
    const status = error instanceof ZodError ? 400 : (error.statusCode ?? 500);
    reply.code(status).send({
      code:
        error instanceof ZodError
          ? 'INVALID_REQUEST'
          : (error.safeCode ?? (status < 500 ? 'REQUEST_REJECTED' : 'SERVICE_UNAVAILABLE')),
      requestId: req.id,
    });
  });
  app.addHook('onRequest', async (req, reply) => {
    reply
      .header('Cache-Control', 'no-store')
      .header('X-Content-Type-Options', 'nosniff')
      .header('Referrer-Policy', 'no-referrer');
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (req.headers.origin !== config.origin) throw problem('ORIGIN_CHECK_FAILED', 403);
      if (!String(req.headers['content-type'] ?? '').startsWith('application/json'))
        throw problem('JSON_REQUIRED', 415);
    }
  });
  const authorize = await installAuth(app, db, config);
  installParticipantAuth(app, db, config);
  const funding = fundingService(db, config, wallet);
  app.get('/api/funding/status', async () => funding.publicStatus(await funding.inspect()));
  app.get('/api/curator/funding/status', async (req) => {
    await authorize(req);
    return funding.inspect();
  });
  app.get('/api/openapi.json', async () => openapi);
  app.get('/health/live', async () => ({ status: 'alive' }));
  app.get('/health/ready', async (req, reply) => {
    try {
      await db.query('SELECT 1');
      return { status: 'ready' };
    } catch {
      return reply.code(503).send({ status: 'unavailable' });
    }
  });
  app.get('/api/status', async () => ({
    network: config.network,
    fixture: false,
    submissionsEnabled: config.submissions,
    anchoringEnabled: config.anchoring,
    payoutsEnabled: config.payouts,
  }));
  app.get('/api/rooms', async () => ({
    rooms: (await db.query('SELECT * FROM rooms ORDER BY created_at DESC LIMIT 50')).rows.map(
      publicRoom,
    ),
  }));
  async function findRoom(id, client = db, lock = false) {
    const row = (
      await client.query(`SELECT * FROM rooms WHERE id=$1${lock ? ' FOR UPDATE' : ''}`, [
        schemas.roomId.parse(id),
      ])
    ).rows[0];
    if (!row) throw problem('ROOM_NOT_FOUND', 404);
    return row;
  }
  app.get('/api/rooms/:id', async (req) => publicRoom(await findRoom(req.params.id)));
  app.post('/api/curator/rooms', async (req, reply) => {
    await authorize(req, true);
    await rateLimit(db, 'curator-room-creation', 6, 3600);
    const input = schemas.createRoom.parse(req.body);
    if ((await calculateJwkThumbprint(input.publicJwk)) !== input.keyThumbprint)
      throw problem('ROOM_KEY_MISMATCH');
    if (!config.anchoring) throw problem('ANCHORING_PAUSED', 503);
    await funding.requireReceipt();
    const id = randomUUID();
    const policyDigest = hash(
      JSON.stringify({
        version: 1,
        title: input.title,
        prompt: input.prompt,
        capacity: input.capacity,
        network: config.network,
        rewards: 'discretionary',
      }),
    );
    await db.transaction(async (client) => {
      await client.query(
        "INSERT INTO rooms(id,title,prompt,public_jwk,key_thumbprint,policy_digest,network,capacity,state) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'creating')",
        [
          id,
          input.title,
          input.prompt,
          JSON.stringify(input.publicJwk),
          input.keyThumbprint,
          policyDigest,
          config.network,
          input.capacity,
        ],
      );
      await client.query(
        "INSERT INTO jobs(id,kind,entity_id,state) VALUES($1,'create_room',$2,'queued')",
        [randomUUID(), id],
      );
      await client.query("INSERT INTO audit(event,entity_id) VALUES('room_requested',$1)", [id]);
    });
    return reply.code(202).send(publicRoom(await findRoom(id)));
  });
  app.post('/api/curator/rooms/:id/close', async (req) => {
    await authorize(req, true);
    return db.transaction(async (client) => {
      const room = await findRoom(req.params.id, client, true);
      if (room.state === 'closed' || room.state === 'closing') return publicRoom(room);
      if (room.state !== 'open') throw problem('ROOM_NOT_OPEN', 409);
      // Drain committed upload jobs before closing the chain component.
      await client.query("UPDATE rooms SET state='closing' WHERE id=$1", [room.id]);
      await client.query(
        "INSERT INTO jobs(id,kind,entity_id,state) VALUES($1,'close_room',$2,'queued') ON CONFLICT(kind,entity_id) DO NOTHING",
        [randomUUID(), room.id],
      );
      return { ...publicRoom(room), state: 'closing' };
    });
  });
  app.post('/api/rooms/:id/challenge', async (req) => {
    if (!config.submissions) throw problem('INTAKE_PAUSED', 503);
    await funding.requireReceipt();
    await rateLimit(db, privateRateKey(config.intentKey, req.ip, 'challenge'), 20, 300);
    const room = await findRoom(req.params.id);
    if (room.state !== 'open') throw problem('ROOM_NOT_OPEN', 409);
    const challenge = token();
    await db.query(
      "INSERT INTO challenges(token_hash,room_id,expires_at) VALUES($1,$2,now()+interval '3 minutes')",
      [hash(challenge), room.id],
    );
    return { challenge, expiresIn: 180 };
  });
  app.post('/api/rooms/:id/envelopes', async (req, reply) => {
    const input = schemas.submitEnvelope.parse(req.body),
      id = schemas.roomId.parse(req.params.id);
    if (req.headers['idempotency-key'] !== input.submissionId)
      throw problem('IDEMPOTENCY_KEY_REQUIRED');
    await rateLimit(db, privateRateKey(config.intentKey, req.ip, 'upload'), 30, 300);
    const result = await db.transaction(async (client) => {
      const room = await findRoom(id, client, true);
      const existing = (
        await client.query('SELECT * FROM envelopes WHERE id=$1', [input.submissionId])
      ).rows[0];
      if (existing) {
        if (
          existing.room_id !== id ||
          existing.jwe !== input.envelope ||
          existing.digest !== input.digest ||
          !same(existing.lookup_hash, hash(input.lookupCapability))
        )
          throw problem('IDEMPOTENCY_CONFLICT', 409);
        return envelopeStatus(existing);
      }
      if (!config.submissions) throw problem('INTAKE_PAUSED', 503);
      await funding.requireReceipt();
      if (room.state !== 'open' || !room.component) throw problem('ROOM_NOT_OPEN', 409);
      const count = (
        await client.query('SELECT count(*)::int AS count FROM envelopes WHERE room_id=$1', [id])
      ).rows[0].count;
      if (count >= room.capacity) throw problem('ROOM_FULL', 409);
      const challenge = (
        await client.query('SELECT * FROM challenges WHERE token_hash=$1 FOR UPDATE', [
          hash(input.challenge),
        ])
      ).rows[0];
      if (
        !challenge ||
        challenge.room_id !== id ||
        challenge.consumed ||
        new Date(challenge.expires_at) <= new Date()
      )
        throw problem('UPLOAD_CHALLENGE_EXPIRED', 401);
      try {
        validateEnvelope(input.envelope, {
          network: room.network,
          component: room.component,
          submissionId: input.submissionId,
          keyThumbprint: room.key_thumbprint,
        });
      } catch {
        throw problem('INVALID_ENCRYPTED_ENVELOPE');
      }
      if ((await envelopeDigest(input.envelope)) !== input.digest)
        throw problem('ENVELOPE_DIGEST_MISMATCH');
      await client.query('UPDATE challenges SET consumed=true WHERE token_hash=$1', [
        hash(input.challenge),
      ]);
      await client.query(
        "INSERT INTO envelopes(id,room_id,jwe,digest,lookup_hash,state) VALUES($1,$2,$3,$4,$5,'queued')",
        [input.submissionId, id, input.envelope, input.digest, hash(input.lookupCapability)],
      );
      await client.query(
        "INSERT INTO jobs(id,kind,entity_id,state) VALUES($1,'anchor',$2,'queued')",
        [randomUUID(), input.submissionId],
      );
      return {
        submissionId: input.submissionId,
        roomId: id,
        digest: input.digest,
        state: 'queued',
        receiptAvailable: false,
      };
    });
    return reply.code(202).send(result);
  });
  app.get('/api/envelopes/:id/status', async (req) => {
    const id = schemas.hex32.parse(req.params.id),
      bearer = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization ?? '')?.[1];
    const row = (await db.query('SELECT * FROM envelopes WHERE id=$1', [id])).rows[0];
    if (!row || !bearer || !same(hash(bearer), row.lookup_hash))
      throw problem('RECEIPT_LOOKUP_DENIED', 404);
    return envelopeStatus(row);
  });
  app.get('/api/receipts/:id', async (req) => {
    const row = (
      await db.query(
        'SELECT e.*,r.network,r.component,r.key_thumbprint,r.policy_digest FROM envelopes e JOIN rooms r ON r.id=e.room_id WHERE e.id=$1',
        [schemas.hex32.parse(req.params.id)],
      )
    ).rows[0];
    if (!row || row.state !== 'confirmed') throw problem('RECEIPT_NOT_ANCHORED', 404);
    return {
      version: 1,
      fixture: false,
      submissionId: row.id,
      digest: row.digest,
      network: row.network,
      component: row.component,
      epoch: String(row.epoch),
      transactionId: row.transaction_id,
      componentVersion: String(row.component_version),
      keyThumbprint: row.key_thumbprint,
      policyDigest: row.policy_digest,
      proves: 'Inclusion of encrypted bytes; no promise of authorship, availability or payment.',
    };
  });
  app.get('/api/curator/rooms/:id/envelopes', async (req) => {
    await authorize(req);
    await findRoom(req.params.id);
    const cursor = req.query.after ? schemas.hex32.parse(req.query.after) : '';
    const rows = (
      await db.query(
        "SELECT e.id,e.jwe,e.digest,e.state,r.id AS reward_id,r.state AS reward_state FROM envelopes e LEFT JOIN rewards r ON r.envelope_id=e.id AND r.state<>'failed' WHERE e.room_id=$1 AND e.id>$2 ORDER BY e.id LIMIT 25",
        [req.params.id, cursor],
      )
    ).rows;
    return {
      envelopes: rows.map((row) => ({
        submissionId: row.id,
        envelope: row.jwe,
        digest: row.digest,
        state: row.state,
        rewardId: row.reward_id,
        rewardState: row.reward_state,
      })),
      next: rows.length === 25 ? rows.at(-1).id : null,
    };
  });
  app.post('/api/curator/rewards/quote', async (req) => {
    await authorize(req, true);
    await rateLimit(db, 'curator-reward-quotes', 30, 300);
    const input = schemas.quoteReward.parse(req.body);
    if (!config.payouts) throw problem('PAYOUTS_PAUSED', 503);
    if (BigInt(input.amount) > BigInt(config.maxReward)) throw problem('REWARD_LIMIT_EXCEEDED');
    const envelope = (await db.query('SELECT * FROM envelopes WHERE id=$1', [input.submissionId]))
      .rows[0];
    if (!envelope || envelope.state !== 'confirmed') throw problem('ANCHORED_ENTRY_REQUIRED', 409);
    if (!wallet) throw problem('REWARD_WALLET_UNAVAILABLE', 503);
    const quote = await wallet.quoteReward(input.recipient, input.amount);
    if (BigInt(quote.maxFee) > BigInt(config.maxFee)) throw problem('FEE_LIMIT_EXCEEDED', 409);
    const id = randomUUID(),
      expiresAt = new Date(Date.now() + 120000).toISOString();
    const intent = {
      version: 1,
      id,
      network: config.network,
      recipient: input.recipient,
      amount: input.amount,
      maxFee: quote.maxFee,
      expiresAt,
    };
    await db.query(
      "INSERT INTO reward_quotes(id,envelope_id,sealed_intent,max_fee,expires_at,state) VALUES($1,$2,$3,$4,$5,'quoted')",
      [id, input.submissionId, await sealIntent(intent, config.intentKey), quote.maxFee, expiresAt],
    );
    return {
      quoteId: id,
      ...intent,
      disclosure:
        'Recipient and amount are disclosed to the operator wallet service. Sponsor-custodied testnet funds; rewards are discretionary.',
    };
  });
  app.post('/api/curator/rewards/:id/confirm', async (req, reply) => {
    await authorize(req, true);
    const input = schemas.confirmReward.parse({ ...req.body, quoteId: req.params.id });
    if (!config.payouts) throw problem('PAYOUTS_PAUSED', 503);
    await db.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(47389112)');
      const quote = (
        await client.query('SELECT * FROM reward_quotes WHERE id=$1 FOR UPDATE', [input.quoteId])
      ).rows[0];
      if (!quote) throw problem('QUOTE_NOT_FOUND', 404);
      if (quote.state === 'confirmed') return;
      if (quote.state !== 'quoted' || new Date(quote.expires_at) <= new Date())
        throw problem('QUOTE_EXPIRED', 409);
      const intent = await openIntent(quote.sealed_intent, config.intentKey);
      let used = 0n;
      const prior = await client.query(
        "SELECT q.sealed_intent FROM reward_quotes q JOIN rewards r ON r.id=q.id WHERE r.created_at>=date_trunc('day',now()) AND r.state<>'failed'",
      );
      for (const row of prior.rows)
        used += BigInt((await openIntent(row.sealed_intent, config.intentKey)).amount);
      if (used + BigInt(intent.amount) > BigInt(config.dailyReward))
        throw problem('DAILY_REWARD_LIMIT_EXCEEDED', 409);
      try {
        await client.query(
          "INSERT INTO rewards(id,envelope_id,state,max_fee) VALUES($1,$2,'queued',$3)",
          [quote.id, quote.envelope_id, quote.max_fee],
        );
      } catch (error) {
        if (error.code === '23505') throw problem('ENTRY_ALREADY_REWARDED', 409);
        throw error;
      }
      await client.query("UPDATE reward_quotes SET state='confirmed' WHERE id=$1", [quote.id]);
      await client.query(
        "INSERT INTO jobs(id,kind,entity_id,state) VALUES($1,'reward',$2,'queued')",
        [randomUUID(), quote.id],
      );
    });
    return reply.code(202).send({ rewardId: input.quoteId, state: 'queued' });
  });
  app.get('/api/curator/rewards/:id', async (req) => {
    await authorize(req);
    const row = (
      await db.query('SELECT id,state,transaction_id,max_fee,actual_fee FROM rewards WHERE id=$1', [
        schemas.roomId.parse(req.params.id),
      ])
    ).rows[0];
    if (!row) throw problem('REWARD_NOT_FOUND', 404);
    return {
      rewardId: row.id,
      state: row.state,
      transactionId: row.transaction_id,
      maxFee: row.max_fee,
      actualFee: row.actual_fee,
    };
  });
  return app;
}
