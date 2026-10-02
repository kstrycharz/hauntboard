// Internal funding control. Private ledger belongs in ignored data/, never public evidence.
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';

const U64_MAX = (1n << 64n) - 1n;
export function units(value, positive = false) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value))
    throw new Error('INVALID_BASE_UNITS');
  const parsed = BigInt(value);
  if (parsed > U64_MAX || (positive && parsed === 0n)) throw new Error('INVALID_BASE_UNITS');
  return parsed;
}
export function validatePolicy(input) {
  const p = structuredClone(input);
  if (
    !['development', 'ci', 'staging', 'production'].includes(p.environment) ||
    !['localnet', 'esmeralda', 'mainnet'].includes(p.network) ||
    !['local-faucet', 'public-faucet', 'treasury', 'disabled'].includes(p.provider)
  )
    throw new Error('INVALID_FUNDING_POLICY');
  for (const key of ['instance', 'resource', 'account', 'purpose', 'runId'])
    if (typeof p[key] !== 'string' || !p[key].trim() || p[key].length > 256)
      throw new Error('INVALID_FUNDING_POLICY');
  if (typeof p.enabled !== 'boolean') throw new Error('INVALID_FUNDING_POLICY');
  const faucet = p.provider.endsWith('faucet');
  if (p.network === 'mainnet' && (faucet || p.faucetTokenFile || p.faucetEnabled))
    throw new Error('MAINNET_FAUCET_FORBIDDEN');
  if (
    (p.provider === 'local-faucet' && p.network !== 'localnet') ||
    (p.provider === 'public-faucet' && p.network !== 'esmeralda')
  )
    throw new Error('WRONG_FUNDING_NETWORK');
  for (const key of ['maxFee', 'runCap', 'dailyCap', 'requiredBalance', 'targetBalance', 'hotCap'])
    units(p[key], true);
  if (
    units(p.requiredBalance) > units(p.targetBalance) ||
    units(p.targetBalance) > units(p.hotCap) ||
    units(p.maxFee) > units(p.runCap) ||
    units(p.runCap) > units(p.dailyCap)
  )
    throw new Error('INCONSISTENT_FUNDING_LIMITS');
  // Respect one claim per account/network instance; no public-account farming.
  if (
    p.maxClaims !== 1 ||
    !Number.isInteger(p.maxClaimsPerRun) ||
    p.maxClaimsPerRun < 1 ||
    p.maxClaimsPerRun > 10
  )
    throw new Error('INVALID_CLAIM_LIMIT');
  return Object.freeze(p);
}

export function policyFromEnv(env) {
  function boolean(name, fallback = false) {
    if (env[name] === undefined || env[name] === '') return fallback;
    if (!['true', 'false'].includes(env[name])) throw new Error('INVALID_FUNDING_POLICY');
    return env[name] === 'true';
  }
  const purpose = env.FUNDING_PURPOSE;
  if (!['fees', 'rewards', 'ci'].includes(purpose)) throw new Error('INVALID_FUNDING_PURPOSE');
  const accountKey = { fees: 'FEE_ACCOUNT', rewards: 'REWARD_ACCOUNT', ci: 'CI_RESERVE_ACCOUNT' }[
    purpose
  ];
  const lowKey = {
    fees: 'FEE_LOW_WATERMARK',
    rewards: 'REWARD_LOW_WATERMARK',
    ci: 'CI_LOW_WATERMARK',
  }[purpose];
  const provider = env.FUNDING_PROVIDER;
  const faucetEnabled = boolean('FAUCET_ENABLED');
  if (provider?.endsWith('faucet') && !faucetEnabled) throw new Error('FAUCET_DISABLED');
  const count = env.MAX_PUBLIC_CLAIMS_PER_RUN ?? '1';
  if (!/^[1-9][0-9]*$/.test(count)) throw new Error('INVALID_CLAIM_LIMIT');
  return validatePolicy({
    environment: env.APP_ENV,
    network: env.NETWORK,
    instance: env.NETWORK_INSTANCE_ID,
    resource: env.EXPECTED_NATIVE_RESOURCE,
    account: env[accountKey],
    purpose,
    runId: env.FUNDING_RUN_ID,
    provider,
    enabled: boolean('FUNDING_AUTOMATION_ENABLED'),
    faucetEnabled,
    faucetTokenFile: env.FAUCET_ADMIN_TOKEN_FILE,
    maxFee: env.FAUCET_MAX_FEE_BASE_UNITS,
    runCap: env.MAX_RUN_SPEND_BASE_UNITS,
    dailyCap: env.MAX_DAILY_SPEND_BASE_UNITS,
    requiredBalance: env[lowKey],
    targetBalance: env.TARGET_BALANCE,
    hotCap: env.HOT_WALLET_CAP,
    maxClaims: 1,
    maxClaimsPerRun: Number(count),
  });
}

