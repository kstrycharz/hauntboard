// Local, disposable WebAuthn/API-key experiment. No accounts, funds or transaction methods.
// Tokens and the virtual passkey remain in memory; no screenshots, traces or raw errors.
import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const allowed = new Set([
  'wallet.get_info',
  'accounts.list',
  'settings.get',
  'auth.request',
  'webauthn.reg_start',
  'webauthn.reg_finish',
  'auth.create_api_key',
  'auth.list_api_keys',
  'auth.revoke_api_key',
]);
const checks = {};
const rejectionCodes = {};
const secrets = [];
const evidencePath = 'docs/evidence/m2/wallet-auth.json';
// Replace a prior pass before running, so interrupted/failed reruns cannot leave stale success.
await writeFile(
  evidencePath,
  JSON.stringify(
    { inspectedAt: new Date().toISOString(), status: 'AUTH_PROBE_IN_PROGRESS' },
    null,
    2,
  ) + '\n',
);
const browser = await chromium.launch();
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route('http://localhost:5100/**', async (route) => {
    if (route.request().url().endsWith('/json_rpc')) {
      const body = route.request().postDataJSON();
      assert(allowed.has(body.method), 'RPC method outside probe allowlist');
      const response = await route.fetch({ url: 'http://auth-wallet:5100/json_rpc' });
      await route.fulfill({ response });
    } else {
      await route.fulfill({
        contentType: 'text/html',
        body: '<title>Disposable auth probe</title>',
      });
    }
  });
  await page.goto('http://localhost:5100');
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  async function rpc(method, params = {}, token) {
    assert(allowed.has(method));
    return page.evaluate(
      async ({ method, params, token }) => {
        const response = await fetch('/json_rpc', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
          signal: AbortSignal.timeout(15000),
        });
        return response.json();
      },
      { method, params, token },
    );
  }
  function denied(
    response,
    label,
    reason = /auth|permission|credential|forbidden|invalid or revoked|interactive|user.only|user session/i,
  ) {
    const error = response.error;
    assert(
      error && (error.code === 401 || error.code === 403 || reason.test(error.message)),
      'expected authentication rejection',
    );
    rejectionCodes[label] = error.code;
    return true;
  }
  const info = (await rpc('wallet.get_info')).result;
  assert.equal(info.network, 'esmeralda');
  assert.equal(info.network_byte, 38);
  checks.unauthenticatedReadRejected = denied(
    await rpc('accounts.list', { offset: 0, limit: 10 }),
    'unauthenticatedRead',
  );
  checks.anonymousSessionRejected = denied(
    await rpc('auth.request', {
      permissions: [{ Accounts: ['Read', null] }],
      credentials: 'None',
    }),
    'anonymousSession',
  );
  const start = (await rpc('webauthn.reg_start', { username: 'disposable-auth-probe' })).result;
  assert(start, 'registration start failed');
  const credential = await page.evaluate(async (options) => {
    const decode = (s) =>
      Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
    options.challenge = decode(options.challenge);
    options.user.id = decode(options.user.id);
    options.excludeCredentials = (options.excludeCredentials || []).map((c) => ({
      ...c,
      id: decode(c.id),
    }));
    const created = await navigator.credentials.create({ publicKey: options });
    return created.toJSON();
  }, start.public_key);
  const registered = await rpc('webauthn.reg_finish', { session_id: start.session_id, credential });
  const admin = registered.result?.token;
  assert(admin, 'registration finish failed');
  secrets.push(admin);
  checks.virtualPasskeyEnrollment = true;
  checks.secondEnrollmentRejected = denied(
    await rpc('webauthn.reg_start', { username: 'different-user' }),
    'secondEnrollment',
    /already.*enrolled/i,
  );
  async function mint(name, expiresAt) {
    const response = await rpc(
      'auth.create_api_key',
      {
        name,
        permissions: ['accounts:read'],
        confirm_admin: false,
        expires_at: expiresAt,
      },
      admin,
    );
    assert(response.result?.api_key, 'scoped key creation failed');
    secrets.push(response.result.api_key);
    return response.result;
  }
  const key = await mint('disposable-read-probe', Math.floor(Date.now() / 1000) + 300);
  checks.scopedReadWorks = !!(await rpc('accounts.list', { offset: 0, limit: 10 }, key.api_key))
    .result;
  checks.ungrantedSettingsReadRejected = denied(
    await rpc('settings.get', {}, key.api_key),
    'ungrantedRead',
  );
  checks.apiKeyManagementRejected = denied(
    await rpc('auth.list_api_keys', {}, key.api_key),
    'keyManagement',
  );
  assert((await rpc('auth.revoke_api_key', { id: key.id }, admin)).result);
  checks.revokedKeyRejected = denied(
    await rpc('accounts.list', { offset: 0, limit: 10 }, key.api_key),
    'revokedKey',
  );
  const expiry = Math.floor(Date.now() / 1000) + 3;
  const shortKey = await mint('disposable-expiry-probe', expiry);
  checks.expiringKeyWorksBeforeDeadline = !!(
    await rpc('accounts.list', { offset: 0, limit: 10 }, shortKey.api_key)
  ).result;
  await new Promise((resolve) =>
    setTimeout(resolve, Math.max(0, expiry * 1000 - Date.now() + 1100)),
  );
  checks.expiredKeyRejected = denied(
    await rpc('accounts.list', { offset: 0, limit: 10 }, shortKey.api_key),
    'expiredKey',
  );
  assert(Object.values(checks).every(Boolean), 'authentication boundary check failed');
  const record =
    JSON.stringify(
      {
        inspectedAt: new Date().toISOString(),
        status: 'PASSED_UNFUNDED_DISPOSABLE_AUTH_PROBE',
        wallet: info,
        checks,
        rejectionCodes,
        limitations:
          'Chromium virtual passkey; tmpfs wallet; no human passkey, persistent restart, account creation, funded transfer or production key lifecycle demonstrated.',
      },
      null,
      2,
    ) + '\n';
  assert(
    secrets.every((secret) => !record.includes(secret)),
    'secret in public record',
  );
  await writeFile(evidencePath, record);
  console.log(record);
} catch {
  const failure = {
    inspectedAt: new Date().toISOString(),
    status: 'FAILED_AUTH_PROBE',
    completedChecks: checks,
  };
  await writeFile(evidencePath, JSON.stringify(failure, null, 2) + '\n');
  console.error(JSON.stringify(failure));
  process.exitCode = 1;
} finally {
  await browser.close();
}
