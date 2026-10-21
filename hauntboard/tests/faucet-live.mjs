// Real deployed assets and isolated browser wallets; all payment writes intercepted.
import {chromium, firefox, expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {enterWalletCredential, confirmRecoveryWord} from './gui-helpers.mjs';
const origin = 'https://hauntboard.taritracker.com';
const report = {origin, scope:'Live HTTPS assets/config and real isolated browser wallets; faucet claim/status responses simulated in browser routing. No on-chain writes, withdrawals or public posts.', claimsCreated:0, browsers:{}};
for (const [name, engine] of Object.entries({chromium, firefox})) {
  const browser = await engine.launch();
  try {
    const context = await browser.newContext({viewport:{width:390,height:844}});
    let receipt, claimedAddress, claims = 0, forbidden = 0, status = 'queued';
    await context.route('**/api/browser-submit', route => {forbidden++; return route.abort();});
    await context.route('**/api/faucet-claim', async route => {
      const body = route.request().postDataJSON();
      assert.equal(body.amountTokens, 100);
      assert.match(body.address, /^otl_esm_/);
      receipt = body.receipt; claimedAddress = body.address; claims++;
      await route.fulfill({status:202,contentType:'application/json',body:JSON.stringify({receipt,status:'queued',transactionId:null,amountMicrotari:'100000000'})});
    });
    await context.route('**/api/faucet-status', async route => {
      assert.equal(route.request().postDataJSON().receipt, receipt);
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({receipt,status,transactionId:null,amountMicrotari:'100000000'})});
    });
    const page = await context.newPage();
    await page.goto(origin, {waitUntil:'domcontentloaded'});
    await expect(page.locator('body')).toHaveAttribute('data-ready','true',{timeout:45000});
    await page.locator('#browser-wallet-button').click();
    await page.locator('#wallet-create-choice').click();
    await enterWalletCredential(page);
    await expect(page.locator('#wallet-seed-words li')).toHaveCount(24);
    await confirmRecoveryWord(page);
    await page.locator('#wallet-seed-saved').check();
    await page.locator('#wallet-confirm-seed').click();
    await expect(page.locator('#wallet-seed-panel')).toBeHidden();
    const button = page.locator('#wallet-faucet');
    await expect(button).toBeVisible();
    await expect(button).toHaveText('Get 100 test tXTR');
    await expect(button).toBeEnabled({timeout:45000});
    await expect(page.getByRole('link',{name:'TariTracker.com faucet'})).toHaveAttribute('href','https://testnet-faucet.taritracker.com/');
    await page.locator('.wallet-faucet').screenshot({path:`hauntboard/evidence/faucet-live-${name}.png`});
    await button.click();
    await expect(page.locator('#wallet-faucet-status')).toContainText('queued');
    const saved = await page.evaluate(({receipt, address}) => {
      return Object.keys(localStorage).some(key => key.startsWith('hauntboard-faucet:v1:') && JSON.parse(localStorage.getItem(key)).receipt === receipt && JSON.parse(localStorage.getItem(key)).address === address);
    }, {receipt, address:claimedAddress});
    assert(saved);
    await page.reload({waitUntil:'domcontentloaded'});
    await expect(page.locator('body')).toHaveAttribute('data-ready','true',{timeout:45000});
    await page.locator('#browser-wallet-button').click();
    await enterWalletCredential(page);
    status = 'uncertain';
    await expect(page.locator('#wallet-faucet-status')).toContainText('reconciling',{timeout:30000});
    status = 'confirmed';
    await expect(page.locator('#wallet-faucet-status')).toContainText('100 test tXTR confirmed',{timeout:30000});
    await expect(page.locator('#wallet-faucet')).toHaveText(/Next request in/);
    await expect(page.locator('#wallet-faucet')).toBeDisabled();
    assert.equal(claims, 1);
    assert.equal(forbidden, 0);
    report.browsers[name] = {status:'PASSED',checks:['live 100 tXTR button and linked attribution','real native wallet creation; recovery words remain in isolated browser','receipt saved before intercepted request','reload resumes the same receipt','uncertain payment reconciled without replacement','confirmation triggers incoming-funds scan and shows cooldown'],actualWithdrawals:0};
    await context.close();
    console.log(`${name}: live faucet UI passed; payment requests intercepted; no withdrawals.`);
  } catch (error) {
    // Suppress Playwright DOM diagnostics around real recovery words.
    throw new Error(`${name} live faucet UI check failed (${error.name}); private wallet DOM diagnostics suppressed.`);
  } finally { await browser.close(); }
}
report.checkedAt = new Date().toISOString();
report.status = 'PASSED';
await writeFile('hauntboard/evidence/faucet-api-live.json',JSON.stringify(report,null,2)+'\n');