export class FundingLedger {
  constructor(path) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS funding (
        id TEXT PRIMARY KEY, domain TEXT NOT NULL, run TEXT NOT NULL, day TEXT NOT NULL,
        state TEXT NOT NULL, claim_attempts INTEGER NOT NULL DEFAULT 0,
        fee TEXT NOT NULL DEFAULT '0', reserved TEXT NOT NULL DEFAULT '0',
        tx TEXT, owner TEXT, updated INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS funding_budget ON funding(domain, day, run);`);
  }
  close() {
    this.db.close();
  }
  atomic(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const value = fn();
      this.db.exec('COMMIT');
      return value;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  get(id) {
    return this.db.prepare('SELECT * FROM funding WHERE id=?').get(id);
  }
  save(id, changes) {
    const allowed = ['state', 'claim_attempts', 'fee', 'reserved', 'tx', 'owner', 'run', 'day'];
    if (Object.keys(changes).some((k) => !allowed.includes(k)))
      throw new Error('INVALID_LEDGER_UPDATE');
    this.db
      .prepare(
        `UPDATE funding SET ${Object.keys(changes)
          .map((k) => `${k}=?`)
          .join(',')}, updated=? WHERE id=?`,
      )
      .run(...Object.values(changes), Date.now(), id);
  }
}

// An adapter must verify account ownership, authentication, network instance and native resource.
// inspect(): {network,instance,resource,owned,authenticated,spendable,fundingOrigin,faucetBalance,claimAmount,eligible}
// claim({account,maxFee}): {status:'confirmed'|'rejected'|'pending',transactionId,fee?}
// reconcile(record): same, or {status:'unknown'}; never sends a mutation.
export class FundingService {
  constructor(policy, ledger, adapter, now = () => new Date()) {
    this.policy = validatePolicy(policy);
    this.ledger = ledger;
    this.adapter = adapter;
    this.now = now;
    this.domain = createHash('sha256')
      .update(JSON.stringify([policy.network, policy.instance, policy.resource]))
      .digest('hex');
    // Account lease is shared across purposes: changing purpose must not permit a second claim.
    this.id = createHash('sha256')
      .update(JSON.stringify([this.domain, policy.account]))
      .digest('hex');
  }
  summary() {
    const r = this.ledger.get(this.id);
    const state = r?.state ?? 'unfunded';
    // No account, value, credential, transaction or raw RPC error in public status.
    return {
      state,
      status:
        state === 'funded'
          ? 'READY'
          : ['empty', 'missing_faucet', 'unavailable'].includes(state)
            ? 'BLOCKED_INFRA'
            : ['failed', 'policy_breach'].includes(state)
              ? 'FAILED'
              : 'ACTION_REQUIRED',
      needsReconciliation: ['claiming', 'pending', 'unknown'].includes(r?.state),
    };
  }
  verify(snapshot) {
    const p = this.policy;
    if (
      snapshot.network !== p.network ||
      snapshot.instance !== p.instance ||
      snapshot.resource !== p.resource
    )
      throw new Error('NETWORK_RESOURCE_MISMATCH');
    if (snapshot.owned !== true || snapshot.authenticated !== true)
      throw new Error('ACCOUNT_AUTH_REQUIRED');
    units(snapshot.spendable);
    if (units(snapshot.spendable) > 0n && snapshot.fundingOrigin !== 'faucet')
      throw new Error('UNVERIFIED_FAUCET_ORIGIN');
  }
  async ensureFunded() {
    const p = this.policy;
    if (!p.enabled || p.provider === 'disabled' || p.provider === 'treasury')
      return {
        state: p.provider === 'treasury' ? 'treasury_required' : 'disabled',
        needsReconciliation: false,
      };
    const owner = randomUUID();
    const acquired = this.ledger.atomic(() => {
      const old = this.ledger.get(this.id);
      if (
        old &&
        (old.owner || ['claiming', 'pending', 'unknown', 'policy_breach'].includes(old.state))
      )
        return false;
      if (!old)
        this.ledger.db
          .prepare(
            'INSERT INTO funding(id,domain,run,day,state,owner,updated) VALUES(?,?,?,?,?,?,?)',
          )
          .run(
            this.id,
            this.domain,
            p.runId,
            this.now().toISOString().slice(0, 10),
            'inspecting',
            owner,
            Date.now(),
          );
      else this.ledger.save(this.id, { owner, state: 'inspecting' });
      return true;
    });
    if (!acquired) return this.summary();
    try {
      const snapshot = await this.adapter.inspect(p.account);
      this.verify(snapshot);
      if (units(snapshot.spendable) > units(p.hotCap)) return this.finish('policy_breach', owner);
      if (units(snapshot.spendable) >= units(p.requiredBalance))
        return this.finish('funded', owner);
      const old = this.ledger.get(this.id);
      if (old.claim_attempts >= p.maxClaims || snapshot.eligible === false)
        return this.finish('ineligible', owner);
      if (snapshot.eligible !== true) return this.finish('eligibility_unknown', owner);
      if (snapshot.faucetBalance === null) return this.finish('missing_faucet', owner);
      const claim = units(snapshot.claimAmount, true);
      if (units(snapshot.faucetBalance) < claim) return this.finish('empty', owner);
      if (units(snapshot.spendable) + claim > units(p.hotCap))
        return this.finish('claim_exceeds_cap', owner);
      const reserved = this.ledger.atomic(() => {
        const current = this.ledger.get(this.id);
        if (current.owner !== owner) throw new Error('LOST_FUNDING_LEASE');
        const day = this.now().toISOString().slice(0, 10);
        const rows = this.ledger.db
          .prepare('SELECT * FROM funding WHERE domain=?')
          .all(this.domain);
        const cost = (row) => units(row.fee) + units(row.reserved);
        const daily = rows
          .filter((r) => r.day === day || units(r.reserved) > 0n)
          .reduce((s, r) => s + cost(r), 0n);
        const run = rows.filter((r) => r.run === p.runId).reduce((s, r) => s + cost(r), 0n);
        const claims = rows
          .filter((r) => r.run === p.runId)
          .reduce((s, r) => s + r.claim_attempts, 0);
        if (
          daily + units(p.maxFee) > units(p.dailyCap) ||
          run + units(p.maxFee) > units(p.runCap) ||
          claims >= p.maxClaimsPerRun
        )
          return false;
        this.ledger.save(this.id, {
          state: 'claiming',
          claim_attempts: current.claim_attempts + 1,
          reserved: p.maxFee,
          run: p.runId,
          day,
        });
        return true;
      });
      if (!reserved) return this.finish('budget_exhausted', owner);
      // No mutation retry. All exceptions after durable reservation become unknown.
      let result;
      try {
        result = await this.adapter.claim({ account: p.account, maxFee: p.maxFee });
      } catch {
        return this.finish('unknown', owner);
      }
      return await this.applyResult(result, owner);
    } catch (error) {
      const current = this.ledger.get(this.id);
      const infrastructure = error?.code === 'NETWORK_UNAVAILABLE';
      return this.finish(
        current.state === 'claiming' ? 'unknown' : infrastructure ? 'unavailable' : 'failed',
        owner,
      );
    }
  }
  finish(state, owner, extra = {}) {
    this.ledger.atomic(() => {
      if (this.ledger.get(this.id)?.owner !== owner) throw new Error('LOST_FUNDING_LEASE');
      this.ledger.save(this.id, { ...extra, state, owner: null });
    });
    return this.summary();
  }
  async applyResult(result, owner) {
    if (!result || !['confirmed', 'rejected', 'pending', 'unknown'].includes(result.status))
      return this.finish('unknown', owner);
    const tx =
      typeof result.transactionId === 'string' && /^[a-f0-9]{64}$/.test(result.transactionId)
        ? result.transactionId
        : null;
    if (!tx) return this.finish('unknown', owner);
    const prior = this.ledger.get(this.id).tx;
    if (prior && prior !== tx) return this.finish('unknown', owner);
    if (result.status === 'pending' || result.status === 'unknown')
      return this.finish(result.status, owner, { tx });
    let fee;
    try {
      fee = units(result.fee);
    } catch {
      return this.finish('unknown', owner, { tx });
    }
    if (fee > units(this.policy.maxFee))
      return this.finish('policy_breach', owner, { tx, fee: result.fee, reserved: '0' });
    if (result.status === 'rejected')
      return this.finish('rejected', owner, { tx, fee: result.fee, reserved: '0' });
    // Finalized claim is retained even if the following wallet refresh fails.
    this.ledger.atomic(() => this.ledger.save(this.id, { tx, fee: result.fee, reserved: '0' }));
    try {
      const snapshot = await this.adapter.inspect(this.policy.account);
      this.verify(snapshot);
      if (units(snapshot.spendable) > units(this.policy.hotCap))
        return this.finish('policy_breach', owner);
      if (units(snapshot.spendable) < units(this.policy.requiredBalance))
        return this.finish('insufficient_after_claim', owner);
      return this.finish('funded', owner);
    } catch {
      return this.finish('unknown', owner);
    }
  }
  async reconcile() {
    const owner = randomUUID();
    const acquired = this.ledger.atomic(() => {
      const r = this.ledger.get(this.id);
      if (!r || r.owner || !['claiming', 'pending', 'unknown'].includes(r.state)) return false;
      this.ledger.save(this.id, { owner });
      return true;
    });
    if (!acquired) return this.summary();
    try {
      return await this.applyResult(await this.adapter.reconcile(this.ledger.get(this.id)), owner);
    } catch {
      return this.finish('unknown', owner);
    }
  }
  // Explicit operator recovery only, after proving the prior worker is stopped.
  // Never steal an active lease on a timer; uncertain claims still reconcile, never resend.
  recoverStoppedWorker() {
    this.ledger.atomic(() => {
      const r = this.ledger.get(this.id);
      if (r?.owner) this.ledger.save(this.id, { owner: null, state: 'unknown' });
    });
    return this.summary();
  }
}
