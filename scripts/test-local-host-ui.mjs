// Actual production UI, isolated API test schema. Never create the real installation's host.
import { chromium, firefox, expect } from '@playwright/test';
import { randomUUID, randomInt } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { database } from '../apps/api/db.mjs';
import { createApp } from '../apps/api/server.mjs';
import { token } from '../apps/api/security.mjs';
import { writePrivateJson } from './lib/private-json.mjs';
const password = (await readFile('/production/postgres-password', 'utf8')).trim();
const url = new URL(
  `postgres://hauntbox:${encodeURIComponent(password)}@hauntbox-production-database-1:5432/hauntbox`,
);
const admin = database(url.toString());
const schema = `test_host_ui_${randomUUID().replaceAll('-', '')}`;
let db, app, browser;
const origin = 'http://localhost:8180';
const checks = {},
  fixtures = {};
try {
  await admin.query(`CREATE SCHEMA ${schema}`);
  url.searchParams.set('options', `-c search_path=${schema}`);
  db = database(url.toString());
  await db.migrate();
  app = await createApp(
    db,
    {
      origin,
      rpId: 'localhost',
      network: 'esmeralda',
      localHostSetup: true,
      secureCookie: false,
      bootstrapCode: token(),
      intentKey: Buffer.alloc(32, 7),
      submissions: false,
      anchoring: false,
      payouts: false,
    },
    null,
  );
  await app.listen({ host: '127.0.0.1', port: 3100 });
  for (const [name, engine] of [
    ['chromium', chromium],
    ['firefox', firefox],
  ]) {
    browser = await engine.launch();
    const context = await browser.newContext(),
      page = await context.newPage();
    let roomReady = false;
    await page.route(`${origin}/**`, async (route) => {
      const auth = route.request().url().startsWith(`${origin}/api/auth/`);
      const response = await route.fetch({
        url: route
          .request()
          .url()
          .replace(
            origin,
            auth ? 'http://127.0.0.1:3100' : 'http://hauntbox-production-web-1:8080',
          ),
        headers: { ...route.request().headers(), host: 'localhost:8180' },
      });
      if (route.request().url() === `${origin}/api/status`) {
        await route.fulfill({
          response,
          json: { ...(await response.json()), anchoringEnabled: roomReady },
        });
        return;
      }
      if (route.request().url() === `${origin}/api/funding/status` && roomReady) {
        await route.fulfill({
          response,
          json: { ...(await response.json()), receiptFundingReady: true },
        });
        return;
      }
      await route.fulfill({ response });
    });
    await page.goto(`${origin}/admin`);
    await page.getByRole('heading', { name: 'Create host account', exact: true }).waitFor();
    assertAbsent: {
      if (await page.getByLabel('Private host setup code', { exact: true }).count())
        throw new Error('UNEXPECTED_SETUP_CODE');
      if (await page.getByLabel('Saved host login code', { exact: true }).count())
        throw new Error('UNEXPECTED_LOGIN_CODE');
    }
    const pin = String(randomInt(10000000, 100000000));
    await page.getByLabel('Host PIN, 8–12 digits', { exact: true }).fill(pin);
    await page.getByLabel('Confirm host PIN', { exact: true }).fill(pin);
    await page.getByRole('button', { name: 'Create host account', exact: true }).click();
    const loginCode = await page
      .getByLabel('Save your host login code', { exact: true })
      .inputValue();
    fixtures[name] = { pin, loginCode };
    await writePrivateJson('/private/local-host-ui.json', fixtures);
    await page.getByRole('button', { name: 'Download host login backup', exact: true }).waitFor();
    await page
      .getByRole('button', { name: 'I saved my host sign-in code — continue', exact: true })
      .click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.getByLabel('Saved host login code', { exact: true }).waitFor();
    if (
      (await page.getByLabel('Saved host login code', { exact: true }).inputValue()) !== loginCode
    )
      throw new Error('LOGIN_CODE_NOT_REMEMBERED');
    await page.getByLabel('Host PIN, 8–12 digits', { exact: true }).fill(pin);
    await page.getByRole('button', { name: 'Sign in as host with PIN', exact: true }).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).waitFor();
    checks[name] = {
      firstSetupWithoutTerminalOrCode: true,
      generatedLoginBackup: true,
      loginCodeRemembered: true,
      signOutAndSignIn: true,
    };
    await expect(
      page.getByRole('heading', {
        name: 'Host sign-in is complete. Tari room activation is pending.',
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Generate browser encryption key', exact: true }),
    ).toBeDisabled();
    checks[name].pausedRoomPreparationBlocked = true;
    // Only the readiness display is simulated. Real WebCrypto/download/restore/storage run;
    // no room-create request or chain operation is sent.
    roomReady = true;
    await page.reload();
    const generate = page.getByRole('button', {
      name: 'Generate browser encryption key',
      exact: true,
    });
    await expect(generate).toBeEnabled();
    await generate.click();
    await page
      .getByRole('button', { name: 'Download encrypted recovery file', exact: true })
      .waitFor();
    const recoveryCode = await page
      .getByLabel('Room backup recovery code (save separately)', { exact: true })
      .inputValue();
    const downloadPromise = page.waitForEvent('download');
    await page
      .getByRole('button', { name: 'Download encrypted recovery file', exact: true })
      .click();
    const download = await downloadPromise;
    const backupPath = `/private/room-recovery-${name}.json`;
    await download.saveAs(backupPath);
    const backup = await readFile(backupPath);
    await page.getByLabel('Encrypted recovery file', { exact: true }).setInputFiles({
      name: 'hauntbox-room-recovery.json',
      mimeType: 'application/json',
      buffer: backup,
    });
    const recoveryInput = page.getByLabel('Recovery code for selected file', { exact: true });
    await recoveryInput.fill(token());
    await page.getByRole('button', { name: 'Verify and restore key', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(
      'The recovery code does not unlock this room-key backup.',
    );
    await expect(
      page.getByRole('button', { name: 'Create room on chain', exact: true }),
    ).toBeDisabled();
    await recoveryInput.fill(`  ${recoveryCode}  `);
    await page.getByRole('button', { name: 'Verify and restore key', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Recovery file and code verified.');
    await expect(
      page.getByRole('button', { name: 'Create room on chain', exact: true }),
    ).toBeEnabled();
    checks[name].downloadedRoomBackupRestored = true;
    checks[name].wrongRecoveryCodeRejectedClearly = true;
    checks[name].pastedRecoveryWhitespaceAccepted = true;
    await browser.close();
    browser = null;
    await db.query('TRUNCATE curator CASCADE');
    await db.query('DELETE FROM rate_limits');
  }
  const evidence = {
    checkedAt: new Date().toISOString(),
    status: 'PASSED_LOCAL_HOST_WEB_SETUP',
    checks,
    scope:
      'Production-built UI with isolated test authentication schema; actual installation host unchanged; no chain operations.',
  };
  await writeFile(
    'docs/evidence/m2/local-host-web-setup.json',
    JSON.stringify(evidence, null, 2) + '\n',
  );
  console.log(JSON.stringify(evidence));
} finally {
  await browser?.close();
  await app?.close();
  await db?.close();
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.close();
}
