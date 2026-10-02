import { openIntent, problem } from '../api/security.mjs';
import { exactRpcUnits } from '../../scripts/lib/wallet-funding-adapter.mjs';

export class Worker {
  constructor(db, config, wallet) {
    this.db = db;
    this.config = config;
    this.wallet = wallet;
  }
  async setEntity(client, job, state, details = {}) {
    if (job.kind === 'create_room' || job.kind === 'close_room') {
      const mapped =
        state === 'confirmed'
          ? job.kind === 'create_room'
            ? 'open'
            : 'closed'
          : state === 'unknown'
            ? 'unknown'
            : state === 'failed'
              ? 'failed'
              : null;
      if (mapped)
        await client.query(
          'UPDATE rooms SET state=$2,component=coalesce($3,component) WHERE id=$1',
          [job.entity_id, mapped, details.component ?? null],
        );
    } else if (job.kind === 'anchor')
      await client.query(
        'UPDATE envelopes SET state=$2,transaction_id=coalesce($3,transaction_id),epoch=coalesce($4,epoch),component_version=coalesce($5,component_version) WHERE id=$1',
        [job.entity_id, state, details.tx ?? null, details.epoch ?? null, details.version ?? null],
      );
    else
      await client.query(
        'UPDATE rewards SET state=$2,transaction_id=coalesce($3,transaction_id),actual_fee=coalesce($4,actual_fee) WHERE id=$1',
        [job.entity_id, state, details.tx ?? null, details.actualFee ?? null],
      );
  }
  async tick() {
    if (!this.wallet) return false;
    const lock = await this.db.pool.connect();
    try {
      if (!(await lock.query('SELECT pg_try_advisory_lock(47389113) AS acquired')).rows[0].acquired)
        return false;
      // The signer RPC constructs and broadcasts internally. Expired submission reservations
      // without a transaction ID are uncertain and must never trigger a second signing call.
      await this.db.transaction(async (client) => {
        const lost = await client.query(
          "UPDATE jobs SET state='unknown',error_code='SUBMISSION_OUTCOME_UNKNOWN',lease_until=null WHERE state='submitting' AND lease_until<now() RETURNING *",
        );
        for (const job of lost.rows) await this.setEntity(client, job, 'unknown');
      });
      const job = await this.db.transaction(async (client) => {
        const result = await client.query(
          "SELECT * FROM jobs WHERE (state='queued' OR (state='preparing' AND lease_until<now()) OR (state='submitted' AND (lease_until IS NULL OR lease_until<now()))) ORDER BY CASE WHEN state='submitted' THEN 0 ELSE 1 END,created_at FOR UPDATE SKIP LOCKED LIMIT 1",
        );
        const row = result.rows[0];
        if (!row) return null;
        if (row.kind === 'reward' ? !this.config.payouts : !this.config.anchoring) return null;
        await client.query(
          "UPDATE jobs SET state=CASE WHEN state='submitted' THEN state ELSE 'preparing' END,lease_until=now()+interval '90 seconds',attempts=attempts+1 WHERE id=$1",
          [row.id],
        );
        return { ...row, state: row.state === 'submitted' ? 'submitted' : 'preparing' };
      });
      if (!job) return false;
      try {
        if (job.state === 'submitted') await this.reconcile(job);
        else await this.prepareAndSubmit(job);
      } catch (error) {
        const current = (await this.db.query('SELECT * FROM jobs WHERE id=$1', [job.id])).rows[0];
        if (current.state === 'submitting')
          await this.finish(current, 'unknown', {}, 'SUBMISSION_OUTCOME_UNKNOWN');
        else if (current.state === 'submitted')
          await this.db.query(
            "UPDATE jobs SET lease_until=now()+interval '10 seconds',error_code='RECONCILIATION_PENDING' WHERE id=$1",
            [job.id],
          );
        else if (current.state === 'preparing') {
          // No signing call occurred. Reads/simulations may safely recover after a service outage.
          const retry = error.statusCode === 503 && current.attempts < 12;
          if (retry)
            await this.db.query(
              "UPDATE jobs SET lease_until=now()+interval '10 seconds',error_code='DEPENDENCY_UNAVAILABLE' WHERE id=$1",
              [job.id],
            );
          else await this.finish(current, 'failed', {}, error.safeCode ?? 'PREPARATION_REJECTED');
        }
      }
      return true;
    } finally {
      try {
        await lock.query('SELECT pg_advisory_unlock(47389113)');
      } finally {
        lock.release();
      }
    }
  }
  async records(job) {
    if (job.kind === 'reward')
      return {
        quote: (await this.db.query('SELECT * FROM reward_quotes WHERE id=$1', [job.entity_id]))
          .rows[0],
      };
    if (job.kind === 'anchor') {
      const envelope = (await this.db.query('SELECT * FROM envelopes WHERE id=$1', [job.entity_id]))
        .rows[0];
      return {
        envelope,
        room: (await this.db.query('SELECT * FROM rooms WHERE id=$1', [envelope.room_id])).rows[0],
      };
    }
    return {
      room: (await this.db.query('SELECT * FROM rooms WHERE id=$1', [job.entity_id])).rows[0],
    };
  }
  async prepareAndSubmit(job) {
    const { room, envelope, quote } = await this.records(job);
    let prepared, intent;
    if (job.kind === 'create_room') prepared = await this.wallet.prepareRoom(room);
    else if (job.kind === 'anchor') prepared = await this.wallet.prepareAnchor(room, envelope);
    else if (job.kind === 'close_room') {
      const remaining = (
        await this.db.query(
          "SELECT 1 FROM envelopes WHERE room_id=$1 AND state IN ('queued','submitted','unknown') LIMIT 1",
          [room.id],
        )
      ).rowCount;
      if (remaining) {
        await this.db.query(
          "UPDATE jobs SET state='queued',lease_until=null,created_at=now() WHERE id=$1",
          [job.id],
        );
        return;
      }
      prepared = await this.wallet.prepareClose(room);
    } else {
      intent = await openIntent(quote.sealed_intent, this.config.intentKey);
      if (
        intent.id !== job.entity_id ||
        intent.network !== this.config.network ||
        intent.maxFee !== String(quote.max_fee)
      )
        throw problem('REWARD_INTENT_MISMATCH');
      // Quote expiry governs approval; a durable approved intent survives worker restart.
      const measured = await this.wallet.quoteReward(intent.recipient, intent.amount);
      if (BigInt(measured.maxFee) > BigInt(intent.maxFee))
        throw problem('APPROVED_FEE_EXCEEDED', 409);
      prepared = { maxFee: intent.maxFee };
    }
    await this.db.transaction(async (client) => {
      const used = (
        await client.query(
          "SELECT coalesce(sum(coalesce(actual_fee,max_fee)),0)::text AS fees FROM jobs WHERE reserved_at>=date_trunc('day',now()) AND max_fee IS NOT NULL",
        )
      ).rows[0].fees;
      if (BigInt(used) + BigInt(prepared.maxFee) > BigInt(this.config.dailyFees))
        throw problem('DAILY_FEE_LIMIT_EXCEEDED', 409);
      if (job.kind === 'reward') {
        const previous = await client.query(
          "SELECT q.sealed_intent FROM jobs j JOIN reward_quotes q ON q.id::text=j.entity_id WHERE j.kind='reward' AND j.reserved_at>=date_trunc('day',now())",
        );
        let reserved = 0n;
        for (const row of previous.rows)
          reserved += BigInt((await openIntent(row.sealed_intent, this.config.intentKey)).amount);
        if (reserved + BigInt(intent.amount) > BigInt(this.config.dailyReward))
          throw problem('DAILY_REWARD_LIMIT_EXCEEDED', 409);
      }
      await client.query(
        "UPDATE jobs SET state='submitting',max_fee=$2,reserved_at=now(),lease_until=now()+interval '90 seconds' WHERE id=$1",
        [job.id, prepared.maxFee],
      );
      if (job.kind === 'reward') await this.setEntity(client, job, 'submitting');
      await client.query(
        "INSERT INTO audit(event,entity_id) VALUES('wallet_submission_reserved',$1)",
        [job.id],
      );
    });
    const submitted =
      job.kind === 'reward'
        ? await this.wallet.submitReward(intent)
        : await this.wallet.submitCall(prepared);
    if (!/^[a-f0-9]{64}$/.test(submitted.transaction_id))
      throw problem('SUBMISSION_OUTCOME_UNKNOWN', 503);
    await this.db.transaction(async (client) => {
      await client.query(
        "UPDATE jobs SET state='submitted',transaction_id=$2,lease_until=null WHERE id=$1",
        [job.id, submitted.transaction_id],
      );
      if (job.kind === 'reward' || job.kind === 'anchor')
        await this.setEntity(client, job, 'submitted', { tx: submitted.transaction_id });
    });
  }
  async reconcile(job) {
    const role = job.kind === 'reward' ? 'reward' : 'receipt';
    const tx = await this.wallet.transaction(role, job.transaction_id);
    if (['New', 'Pending'].includes(tx.status)) {
      await this.db.query("UPDATE jobs SET lease_until=now()+interval '3 seconds' WHERE id=$1", [
        job.id,
      ]);
      return;
    }
    const actualFee = tx.result?.fee_receipt
      ? exactRpcUnits(tx.result.fee_receipt.total_fees_paid)
      : null;
    if (tx.status !== 'Accepted' || !tx.result?.result?.Accept) {
      await this.finish(job, 'failed', { actualFee }, 'CHAIN_TRANSACTION_REJECTED');
      return;
    }
    if (
      tx.result.transaction_hash !== job.transaction_id ||
      !actualFee ||
      BigInt(actualFee) > BigInt(job.max_fee)
    )
      throw problem('TRANSACTION_RESULT_MISMATCH', 503);
    const records = await this.records(job);
    let details = { tx: job.transaction_id, actualFee };
    if (job.kind === 'create_room') {
      const address = tx.result.result.Accept.up_substates.find(
        ([id]) => typeof id === 'string' && id.startsWith('component_'),
      )?.[0];
      if (!address) throw problem('ROOM_COMPONENT_MISSING', 503);
      const verified = await this.wallet.verifyRoom({ ...records.room, component: address });
      if (verified.value[6] !== false || verified.value[7] !== 0)
        throw problem('NEW_ROOM_STATE_MISMATCH', 503);
      details.component = address;
    } else if (job.kind === 'anchor')
      details = {
        ...details,
        ...(await this.wallet.verifyReceipt(records.room, records.envelope)),
      };
    else if (job.kind === 'close_room') {
      if ((await this.wallet.verifyRoom(records.room)).value[6] !== true)
        throw problem('ROOM_CLOSE_NOT_VERIFIED', 503);
    } else this.wallet.checkPrivateTransfer(tx);
    await this.finish(job, 'confirmed', details);
  }
  async finish(job, state, details = {}, code = null) {
    await this.db.transaction(async (client) => {
      await client.query(
        'UPDATE jobs SET state=$2,actual_fee=coalesce($3,actual_fee),lease_until=null,error_code=$4 WHERE id=$1',
        [job.id, state, details.actualFee ?? null, code],
      );
      await this.setEntity(client, job, state, details);
      await client.query('INSERT INTO audit(event,entity_id,code) VALUES($1,$2,$3)', [
        `operation_${state}`,
        job.id,
        code,
      ]);
    });
  }
}
