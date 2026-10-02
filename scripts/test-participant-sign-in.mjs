// Isolated browser CI only. Real app auth; no wallet signing, traces or public credentials.
import { chromium, firefox } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { randomInt } from 'node:crypto';
import assert from 'node:assert/strict';
import { writePrivateJson } from './lib/private-json.mjs';
import { localNetworkWitness } from './lib/local-network-witness.mjs';
const witness = await localNetworkWitness();
let journal;
try {
  journal = JSON.parse(await readFile('/private/participant-ui.json', 'utf8'));
  assert.equal(journal.instance, witness.instance);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  journal = { instance: witness.instance };
}
const checks = {};
let phase = 'start',
  activeBrowser;
async function visit(page) {
  await page.route('http://localhost:5173/**', async (route) => {
    const response = await route.fetch({
      url: route.request().url().replace('http://localhost:5173', 'http://web:5173'),
    });
    await route.fulfill({ response });
  });
  await page.goto('http://localhost:5173/account');
  await page.getByRole('heading', { name: 'Your account and the host', exact: true }).waitFor();
}
try {
  for (const [name, engine] of [
    ['chromium', chromium],
    ['firefox', firefox],
  ]) {
    phase = `${name}_pin`;
    activeBrowser = await engine.launch();
    const context = await activeBrowser.newContext(),
      page = await context.newPage();
    await visit(page);
    let saved = journal[name];
    if (!saved) {
      const pin = String(randomInt(10000000, 100000000));
      await page.getByRole('button', { name: 'Create an account', exact: true }).click();
      await page.getByLabel('PIN, 8–12 digits', { exact: true }).fill(pin);
      await page.getByLabel('Confirm PIN', { exact: true }).fill(pin);
      await page.getByRole('button', { name: 'Create participant account', exact: true }).click();
      await page.getByRole('heading', { name: 'Your participant account', exact: true }).waitFor();
      saved = {
        pin,
        loginCode: await page
          .getByLabel('Save your account sign-in code', { exact: true })
          .inputValue(),
      };
      journal[name] = saved;
      await writePrivateJson('/private/participant-ui.json', journal);
      await page
        .getByRole('button', { name: 'Sign out of participant account', exact: true })
        .click();
    }
    await page.getByLabel('Account sign-in code', { exact: true }).fill(saved.loginCode);
    await page.getByLabel('PIN, 8–12 digits', { exact: true }).fill(saved.pin);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByRole('heading', { name: 'Your participant account', exact: true }).waitFor();
    await page.reload();
    await page.getByRole('heading', { name: 'Your participant account', exact: true }).waitFor();
    assert.equal(
      await page.locator('a[href*="5101"],a[href*="5102"],a[href*="5103"],iframe').count(),
      0,
    );
    const denied = await page.evaluate(async () => {
      const response = await fetch('/api/auth/session');
      return response.status;
    });
    assert.equal(denied, 401);
    await page
      .getByRole('button', { name: 'Sign out of participant account', exact: true })
      .click();
    await page.getByRole('heading', { name: 'Sign in to Hauntbox', exact: true }).waitFor();
    checks[`${name}PinCreateLoginReloadLogout`] = true;
    checks.participantCannotAccessHost = true;
    checks.noNativeWalletPageOrIframe = true;
    await activeBrowser.close();
    activeBrowser = null;
  }
  phase = 'chromium_passkey';
  activeBrowser = await chromium.launch();
  const context = await activeBrowser.newContext(),
    page = await context.newPage(),
    cdp = await context.newCDPSession(page);
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
  let credential;
  try {
    credential = JSON.parse(await readFile('/private/participant-passkey.json', 'utf8'));
    await cdp.send('WebAuthn.addCredential', { authenticatorId, credential });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await visit(page);
  await page.getByRole('button', { name: 'Use passkey', exact: true }).click();
  if (!credential) {
    await page.getByRole('button', { name: 'Create an account', exact: true }).click();
    await page.getByRole('button', { name: 'Create participant account', exact: true }).click();
    await page.getByRole('heading', { name: 'Your participant account', exact: true }).waitFor();
    await page
      .getByRole('button', { name: 'Sign out of participant account', exact: true })
      .click();
  }
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('heading', { name: 'Your participant account', exact: true }).waitFor();
  const result = await cdp.send('WebAuthn.getCredentials', { authenticatorId });
  await writePrivateJson('/private/participant-passkey.json', result.credentials[0]);
  checks.realParticipantPasskeyRegisterAndLogin = true;
  const evidence = {
    checkedAt: new Date().toISOString(),
    network: 'localnet',
    status: 'PASSED_FRONTEND_SIGN_IN',
    checks,
  };
  await writeFile(
    'docs/evidence/m2/frontend-sign-in.json',
    JSON.stringify(evidence, null, 2) + '\n',
  );
  console.log(JSON.stringify(evidence));
} catch {
  console.log(JSON.stringify({ status: 'FRONTEND_SIGN_IN_FAILED', phase }));
  process.exitCode = 1;
} finally {
  await activeBrowser?.close();
}
