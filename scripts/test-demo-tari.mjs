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
    await page.route(`${origin}/**`, async (route) => {
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
    await page.goto(`${origin}/admin`);
    await page.getByRole('button', { name: 'Sign in with passkey', exact: true }).click();
    await expect(
      page.getByText(
        'Create the host account on this localhost admin page first, then sign in with the PIN or passkey you configured.',
        { exact: true },
      ),
    ).toBeVisible();
    checks[name] = {
      tariExplanation: true,
      simulatedDisclosure: true,
      mobileFits: true,
      hostSetupError: true,
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
