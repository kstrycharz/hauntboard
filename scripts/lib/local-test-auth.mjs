// Test-only virtual passkeys, persisted in a private Docker volume. Never for public/mainnet wallets.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

export async function openLocalWallet(browser, role, privateRoot) {
  assert(['sender', 'receiver'].includes(role));
  process.umask(0o077);
  await mkdir(privateRoot, { recursive: true, mode: 0o700 });
  const context = await browser.newContext();
  const page = await context.newPage();
  const authMethods = new Set([
    'wallet.get_info',
    'webauthn.reg_start',
    'webauthn.reg_finish',
    'webauthn.auth_start',
    'auth.request',
    'auth.create_api_key',
    'auth.revoke_api_key',
    'accounts.list',
    'accounts.create',
  ]);
  await page.route('http://localhost:5100/**', async (route) => {
    if (route.request().url().endsWith('/json_rpc')) {
      assert(authMethods.has(route.request().postDataJSON().method));
      await route.fulfill({ response: await route.fetch({ url: `http://${role}:5100/json_rpc` }) });
    } else
      await route.fulfill({
        contentType: 'text/html',
        body: '<title>Isolated local wallet test</title>',
      });
  });
  await page.goto('http://localhost:5100');
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
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
    assert(authMethods.has(method));
    const body = await page.evaluate(
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
    if (body.error || !body.result) throw new Error('LOCAL_AUTH_RPC_REJECTED');
    return body.result;
  }
  const info = await rpc('wallet.get_info');
  assert.equal(info.network, 'localnet');
  assert.equal(info.network_byte, 16);
  assert.equal(info.version, '0.43.0');
  const username = `hauntbox-local-ci-${role}`;
  const credentialPath = `${privateRoot}/${role}-passkey.json`;
  let stored;
  try {
    stored = JSON.parse(await readFile(credentialPath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  let admin;
  if (!stored) {
    const start = await rpc('webauthn.reg_start', { username });
    const credential = await page.evaluate(async (options) => {
      const decode = (s) =>
        Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
      options.challenge = decode(options.challenge);
      options.user.id = decode(options.user.id);
      options.excludeCredentials = (options.excludeCredentials || []).map((c) => ({
        ...c,
        id: decode(c.id),
      }));
      return (await navigator.credentials.create({ publicKey: options })).toJSON();
    }, start.public_key);
    const { credentials } = await cdp.send('WebAuthn.getCredentials', { authenticatorId });
    assert.equal(credentials.length, 1);
    await writeFile(credentialPath, JSON.stringify(credentials[0]), { mode: 0o600, flag: 'wx' });
    admin = (await rpc('webauthn.reg_finish', { session_id: start.session_id, credential })).token;
  } else {
    await cdp.send('WebAuthn.addCredential', { authenticatorId, credential: stored });
    const start = await rpc('webauthn.auth_start', { username });
    const credential = await page.evaluate(async (options) => {
      const decode = (s) =>
        Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
      options.challenge = decode(options.challenge);
      options.allowCredentials = (options.allowCredentials || []).map((c) => ({
        ...c,
        id: decode(c.id),
      }));
      return (await navigator.credentials.get({ publicKey: options })).toJSON();
    }, start.challenge.publicKey ?? start.challenge.public_key);
    admin = (
      await rpc('auth.request', {
        permissions: ['Admin'],
        credentials: { WebAuthN: { session_id: start.session_id, credential } },
      })
    ).token;
    const { credentials } = await cdp.send('WebAuthn.getCredentials', { authenticatorId });
    await writeFile(credentialPath, JSON.stringify(credentials[0]), { mode: 0o600 });
  }
  assert(admin);
  const key = await rpc(
    'auth.create_api_key',
    {
      name: 'isolated-local-funding',
      permissions: ['admin'],
      confirm_admin: true,
      expires_at: Math.floor(Date.now() / 1000) + 600,
    },
    admin,
  );
  const tokenFile = `${privateRoot}/${role}-token`;
  await writeFile(tokenFile, key.api_key, { mode: 0o600 });
  const accounts = await rpc('accounts.list', { offset: 0, limit: 100 }, key.api_key);
  const name = `hauntbox-ci-${role}`;
  let accountInfo = accounts.accounts.find((a) => a.account.name === name);
  if (!accountInfo)
    accountInfo = await rpc(
      'accounts.create',
      { account_name: name, is_default: true, key_index: null },
      key.api_key,
    );
  const { account, address } = accountInfo;
  assert(account.owner_key_id && /^component_[a-f0-9]{64}$/.test(account.component_address));
  return {
    account,
    address,
    tokenFile,
    async close() {
      await rpc('auth.revoke_api_key', { id: key.id }, admin);
      await context.close();
    },
  };
}
