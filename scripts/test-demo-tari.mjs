import { chromium, firefox, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const origin = 'http://localhost:8180';
const checks = {};
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
]) {
  const browser = await engine.launch();
  try {
    const page = await browser.newPage();
    let aliasPosts = 0;
    let setupUnavailable = false;
    await page.route('http://127.0.0.1:8180/**', async (route) => {
      if (route.request().method() === 'POST') aliasPosts++;
      const response = await route.fetch({
        url: route
          .request()
          .url()
          .replace('http://127.0.0.1:8180', 'http://hauntbox-production-web-1:8080'),
        headers: { ...route.request().headers(), host: '127.0.0.1:8180' },
      });
      await route.fulfill({ response });
    });
    await page.route(`${origin}/**`, async (route) => {
      if (route.request().url() === `${origin}/api/auth/setup`) {
        await route.fulfill(
          setupUnavailable
            ? { status: 503, json: { code: 'SERVICE_UNAVAILABLE' } }
            : { json: { registered: false, method: null, localSetupAvailable: true } },
        );
        return;
      }
      if (route.request().url() === `${origin}/api/auth/login/options`) {
        await route.fulfill({ status: 409, json: { code: 'CURATOR_SETUP_REQUIRED' } });
        return;
      }
      const response = await route.fetch({
        url: route.request().url().replace(origin, 'http://hauntbox-production-web-1:8080'),
        headers: { ...route.request().headers(), host: 'localhost:8180' },
      });
      await route.fulfill({ response });
    });
    await page.goto(`${origin}/demo#privacy`);
    await expect(
      page.getByRole('heading', {
        name: 'An on-chain receipt. A private story. An optional reward.',
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: '1. Record the sealed envelope' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: '2. Keep the story off chain' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: '3. Let the host choose a reward' }),
    ).toBeVisible();
    await expect(
      page.getByText('Demo mode: receipts and rewards on this page are simulated;', {
        exact: false,
      }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) {
      throw new Error(`${name}: mobile privacy page overflows`);
    }
    await page.goto('http://127.0.0.1:8180/admin?source=alias#setup');
    await expect(page).toHaveURL(`${origin}/admin?source=alias#setup`);
    await expect(
      page.getByRole('heading', { name: 'Create host account', exact: true }),
    ).toBeVisible();
    if (aliasPosts !== 0)
      throw new Error('Admin sent credentials/setup request before canonical redirect');
    setupUnavailable = true;
    await page.reload();
    await expect(page.getByRole('button', { name: 'Retry host setup', exact: true })).toBeEnabled();
    await expect(page.getByRole('alert').filter({ hasText: 'SERVICE_UNAVAILABLE' })).toBeVisible();
    setupUnavailable = false;
    await page.getByRole('button', { name: 'Retry host setup', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Create host account', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Sign in with passkey', exact: true }).click();
    await expect(
      page.getByText(
        'Create the host account on this localhost admin page first, then sign in with the PIN or passkey you configured.',
        { exact: true },
      ),
    ).toBeVisible();
    await page.goto(`${origin}/`);
    await expect(page.getByRole('heading', { name: 'My wallet', exact: true })).toBeVisible();
    const create = page.getByRole('button', { name: 'Create wallet', exact: true });
    await expect(create).toBeEnabled();
    await create.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByLabel('Wallet PIN', { exact: true }).fill('12345678');
    await page.getByLabel('Wallet PIN', { exact: true }).press('Enter');
    await expect(page.getByLabel('Confirm wallet PIN', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close wallet dialog', exact: true }).click();
    await page.getByRole('button', { name: 'Import / recover wallet', exact: true }).click();
    await expect(page.getByLabel('Spending-key recovery phrase', { exact: true })).toBeVisible();
    await expect(page.getByLabel('View-key recovery phrase', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close wallet dialog', exact: true }).click();
    await expect(
      page.getByText('Faucet funding is not active in this deployment.', { exact: false }),
    ).toBeVisible();
    if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) {
      throw new Error(`${name}: mobile landing page overflows`);
    }
    if (name === 'chromium') {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.screenshot({ path: 'docs/evidence/m2/landing-wallet.png', fullPage: true });
    }
    checks[name] = {
      tariExplanation: true,
      simulatedDisclosure: true,
      mobileFits: true,
      hostSetupError: true,
      adminAliasRedirect: true,
      noAliasPostRequests: true,
      landingWalletCreateAndImport: true,
      landingWalletKeyboardPin: true,
      fundingPendingDisclosure: true,
      setupRetry: true,
    };
  } finally {
    await browser.close();
  }
}
await writeFile(
  'docs/evidence/m2/demo-tari.json',
  JSON.stringify({ fixture: true, checks }, null, 2) + '\n',
);
console.log(JSON.stringify(checks));
