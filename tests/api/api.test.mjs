// Isolated PostgreSQL integration fixtures. No wallet mutation or live receipt claim.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { database } from '../../apps/api/db.mjs';
import { createApp } from '../../apps/api/server.mjs';
import { hash, token } from '../../apps/api/security.mjs';
import { createRoomKey, sealStory, randomSubmissionId } from '../../packages/crypto/index.ts';
let db, admin, app, key, room, csrf, session, config;
const schema = `test_${randomUUID().replaceAll('-', '')}`;
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
    secureCookie: false,
    network: 'localnet',
    intentKey: Buffer.alloc(32, 5),
    bootstrapCode: token(),
    submissions: true,
    anchoring: true,
    payouts: true,
    maxReward: '100000000',
    dailyReward: '150000000',
    maxFee: '1000000',
  };
  app = await createApp(db, config, {
    quoteReward: async () => ({ maxFee: '20000' }),
    fundingStatus: async () => ({
      receiptRevealed: '1000000000',
      rewardConcealed: '1000000000',
      faucetBalance: '1000000000',
      faucetClaimAmount: '1000000000',
    }),
  });
  key = await createRoomKey();
  room = randomUUID();
  session = token();
  csrf = token();
  const curator = randomUUID();
  await db.query('INSERT INTO curator(id,user_id) VALUES($1,$2)', [curator, 'fixture']);
  await db.query(
    "INSERT INTO sessions(token_hash,curator_id,csrf_hash,authenticated_at,expires_at) VALUES($1,$2,$3,now(),now()+interval '1 hour')",
    [hash(session), curator, hash(csrf)],
  );
  await db.query(
    "INSERT INTO rooms(id,title,prompt,public_jwk,key_thumbprint,policy_digest,network,capacity,state,component) VALUES($1,'Fixture','Fixture',$2,$3,$4,'localnet',128,'open',$5)",
    [
      room,
      JSON.stringify(key.publicJwk),
      key.thumbprint,
      '1'.repeat(64),
      `component_${'2'.repeat(64)}`,
    ],
  );
});
after(async () => {
  await app?.close();
  await db?.close();
  if (admin) {
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.close();
  }
});
function request(method, url, payload, auth = false, extra = {}) {
  return app.inject({
    method,
    url,
    payload,
    headers: {
      ...(method === 'GET' ? {} : { origin: config.origin, 'content-type': 'application/json' }),
      ...(auth ? { cookie: `hauntbox_session=${session}`, 'x-hauntbox-csrf': csrf } : {}),
      ...extra,
    },
  });
}
async function submission() {
  const id = randomSubmissionId(),
    lookup = token();
  const context = {
    network: 'localnet',
    component: `component_${'2'.repeat(64)}`,
    submissionId: id,
    keyThumbprint: key.thumbprint,
  };
  const encrypted = await sealStory(
    { version: 1, text: 'A private synthetic story', payoutAddress: 'synthetic-private-address' },
    context,
    key.publicJwk,
  );
  const challenge = (await request('POST', `/api/rooms/${room}/challenge`, {})).json().challenge;
  return { submissionId: id, lookupCapability: lookup, challenge, ...encrypted };
}
test('strict ciphertext boundary rejects plaintext/private keys and foreign origin', async () => {
  const input = await submission();
  for (const extra of [
    { text: 'plaintext' },
    { privateKey: 'secret' },
    { scenario: 'confirmed' },
  ]) {
    const response = await request(
      'POST',
      `/api/rooms/${room}/envelopes`,
      { ...input, ...extra },
      false,
      { 'idempotency-key': input.submissionId },
    );
    assert.equal(response.statusCode, 400);
  }
  const foreign = await request('POST', `/api/rooms/${room}/challenge`, {}, false, {
    origin: 'https://foreign.example',
  });
  assert.equal(foreign.statusCode, 403);
});
test('concurrent duplicate uploads store one exact ciphertext and one outbox job', async () => {
  const input = await submission();
  const responses = await Promise.all(
    Array.from({ length: 4 }, () =>
      request('POST', `/api/rooms/${room}/envelopes`, input, false, {
        'idempotency-key': input.submissionId,
      }),
    ),
  );
  assert(responses.every((r) => r.statusCode === 202));
  const stored = (await db.query('SELECT * FROM envelopes WHERE id=$1', [input.submissionId]))
    .rows[0];
  assert.equal(stored.jwe, input.envelope);
  assert(!stored.jwe.includes('private synthetic'));
  assert.equal(stored.lookup_hash, hash(input.lookupCapability));
  assert.equal(
    (
      await db.query('SELECT count(*)::int AS count FROM jobs WHERE entity_id=$1', [
        input.submissionId,
      ])
    ).rows[0].count,
    1,
  );
  const changed = await request(
    'POST',
    `/api/rooms/${room}/envelopes`,
    { ...input, digest: '3'.repeat(64) },
    false,
    { 'idempotency-key': input.submissionId },
  );
  assert.equal(changed.statusCode, 409);
});
test('one-use challenge rolls back invalid context and rejects replay on a new entry', async () => {
  const input = await submission();
  const bad = await request(
    'POST',
    `/api/rooms/${room}/envelopes`,
    { ...input, submissionId: randomSubmissionId() },
    false,
    { 'idempotency-key': 'bad' },
  );
  assert.equal(bad.statusCode, 400);
  assert.equal(
    (await db.query('SELECT consumed FROM challenges WHERE token_hash=$1', [hash(input.challenge)]))
      .rows[0].consumed,
    false,
  );
  assert.equal(
    (
      await request('POST', `/api/rooms/${room}/envelopes`, input, false, {
        'idempotency-key': input.submissionId,
      })
    ).statusCode,
    202,
  );
  const next = await submission();
  next.challenge = input.challenge;
  assert.equal(
    (
      await request('POST', `/api/rooms/${room}/envelopes`, next, false, {
        'idempotency-key': next.submissionId,
      })
    ).statusCode,
    401,
  );
});
test('lookup capability and curator authorization isolate ciphertext', async () => {
  const input = await submission();
  await request('POST', `/api/rooms/${room}/envelopes`, input, false, {
    'idempotency-key': input.submissionId,
  });
  assert.equal(
    (await request('GET', `/api/envelopes/${input.submissionId}/status`)).statusCode,
    404,
  );
  const status = await request(
    'GET',
    `/api/envelopes/${input.submissionId}/status`,
    undefined,
    false,
    { authorization: `Bearer ${input.lookupCapability}` },
  );
  assert.equal(status.statusCode, 200);
  assert(!status.body.includes(input.envelope));
  assert.equal((await request('GET', `/api/curator/rooms/${room}/envelopes`)).statusCode, 401);
  assert.equal(
    (await request('GET', `/api/curator/rooms/${room}/envelopes`, undefined, true)).statusCode,
    200,
  );
  assert.equal((await request('GET', `/api/receipts/${input.submissionId}`)).statusCode, 404);
});
test('room creation requires fresh session, CSRF and matching immutable key', async () => {
  const input = {
    title: 'The Last Letter',
    prompt: 'Send a story',
    publicJwk: key.publicJwk,
    keyThumbprint: key.thumbprint,
    capacity: 128,
    recoveryVerified: true,
  };
  assert.equal(
    (await request('POST', '/api/curator/rooms', input, true, { 'x-hauntbox-csrf': 'wrong' }))
      .statusCode,
    403,
  );
  assert.equal(
    (await request('POST', '/api/curator/rooms', { ...input, keyThumbprint: token() }, true))
      .statusCode,
    400,
  );
  const created = await request('POST', '/api/curator/rooms', input, true);
  assert.equal(created.statusCode, 202);
  assert.equal(created.json().state, 'creating');
  assert.equal(created.json().component, null);
  await db.query(
    "UPDATE sessions SET authenticated_at=now()-interval '6 minutes' WHERE token_hash=$1",
    [hash(session)],
  );
  assert.equal((await request('POST', '/api/curator/rooms', input, true)).statusCode, 401);
  await db.query('UPDATE sessions SET authenticated_at=now() WHERE token_hash=$1', [hash(session)]);
});
test('confirmed quote cannot be mutated or double-paid by concurrent confirmations', async () => {
  const input = await submission();
  await request('POST', `/api/rooms/${room}/envelopes`, input, false, {
    'idempotency-key': input.submissionId,
  });
  // Database fixture is explicitly not a chain confirmation; this checks intent concurrency only.
  await db.query("UPDATE envelopes SET state='confirmed' WHERE id=$1", [input.submissionId]);
  const quote = (
    await request(
      'POST',
      '/api/curator/rewards/quote',
      {
        submissionId: input.submissionId,
        recipient: 'synthetic',
        amount: '100000000',
        disclosureAccepted: true,
      },
      true,
    )
  ).json();
  assert(quote.quoteId);
  const payload = { confirmation: 'SEND PRIVATE TESTNET REWARD' };
  assert.equal(
    (
      await request(
        'POST',
        `/api/curator/rewards/${quote.quoteId}/confirm`,
        { ...payload, amount: '200000000' },
        true,
      )
    ).statusCode,
    400,
  );
  const results = await Promise.all([
    request('POST', `/api/curator/rewards/${quote.quoteId}/confirm`, payload, true),
    request('POST', `/api/curator/rewards/${quote.quoteId}/confirm`, payload, true),
  ]);
  assert(results.every((r) => r.statusCode === 202));
  assert.equal(
    (await db.query('SELECT count(*)::int AS count FROM rewards WHERE id=$1', [quote.quoteId]))
      .rows[0].count,
    1,
  );
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS count FROM jobs WHERE kind='reward' AND entity_id=$1",
        [quote.quoteId],
      )
    ).rows[0].count,
    1,
  );
});
test('expired quote and per-reward cap reject before an outbox mutation', async () => {
  const id = (await db.query("SELECT id FROM envelopes WHERE state='confirmed' LIMIT 1")).rows[0]
    .id;
  const input = {
    submissionId: id,
    recipient: 'synthetic',
    amount: '100000001',
    disclosureAccepted: true,
  };
  assert.equal((await request('POST', '/api/curator/rewards/quote', input, true)).statusCode, 400);
  const quote = (
    await request('POST', '/api/curator/rewards/quote', { ...input, amount: '1' }, true)
  ).json();
  await db.query("UPDATE reward_quotes SET expires_at=now()-interval '1 second' WHERE id=$1", [
    quote.quoteId,
  ]);
  assert.equal(
    (
      await request(
        'POST',
        `/api/curator/rewards/${quote.quoteId}/confirm`,
        { confirmation: 'SEND PRIVATE TESTNET REWARD' },
        true,
      )
    ).statusCode,
    409,
  );
});
test('logout revokes the durable session', async () => {
  assert.equal((await request('POST', '/api/auth/logout', {}, true)).statusCode, 200);
  assert.equal((await request('GET', '/api/auth/session', undefined, true)).statusCode, 401);
});
