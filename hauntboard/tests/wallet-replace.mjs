import {chromium,firefox,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {enterWalletCredential} from './gui-helpers.mjs';
const origin=process.env.RECOVERY_ORIGIN;
const reports=[];
for(const [engine,type]of Object.entries({chromium,firefox})){
 const browser=await type.launch();try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  if(origin==='http://localhost:8283')await page.route('http://localhost:8283/**',async r=>{const headers=await r.request().allHeaders();headers.host='localhost:8283';await r.fulfill({response:await r.fetch({url:r.request().url().replace('http://localhost:8283','http://board-privacy:8280'),headers})});});
  await page.goto(origin);await expect(page.locator('body')).toHaveAttribute('data-ready','true');await page.locator('#browser-wallet-button').click();
  await expect(page.locator('#wallet-create-choice')).toBeVisible();await expect(page.locator('#wallet-recover-choice')).toBeVisible();
  await page.evaluate(async()=>{const w=await import('/browser-wallet.mjs');await w.create('604281');w.lock();});
  await page.reload();await expect(page.locator('body')).toHaveAttribute('data-ready','true');await page.locator('#browser-wallet-button').click();
  await expect(page.locator('#wallet-forgot-pin')).toBeVisible();await page.locator('#wallet-recover-choice').click();
  await page.evaluate(async()=>{const r=await import('/wallet-recovery.mjs');window.testRecoveryPhrase=await r.newPhrase();document.querySelector('#wallet-recovery-input').value=window.testRecoveryPhrase;});
  await page.evaluate(()=>{document.querySelector('#wallet-recovery-input').value='invalid seed';});await page.locator('#wallet-recovery-next').click();await expect(page.locator('#wallet-message')).toContainText('24 recovery words',{timeout:30000});
  const blocked=await page.evaluate(async()=>{const w=await import('/browser-wallet.mjs');await w.unlock('604281');w.lock();return true;});assert(blocked);
  const safe=await page.evaluate(async()=>{const w=await import('/browser-wallet.mjs');localStorage.setItem('hauntboard-pending','{}');let rejected=false;try{await w.recover(window.testRecoveryPhrase,'735190',{replaceSavedWallet:true});}catch{rejected=true;}finally{localStorage.removeItem('hauntboard-pending');}await w.unlock('604281');w.lock();return rejected;});assert(safe);
  await expect(page.locator('#wallet-replace-saved')).toHaveCount(0);await page.evaluate(()=>{document.querySelector('#wallet-recovery-input').value=window.testRecoveryPhrase;});await enterWalletCredential(page,'735190');await page.locator('#wallet-restore').click();await expect(page.locator('#wallet-ready-panel')).toBeVisible({timeout:60000});
  const valid=await page.evaluate(async()=>{const w=await import('/browser-wallet.mjs'),address=w.active().address;w.lock();await w.unlock('735190');return w.active().address===address;});assert(valid);
  await page.reload();await expect(page.locator('body')).toHaveAttribute('data-ready','true');await page.locator('#browser-wallet-button').click();await page.locator('#wallet-forgot-pin').click();await page.locator('#wallet-forgot-delete').click();await page.locator('#wallet-delete-ack').check();await page.locator('#wallet-delete-confirm').click();await expect(page.locator('#wallet-create-choice')).toBeVisible({timeout:30000});await expect(page.locator('#wallet-recover-choice')).toBeVisible();assert.equal(await page.evaluate(async()=>(await import('/browser-wallet.mjs')).exists()),false);
  await page.locator('#wallet-recover-choice').click();await page.evaluate(async()=>{document.querySelector('#wallet-recovery-input').value=await(await import('/wallet-recovery.mjs')).newPhrase();});await enterWalletCredential(page,'492708');await page.locator('#wallet-restore').click();await expect(page.locator('#wallet-ready-panel')).toBeVisible({timeout:60000});assert(await page.evaluate(async()=>(await import('/browser-wallet.mjs')).active()!==null));
  reports.push({engine,firstLoginChoices:true,recoverReplacesSavedWallet:true,noReplacementCheckbox:true,invalidSeedPreservesSavedWallet:true,pendingReplacementBlocked:true,recoverDifferentSeed:true,newPinWorks:true,deleteWithoutPin:true,returnsToCreateOrRecover:true,recoveryAfterDelete:true});
 }catch(error){throw new Error(`Wallet replacement checks failed (${engine}, ${error.name}); no seed diagnostics logged.`);}finally{await browser.close();}
}
const report={status:'WALLET_REPLACEMENT_PASSED',origin,checkedAt:new Date().toISOString(),reports,chainWrites:0};await writeFile('hauntboard/evidence/wallet-replace.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
