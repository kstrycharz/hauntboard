// Durable outbox/uncertainty tests with real PostgreSQL and an explicitly simulated signer.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { database } from '../../apps/api/db.mjs';
import { Worker } from '../../apps/worker/worker.mjs';
import { problem } from '../../apps/api/security.mjs';
let admin, db, config, wallet, submitted, verification;
const schema = `worker_${randomUUID().replaceAll('-', '')}`;
const transaction = 'a'.repeat(64),
  component = `component_${'b'.repeat(64)}`;
before(async () => {
  admin = database(process.env.DATABASE_URL);
  await admin.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(process.env.DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${schema}`);
  db = database(url.toString());
  await db.migrate();
});
after(async () => {
  await db?.close();
  if (admin) {
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.close();
  }
});
beforeEach(async () => {
  await db.query('TRUNCATE rooms CASCADE');
  await db.query('TRUNCATE jobs,audit');
  submitted = 0;
  verification = true;
  config = {
    network: 'localnet',
    anchoring: true,
    payouts: true,
    dailyFees: '50000',
    dailyReward: '1000000',
    intentKey: Buffer.alloc(32, 8),
  };
  wallet = {
    prepareRoom: async () => ({ instructions: ['fixture'], maxFee: '20000' }),
    submitCall: async () => {
      submitted++;
      return { transaction_id: transaction };
    },
    transaction: async () => ({
      status: 'Accepted',
      result: {
        transaction_hash: transaction,
        fee_receipt: { total_fees_paid: '10000' },
        result: { Accept: { up_substates: [[component, {}]] } },
      },
    }),
    verifyRoom: async () => {
      if (!verification) throw problem('UNVERIFIED_ROOM_COMPONENT', 503);
      return { value: [null, null, null, null, null, null, false, 0] };
    },
  };
});
async function queued() {
  const room = randomUUID(),
    job = randomUUID();
  await db.query(
    "INSERT INTO rooms(id,title,prompt,public_jwk,key_thumbprint,policy_digest,network,capacity,state) VALUES($1,'Fixture','Fixture','{}','fixture',$2,'localnet',128,'creating')",
    [room, '1'.repeat(64)],
  );
  await db.query("INSERT INTO jobs(id,kind,entity_id,state) VALUES($1,'create_room',$2,'queued')", [
    job,
    room,
  ]);
  return { room, job };
}
const jobRow = async (id) => (await db.query('SELECT * FROM jobs WHERE id=$1', [id])).rows[0];
test('concurrent workers submit one operation and restart reconciles without signing', async () => {
  const record = await queued();
  await Promise.all([new Worker(db, config, wallet).tick(), new Worker(db, config, wallet).tick()]);
  assert.equal(submitted, 1);
  assert.equal((await jobRow(record.job)).state, 'submitted');
  await new Worker(db, config, wallet).tick();
  assert.equal((await jobRow(record.job)).state, 'confirmed');
  assert.equal(submitted, 1);
  assert.equal(
    (await db.query('SELECT state FROM rooms WHERE id=$1', [record.room])).rows[0].state,
    'open',
  );
});
test('lost signing response freezes unknown and never resubmits', async () => {
  const record = await queued();
  wallet.submitCall = async () => {
    submitted++;
    throw problem('CONNECTION_LOST', 503);
  };
  await new Worker(db, config, wallet).tick();
  assert.equal((await jobRow(record.job)).state, 'unknown');
  assert.equal((await jobRow(record.job)).transaction_id, null);
  await new Worker(db, config, wallet).tick();
  assert.equal(submitted, 1);
  assert.equal((await jobRow(record.job)).max_fee, '20000');
});
test('crash with a reserved submission and no ID becomes unknown after lease expiry', async () => {
  const record = await queued();
  await db.query(
    "UPDATE jobs SET state='submitting',max_fee=20000,reserved_at=now(),lease_until=now()-interval '1 second' WHERE id=$1",
    [record.job],
  );
  await new Worker(db, config, wallet).tick();
  assert.equal((await jobRow(record.job)).state, 'unknown');
  assert.equal(submitted, 0);
});
test('accepted HTTP and transaction status cannot open an unverified component', async () => {
  const record = await queued();
  await new Worker(db, config, wallet).tick();
  verification = false;
  await new Worker(db, config, wallet).tick();
  assert.equal((await jobRow(record.job)).state, 'submitted');
  assert.equal(
    (await db.query('SELECT state FROM rooms WHERE id=$1', [record.room])).rows[0].state,
    'creating',
  );
  assert.equal(submitted, 1);
});
test('fee reserves include uncertain operations and reject before another signing call', async () => {
  const old = await queued();
  await db.query("UPDATE jobs SET state='unknown',max_fee=40000,reserved_at=now() WHERE id=$1", [
    old.job,
  ]);
  const next = await queued();
  await new Worker(db, config, wallet).tick();
  assert.equal((await jobRow(next.job)).state, 'failed');
  assert.equal((await jobRow(next.job)).error_code, 'DAILY_FEE_LIMIT_EXCEEDED');
  assert.equal(submitted, 0);
});
test('a safe preparation outage preserves queued work without reserving a fee', async () => {
  const record = await queued();
  wallet.prepareRoom = async () => {
    throw problem('DEPENDENCY_UNAVAILABLE', 503);
  };
  await new Worker(db, config, wallet).tick();
  assert.equal((await jobRow(record.job)).state, 'preparing');
  assert.equal((await jobRow(record.job)).max_fee, null);
  assert.equal(submitted, 0);
});
