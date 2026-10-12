import { chromium, firefox, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const origin = process.env.NEWGUI_ORIGIN;
assert(origin?.startsWith('https://'));
const report = { origin, checkedAt: new Date().toISOString(), assets: {}, browsers: {} };
for (const name of ['index.html', 'app.mjs', 'api-client.mjs', 'pin-entry.mjs', 'browser-wallet.mjs', 'style.css', 'mobile.css', 'about.html', 'about.css', 'about.mjs', 'forums.html']) {
  const path = name === "about.html" ? "about" : name === "forums.html" ? "forums" : name;
  const response = await fetch(`${origin}/${path}`);
  assert.equal(response.status, 200);
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  const actual = hash(new Uint8Array(await response.arrayBuffer()));
  assert.equal(actual, hash(await readFile(`hauntboard/web/${name}`)), `Live asset mismatch: ${name}`);
  report.assets[name] = actual;
}
const ready = await fetch(`${origin}/health/ready`);
assert.equal(ready.status, 200);
for (const [engine, type] of Object.entries({chromium, firefox})) {
  const browser = await type.launch();
  try {
    const context = await browser.newContext({ viewport: {width:390,height:844} });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.name));
    let writes = 0;
    await page.route('**/api/**', async route => {
      if (route.request().method() !== 'GET') { writes++; await route.abort(); }
      else await route.continue();
    });
    await page.goto(origin);
    await expect(page.locator('body')).toHaveAttribute('data-ready', 'true', {timeout:60000});
    await page.locator('#browser-wallet-button').click();
    await page.locator('#wallet-create-choice').click();
    await expect(page.locator('#wallet-password')).toBeFocused();
    await page.keyboard.type('004281');
    await expect(page.locator('#wallet-password-label')).toHaveText('Confirm your PIN');
    await expect(page.locator('#wallet-password')).toHaveValue('');
    await page.keyboard.press('Escape');
    await expect(page.locator('#wallet-password')).toHaveValue('');
    for (const width of [320,390,1280]) {
      await page.setViewportSize({width,height:844});
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    }
    assert.deepEqual(errors, []);
    assert.equal(writes, 0);
    report.browsers[engine] = {status:'PASSED', focusedPinEntry:true, automaticConfirmation:true, cancellationClearsPin:true, responsive:true, chainWrites:0};
  } finally {await browser.close();}
}
report.status = 'LIVE_NEWGUI_VERIFIED';
await writeFile('hauntboard/evidence/newgui-live.json', JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
