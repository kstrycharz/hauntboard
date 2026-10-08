// Read-only test: seed is accepted only on stdin. No transactions are submitted.
import {chromium,firefox,expect} from '@playwright/test';
import assert from 'node:assert/strict';
let phrase='';for await(const chunk of process.stdin)phrase+=chunk;
phrase=phrase.trim();
const browser=await ({chromium,firefox}[process.env.BROWSER??'chromium']).launch();
try {
  const page=await browser.newPage();
  let submissions=0;const blocked=[];
  await page.route('**/api/browser-submit',route=>{submissions++;blocked.push(JSON.parse(route.request().postData()));return route.abort();});
  await page.route('**/api/faucet-submit',route=>{submissions++;return route.abort();});
  await page.goto(process.env.PREPARATION_ORIGIN);
  await page.waitForFunction(()=>document.body.dataset.ready==='true');
  await page.locator('#browser-wallet-button').click();
  await page.locator('#wallet-recover-choice').click();
  await page.locator('#wallet-recovery-input').fill(phrase);
  phrase='';
  await page.locator('#wallet-password').fill('864209');
  await page.locator('#wallet-pin-confirm').fill('864209');
  await page.locator('#wallet-restore').click();
  await expect(page.locator('#wallet-ready-panel')).toBeVisible({timeout:90000});
  await expect(page.locator('#wallet-prepare')).toBeVisible();
  await page.locator('#wallet-prepare').click();
  await expect(page.locator('#wallet-prepare-confirm')).toBeVisible({timeout:90000});
  await expect(page.locator('#wallet-prepare-review')).toContainText('Maximum transaction fee');
  const review=await page.locator('#wallet-prepare-review').textContent();
  assert.equal(submissions,0);
  await page.locator('#wallet-prepare-confirm').click();
  await expect(page.locator('#wallet-message')).toHaveClass(/error/,{timeout:30000});
  const checks=await page.evaluate(async()=>{
    const w=await import('/browser-wallet.mjs');let deletionBlocked=false;
    try{await w.deleteWallet({acknowledged:true});}catch{deletionBlocked=true;}
    return {pendingPreserved:w.postingPreparationStatus().pending,deletionBlocked};
  });
  assert(checks.pendingPreserved);assert(checks.deletionBlocked);
  await page.locator('#wallet-prepare').click();
  await expect.poll(()=>blocked.length,{timeout:30000}).toBe(2);
  assert.deepEqual(blocked[0],blocked[1]);
  console.log(JSON.stringify({status:'POSTING_PREPARATION_REAL_TESTNET_DRY_RUN_PASSED',engine:process.env.BROWSER??'chromium',review,...checks,exactRetry:true,blockedSubmissions:submissions,chainWrites:0}));
} catch {
  // Avoid logging the input field/phrase through Playwright assertion diagnostics.
  const message=await browser.contexts()[0]?.pages()[0]?.locator('#wallet-message').textContent().catch(()=>null);
  console.error(JSON.stringify({status:'PREPARATION_CHECK_FAILED',message}));
  process.exitCode=1;
} finally {phrase='';await browser.close();}
