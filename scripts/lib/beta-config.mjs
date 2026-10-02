// Prepared production Esmeralda infrastructure; live application gates stay closed.
export function validateBetaConfig(env) {
  function requireValue(condition, code) {
    if (!condition) throw Object.assign(new Error(code), { code });
  }
  requireValue(
    env.APP_ENV === 'production' && env.NETWORK === 'esmeralda',
    'BETA_NETWORK_REQUIRED',
  );
  requireValue(
    env.FUNDING_PROVIDER === 'public-faucet' && env.FAUCET_ENABLED === 'true',
    'FAUCET_ONLY_BETA_REQUIRED',
  );
  for (const flag of [
    'FUNDING_AUTOMATION_ENABLED',
    'SUBMISSIONS_ENABLED',
    'ANCHORING_ENABLED',
    'PAYOUTS_ENABLED',
  ])
    requireValue(env[flag] === 'false', 'LIVE_GATE_NOT_PASSED');
  const urls = [env.BETA_INDEXER_URL, env.BETA_SECONDARY_INDEXER_URL].map((value) => {
    let url;
    try {
      url = new URL(value);
    } catch {
      requireValue(false, 'INVALID_INDEXER_URL');
    }
    requireValue(
      url.protocol === 'https:' &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        !url.port &&
        url.pathname === '/',
      'INVALID_INDEXER_URL',
    );
    requireValue(
      ['ootle-indexer-a.tari.com', 'ootle-indexer-b.tari.com'].includes(url.hostname),
      'TARI_INDEXER_REQUIRED',
    );
    return url.href;
  });
  requireValue(urls[0] !== urls[1], 'INDEPENDENT_INDEXER_ENDPOINTS_REQUIRED');
  if (env.PUBLIC_APP_ORIGIN) {
    let origin;
    try {
      origin = new URL(env.PUBLIC_APP_ORIGIN);
    } catch {
      requireValue(false, 'INVALID_PUBLIC_ORIGIN');
    }
    requireValue(
      origin.protocol === 'https:' &&
        origin.origin === env.PUBLIC_APP_ORIGIN &&
        !origin.username &&
        !origin.password,
      'INVALID_PUBLIC_ORIGIN',
    );
  }
  return { network: 'esmeralda', networkByte: 38, indexers: urls, liveEnabled: false };
}
