import { readFile } from 'node:fs/promises';
export async function configuration(env = process.env) {
  const origin = new URL(env.APP_ORIGIN ?? 'http://localhost:5173');
  const local = env.APP_NETWORK === 'localnet';
  if (!['localnet', 'esmeralda'].includes(env.APP_NETWORK)) throw new Error('APP_NETWORK_REQUIRED');
  if (origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password)
    throw new Error('INVALID_APP_ORIGIN');
  if (
    !local &&
    origin.protocol !== 'https:' &&
    !(env.LOCAL_HTTP_PREVIEW === 'true' && ['localhost', '127.0.0.1'].includes(origin.hostname))
  )
    throw new Error('PUBLIC_APP_REQUIRES_HTTPS');
  if (local && !['localhost', '127.0.0.1'].includes(origin.hostname))
    throw new Error('LOCAL_APP_ORIGIN_MUST_BE_LOOPBACK');
  const localHostSetup = env.LOCAL_HOST_SETUP === 'true';
  if (
    localHostSetup &&
    (!['localhost', '127.0.0.1'].includes(origin.hostname) ||
      (!local && env.LOCAL_HTTP_PREVIEW !== 'true'))
  )
    throw new Error('LOCAL_HOST_SETUP_REQUIRES_LOOPBACK');
  const intentKey = Buffer.from((await readFile(env.INTENT_KEY_FILE, 'utf8')).trim(), 'base64url');
  if (intentKey.length !== 32) throw new Error('INTENT_KEY_MUST_BE_32_BYTES');
  const bootstrapCode = env.BOOTSTRAP_CODE_FILE
    ? (await readFile(env.BOOTSTRAP_CODE_FILE, 'utf8')).trim()
    : null;
  if (bootstrapCode && !/^[A-Za-z0-9_-]{43}$/.test(bootstrapCode))
    throw new Error('INVALID_BOOTSTRAP_CODE');
  const units = (name, fallback) => {
    const value = env[name] ?? fallback;
    if (!/^[1-9][0-9]{0,18}$/.test(value)) throw new Error(`INVALID_${name}`);
    return value;
  };
  const databaseUrl = env.DATABASE_PASSWORD_FILE
    ? `postgres://hauntbox:${encodeURIComponent((await readFile(env.DATABASE_PASSWORD_FILE, 'utf8')).trim())}@${env.DATABASE_HOST ?? 'database'}:5432/hauntbox`
    : env.DATABASE_URL;
  return {
    origin: origin.origin,
    rpId: origin.hostname,
    secureCookie: origin.protocol === 'https:',
    network: env.APP_NETWORK,
    intentKey,
    bootstrapCode,
    localHostSetup,
    databaseUrl,
    submissions: env.SUBMISSIONS_ENABLED === 'true',
    anchoring: env.ANCHORING_ENABLED === 'true',
    payouts: env.PAYOUTS_ENABLED === 'true',
    maxReward: units('MAX_REWARD_UNITS', '100000000'),
    dailyReward: units('DAILY_REWARD_UNITS', '500000000'),
    maxFee: units('MAX_OPERATION_FEE_UNITS', '1000000'),
    dailyFees: units('DAILY_FEE_UNITS', '10000000'),
  };
}
