import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateBetaConfig } from '../../scripts/lib/beta-config.mjs';
const base = {
  APP_ENV: 'production',
  NETWORK: 'esmeralda',
  FUNDING_PROVIDER: 'public-faucet',
  FAUCET_ENABLED: 'true',
  FUNDING_AUTOMATION_ENABLED: 'false',
  SUBMISSIONS_ENABLED: 'false',
  ANCHORING_ENABLED: 'false',
  PAYOUTS_ENABLED: 'false',
  BETA_INDEXER_URL: 'https://ootle-indexer-a.tari.com/',
  BETA_SECONDARY_INDEXER_URL: 'https://ootle-indexer-b.tari.com/',
};
test('production beta uses both Tari Esmeralda endpoints with live gates closed', () => {
  assert.equal(validateBetaConfig(base).networkByte, 38);
  assert.equal(validateBetaConfig(base).liveEnabled, false);
});
test('beta rejects mainnet, alternative funding and prematurely enabled mutations', () => {
  for (const change of [
    { NETWORK: 'mainnet' },
    { FUNDING_PROVIDER: 'treasury' },
    { FAUCET_ENABLED: 'false' },
    ...[
      'FUNDING_AUTOMATION_ENABLED',
      'SUBMISSIONS_ENABLED',
      'ANCHORING_ENABLED',
      'PAYOUTS_ENABLED',
    ].map((key) => ({ [key]: 'true' })),
  ])
    assert.throws(() => validateBetaConfig({ ...base, ...change }));
});
test('beta rejects credential-bearing, redirect-path, untrusted and duplicate indexers', () => {
  for (const url of [
    'http://ootle-indexer-a.tari.com/',
    'https://user:secret@ootle-indexer-a.tari.com/',
    'https://ootle-indexer-a.tari.com/redirect',
    'https://ootle-indexer-a.tari.com/?token=secret',
    'https://example.com/',
    base.BETA_SECONDARY_INDEXER_URL,
  ])
    assert.throws(() => validateBetaConfig({ ...base, BETA_INDEXER_URL: url }));
});
test('public application origin is optional during preparation and must be a clean HTTPS origin', () => {
  assert.doesNotThrow(() =>
    validateBetaConfig({ ...base, PUBLIC_APP_ORIGIN: 'https://hauntbox.example' }),
  );
  for (const origin of [
    'http://hauntbox.example',
    'https://hauntbox.example/path',
    'https://user:secret@hauntbox.example',
  ])
    assert.throws(() => validateBetaConfig({ ...base, PUBLIC_APP_ORIGIN: origin }));
});
