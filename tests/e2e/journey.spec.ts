import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
const evidence = 'docs/evidence/m1';
async function screenshot(page: Page, name: string) {
  await page.screenshot({ path: `${evidence}/${name}.png`, fullPage: true });
}
async function seal(page: Page, address = true) {
  await page.goto('/#desk');
  await page.getByRole('button', { name: 'Use a sample story' }).click();
  if (address) await page.getByRole('button', { name: 'Use sample recipient' }).click();
  await page.getByRole('button', { name: 'Seal submission' }).click();
  await expect(page.getByRole('heading', { name: 'Your sample letter arrived.' })).toBeVisible();
}
async function open(page: Page) {
  await page.getByRole('link', { name: 'Curator view' }).click();
  await page.getByRole('button', { name: 'Unlock sample key' }).click();
  await page.getByRole('button', { name: 'Open envelope' }).click();
  await expect(
    page.getByText(
      'Every October, a letter arrives in my own handwriting. This year, it asked me to stop answering the door.',
      { exact: true },
    ),
  ).toBeVisible();
}
async function condition(page: Page, value: string) {
  await page.getByRole('link', { name: 'Recovery & status' }).click();
  await page.getByLabel('Demo condition').selectOption(value);
}
test('whole fixture journey, receipt export, privacy, reset, and walkthrough', async ({
  page,
  browserName,
  browser,
}) => {
  await mkdir(evidence, { recursive: true });
  const context = await browser.newContext({
    baseURL: process.env.BASE_URL || 'http://localhost:5173',
    viewport: { width: 1440, height: 1000 },
    recordVideo:
      browserName === 'chromium'
        ? { dir: `${evidence}/walkthrough`, size: { width: 1440, height: 1000 } }
        : undefined,
  });
  const tour = await context.newPage();
  await tour.goto('/');
  await expect(tour.getByText('Mock demo — no funds move', { exact: true })).toBeVisible();
  if (browserName === 'chromium') await screenshot(tour, '01-entrance-1440');
  await tour.getByRole('button', { name: 'Try the guided demo' }).click();
  if (browserName === 'chromium') await screenshot(tour, '02-submission-desk');
  await tour.getByRole('button', { name: 'Seal submission' }).click();
  await expect(tour.getByRole('heading', { name: 'Your sample letter arrived.' })).toBeVisible();
  if (browserName === 'chromium') await screenshot(tour, '03-sealed-receipt');
  const download = tour.waitForEvent('download');
  await tour.getByRole('button', { name: 'Download sample receipt' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('hauntbox-mock-receipt.json');
  if (browserName === 'chromium') await file.saveAs(`${evidence}/sample-receipt.json`);
  await expect(tour.getByLabel('Participant journey')).not.toContainText('reward');
  await expect(
    tour.getByText('Your participant journey ends here. Save', { exact: false }),
  ).toBeVisible();
  await tour.getByRole('button', { name: 'View the curator demo' }).click();
  await expect(tour.getByLabel('Curator demo journey')).toContainText('Curator demo');
  if (browserName === 'chromium') await screenshot(tour, '04-curator-locked');
  await tour.getByRole('button', { name: 'Unlock sample key' }).click();
  await tour.getByRole('button', { name: 'Open envelope' }).click();
  await expect(
    tour.getByText(
      'Every October, a letter arrives in my own handwriting. This year, it asked me to stop answering the door.',
      { exact: true },
    ),
  ).toBeVisible();
  if (browserName === 'chromium') await screenshot(tour, '05-curator-opened');
  await tour.getByRole('button', { name: 'Review private reward' }).click();
  if (browserName === 'chromium') await screenshot(tour, '06-reward-review');
  await expect(tour.getByRole('button', { name: 'Send private reward' })).toBeDisabled();
  await tour.getByRole('checkbox').check();
  await tour.getByRole('button', { name: 'Send private reward' }).click();
  await expect(tour.getByRole('heading', { name: 'Your sample reward is pending.' })).toBeVisible();
  await tour.getByRole('button', { name: 'Simulate confirmed outcome' }).click();
  await expect(tour.getByRole('heading', { name: 'A sample candle sent.' })).toBeVisible();
  if (browserName === 'chromium') await screenshot(tour, '07-reward-confirmed');
  await tour.getByRole('button', { name: 'Inspect who sees what' }).click();
  await expect(tour.getByRole('heading', { name: 'Public observer', exact: true })).toBeVisible();
  await expect(tour.locator('pre')).not.toContainText('lantern-keeper');
  await expect(tour.locator('pre')).not.toContainText('Every October');
  if (browserName === 'chromium') await screenshot(tour, '08-privacy-inspector');
  await tour.getByRole('link', { name: 'Recovery & status' }).click();
  if (browserName === 'chromium') await screenshot(tour, '09-recovery');
  await tour.getByRole('button', { name: 'Reset fixtures' }).click();
  await tour.getByRole('link', { name: 'Curator view' }).click();
  await expect(tour.getByRole('heading', { name: 'The inbox is quiet.' })).toBeVisible();
  const video = tour.video();
  await context.close();
  if (browserName === 'chromium' && video) {
    await video.saveAs(`${evidence}/walkthrough.webm`);
    await video.delete();
  }
});
test('bounds, optional recipient, no-account empty states, and safe text rendering', async ({
  page,
}) => {
  await page.goto('/#desk');
  await page.getByRole('button', { name: 'Seal submission' }).click();
  await expect(page.getByRole('alert')).toContainText('Write a story');
  await page.getByLabel('Your story').fill('👻'.repeat(501));
  await page.getByRole('button', { name: 'Seal submission' }).click();
  await expect(page.getByRole('alert')).toContainText('exceeds');
  await page.getByLabel('Your story').fill('<script>alert("ghost")</script>');
  await page.getByLabel('Sample payout address').fill('mock-igor:recipient');
  await page.getByRole('button', { name: 'Seal submission' }).click();
  await expect(page.getByRole('alert')).toContainText('Esmeralda');
  await page.getByLabel('Sample payout address').fill('');
  await page.getByRole('button', { name: 'Seal submission' }).click();
  await expect(page.getByRole('heading', { name: 'Your sample letter arrived.' })).toBeVisible();
  await page.getByRole('link', { name: 'Curator view' }).click();
  await page.getByRole('button', { name: 'Unlock sample key' }).click();
  await page.getByRole('button', { name: 'Open envelope' }).click();
  await expect(page.locator('blockquote')).toHaveText('<script>alert("ghost")</script>');
  await expect(page.getByRole('button', { name: 'Review private reward' })).toBeDisabled();
  await page.getByRole('button', { name: 'Lock sample key' }).click();
  await expect(page.locator('blockquote')).toHaveCount(0);
});
test('outages, delayed inclusion, key failure, wallet failure, and ambiguous reward', async ({
  page,
}) => {
  await page.goto('/');
  await condition(page, 'network-down');
  await page.getByRole('button', { name: 'Return to submission desk' }).click();
  await page.getByRole('button', { name: 'Use a sample story' }).click();
  await page.getByRole('button', { name: 'Use sample recipient' }).click();
  await page.getByRole('button', { name: 'Seal submission' }).click();
  await expect(page.getByRole('alert')).toContainText('Network unavailable');
  await condition(page, 'delayed');
  await page.getByRole('button', { name: 'Return to submission desk' }).click();
  await page.getByRole('button', { name: 'Seal submission' }).click();
  await expect(
    page.getByRole('heading', { name: 'Your sample receipt is delayed.' }),
  ).toBeVisible();
  await condition(page, 'healthy');
  await page.getByRole('button', { name: 'Check existing receipt' }).click();
  await page.getByRole('button', { name: 'Check receipt', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your sample letter arrived.' })).toBeVisible();
  await condition(page, 'lost-key');
  await page.getByRole('button', { name: 'Return to curator inbox' }).click();
  await page.getByRole('button', { name: 'Unlock sample key' }).click();
  await expect(page.getByRole('alert')).toContainText('missing');
  await condition(page, 'unreadable');
  await page.getByRole('button', { name: 'Return to curator inbox' }).click();
  await page.getByRole('button', { name: 'Unlock sample key' }).click();
  await page.getByRole('button', { name: 'Open envelope' }).click();
  await expect(page.getByRole('alert')).toContainText('could not be opened');
  await condition(page, 'healthy');
  await page.getByRole('button', { name: 'Return to curator inbox' }).click();
  await page.getByRole('button', { name: 'Open envelope' }).click();
  await expect(page.locator('blockquote')).toBeVisible();
  await condition(page, 'wallet-down');
  await page.getByRole('button', { name: 'Return to curator inbox' }).click();
  await page.getByRole('button', { name: 'Review private reward' }).click();
  await expect(page.getByRole('alert')).toContainText('wallet unavailable');
  await condition(page, 'unknown');
  await page.getByRole('button', { name: 'Return to curator inbox' }).click();
  await page.getByRole('button', { name: 'Review private reward' }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Send private reward' }).click();
  await expect(page.getByRole('heading', { name: 'The outcome is unknown.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send private reward' })).toHaveCount(0);
});
test('declined reward cannot be resubmitted', async ({ page }) => {
  await seal(page);
  await open(page);
  await page.getByRole('button', { name: 'Review private reward' }).click();
  await page.getByRole('button', { name: 'Decline reward' }).click();
  await expect(page.getByRole('heading', { name: 'You declined this reward.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send private reward' })).toHaveCount(0);
});
for (const width of [360, 768, 1440])
  test(`layout and AA accessibility at ${width}px`, async ({ page, browserName }) => {
    await page.setViewportSize({ width, height: 1000 });
    for (const route of ['entrance', 'desk', 'receipt', 'inbox', 'reward', 'privacy', 'recovery']) {
      await page.goto(`/#${route}`);
      await page.evaluate(() => document.fonts.ready);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      const result = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      expect(result.violations).toEqual([]);
      if (browserName === 'chromium' && ['entrance', 'desk', 'privacy'].includes(route))
        await screenshot(page, `${route}-${width}`);
    }
  });
for (const width of [360, 768, 1440])
  test(`populated receipt, opened letter, reward accessibility at ${width}px`, async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await seal(page);
    async function inspect(name: string) {
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      const result = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      expect(result.violations).toEqual([]);
      if (browserName === 'chromium') await screenshot(page, `${name}-${width}`);
    }
    await inspect('receipt');
    await open(page);
    await inspect('inbox');
    await page.getByRole('button', { name: 'Review private reward' }).click();
    await expect(page.getByRole('checkbox')).toBeVisible();
    await inspect('reward');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Send private reward' }).click();
    await expect(
      page.getByRole('heading', { name: 'Your sample reward is pending.' }),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'No reward has been selected.' })).toBeVisible();
  });
test('keyboard-only core journey and reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  expect(
    await page
      .locator('.floating-letter')
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe('none');
  async function keyboardActivate(name: string) {
    let direction = 'Tab';
    let previous = '';
    for (let step = 0; step < 80; step++) {
      await page.keyboard.press(direction);
      const text = await page.evaluate(() => document.activeElement?.textContent || '');
      // Headless Firefox has no toolbar to wrap through at the end of the page.
      // Reverse through the same native tab order if it stays on the last control.
      if (text === previous) direction = direction === 'Tab' ? 'Shift+Tab' : 'Tab';
      previous = text;
      if (text.replace(/\s+/g, ' ').trim() === name) {
        await page.keyboard.press('Enter');
        return;
      }
    }
    throw new Error(`Could not reach ${name} by keyboard`);
  }
  await keyboardActivate('Try the guided demo ↗');
  await keyboardActivate('Skip to content');
  await expect(page).toHaveURL(/#desk$/);
  await expect(page.locator('main')).toBeFocused();
  await keyboardActivate('Seal submission');
  await expect(page.getByRole('heading', { name: 'Your sample letter arrived.' })).toBeVisible();
  await keyboardActivate('View the curator demo');
  await expect(page.getByRole('button', { name: 'Unlock sample key' })).toBeVisible();
  await keyboardActivate('Unlock sample key');
  await expect(page.getByRole('button', { name: 'Open envelope' })).toBeVisible();
  await keyboardActivate('Open envelope');
  await expect(page.locator('blockquote')).toBeVisible();
  await keyboardActivate('Review private reward');
  await expect(page.getByRole('heading', { name: 'Send a candle for this story.' })).toBeVisible();
  await expect(page.getByRole('checkbox')).toBeEnabled();
  for (let step = 0; step < 40; step++) {
    await page.keyboard.press('Tab');
    if ((await page.evaluate(() => document.activeElement?.getAttribute('type'))) === 'checkbox') {
      await page.keyboard.press('Space');
      break;
    }
  }
  await expect(page.getByRole('checkbox')).toBeChecked();
  await keyboardActivate('Send private reward');
  await expect(page.getByRole('heading', { name: 'Your sample reward is pending.' })).toBeVisible();
  await keyboardActivate('Simulate confirmed outcome');
  await expect(page.getByRole('heading', { name: 'A sample candle sent.' })).toBeVisible();
});
