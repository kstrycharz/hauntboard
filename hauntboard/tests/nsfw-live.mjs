// Read-only deployment verification. Never submit transactions or faucet claims.
import {chromium, firefox, expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const origin = 'https://hauntboard.taritracker.com';
const report = {checkedAt:new Date().toISOString(), origin, assets:{}, browsers:{}, chainWrites:0};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
for (const name of ['index.html','app.mjs','content-filter.mjs','style.css']) {
  const response = await fetch(`${origin}/${name}`, {headers:{'Cache-Control':'no-cache'}});
  assert.equal(response.status, 200);
  const actual = hash(new Uint8Array(await response.arrayBuffer()));
  assert.equal(actual, hash(await readFile(`hauntboard/web/${name}`)), `Asset mismatch: ${name}`);
  report.assets[name] = actual;
}
assert.equal((await fetch(`${origin}/health/ready`)).status, 200);
const config = await (await fetch(`${origin}/api/config`)).json();
report.board = config.board;
for (const [name, engine] of Object.entries({chromium, firefox})) {
  const browser = await engine.launch();
  try {
    const context = await browser.newContext({viewport:{width:390,height:844}});
    const page = await context.newPage();
    const errors = [];
    let blockedWrites = 0;
    page.on('pageerror', error => errors.push(error.name));
    await page.route('**/api/**', async route => {
      if (route.request().method() !== 'GET') { blockedWrites++; await route.abort(); }
      else await route.continue();
    });
    await page.goto(origin);
    await expect(page.locator('body')).toHaveAttribute('data-ready','true',{timeout:60000});
    await expect(page.locator('#thread-list')).toHaveAttribute('aria-busy','false',{timeout:60000});
    await expect(page.locator('#show-nsfw')).not.toBeChecked();
    const filteredCount = await page.locator('.thread-row').count();
    await page.locator('#show-nsfw').check();
    const revealedCount = await page.locator('.thread-row').count();
    assert(revealedCount >= filteredCount);
    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-ready','true',{timeout:60000});
    await expect(page.locator('#show-nsfw')).toBeChecked();
    await page.locator('#show-nsfw').uncheck();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth+1));
    assert.deepEqual(errors, []);
    assert.equal(blockedWrites, 0);
    report.browsers[name] = {status:'PASSED', filteredCount, revealedCount, preferenceSaved:true, mobileLayout:true, pageErrors:0, blockedWrites};
    await context.close();
  } finally { await browser.close(); }
}
report.status = 'PASSED';
await writeFile('hauntboard/evidence/nsfw-live-2026-11-09.json', JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
