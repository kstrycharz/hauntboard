import {enterWalletCredential} from './gui-helpers.mjs';
import {confirmRecoveryWord} from './gui-helpers.mjs';
import {chromium,firefox,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin=process.env.BALANCE_ORIGIN??'http://localhost:8283',password='604281';
for(const [engine,type]of Object.entries({chromium,firefox})){
 let stage='start';const browser=await type.launch(),report={origin,engine,checks:{},checkedAt:new Date().toISOString()};
 try{
  for(const viewport of [{width:390,height:844},{width:1280,height:900}]){
   const context=await browser.newContext({viewport}),page=await context.newPage();if(origin==='http://localhost:8283')await context.route('http://localhost:8283/**',async r=>{const headers=await r.request().allHeaders();headers.host='localhost:8283';await r.fulfill({response:await r.fetch({url:r.request().url().replace('http://localhost:8283','http://board-privacy:8280'),headers})});});await page.goto(origin);await expect(page.locator('body')).toHaveAttribute('data-ready','true',{timeout:30000});await expect(page.locator('#identity')).toHaveText('Browser wallet locked',{timeout:30000});
   await expect(page.locator('#wallet-balance-button')).toBeHidden();await page.locator('#browser-wallet-button').click();await page.locator('#wallet-create-choice').click();await enterWalletCredential(page, password);stage='create';await expect(page.locator('#wallet-balance-value')).toHaveText('0 test TARI',{timeout:60000});await expect(page.locator('#wallet-balance-button')).toBeVisible();await expect(page.locator('#wallet-seed-words li')).toHaveCount(24);stage='seed-confirm';await confirmRecoveryWord(page);await page.locator('#wallet-seed-saved').check();await page.locator('#wallet-confirm-seed').click();await expect(page.locator('#wallet-seed-panel')).toBeHidden();
   await page.locator('[data-close="browser-wallet-dialog"]').click();stage='compose';await page.locator('#new-thread').click();await expect(page.locator('#compose-wallet-balance')).toHaveText('Wallet balance: 0 test TARI · Available for posting: 0 test TARI');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert(await page.locator('#compose-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1));await page.screenshot({path:`hauntboard/evidence/wallet-balance-${engine}-${viewport.width}.png`});await page.locator('[data-close="compose-dialog"]').click();
   await page.locator('#wallet-balance-button').click();await expect(page.locator('#browser-wallet-dialog')).toBeVisible();stage='lock';await page.locator('#wallet-lock').click();await expect(page.locator('#wallet-balance-button')).toBeHidden();await expect(page.locator('#compose-wallet-balance')).toBeHidden();await enterWalletCredential(page, password);await expect(page.locator('#wallet-balance-value')).toHaveText('0 test TARI',{timeout:60000});
   await page.locator('[data-close="browser-wallet-dialog"]').click();stage='reload';await page.reload();await expect(page.locator('body')).toHaveAttribute('data-ready','true',{timeout:30000});await expect(page.locator("#identity")).toHaveText("Browser wallet locked",{timeout:30000});await expect(page.locator('#wallet-balance-button')).toBeHidden();await page.locator('#browser-wallet-button').click();await enterWalletCredential(page, password);await expect(page.locator('#wallet-balance-value')).toHaveText('0 test TARI',{timeout:60000});await page.locator('[data-close="browser-wallet-dialog"]').click();
   stage='provider-failure';await page.route('**/api/indexer',r=>r.abort());await page.locator('#wallet-balance-button').click();await expect(page.locator('#wallet-balance-value')).toHaveText('0 test TARI',{timeout:30000});await expect(page.locator('#wallet-readiness')).toContainText('last successful check');await page.unroute('**/api/indexer');await context.close();
  }
  report.status='WALLET_BALANCE_UI_PASSED';report.checks={headerAfterWalletCreation:true,formBalance:true,desktopAndMobileNoOverflow:true,opensWalletDetails:true,hiddenAfterLockAndReload:true,updatedAfterUnlock:true,networkFailureLabelsLastVerifiedBalance:true};await writeFile(`hauntboard/evidence/wallet-balance-${engine}.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
 }catch(error){throw new Error(`Wallet balance UI check failed at ${stage} (${error.name}); no private diagnostics logged.`);}finally{await browser.close();}
}



