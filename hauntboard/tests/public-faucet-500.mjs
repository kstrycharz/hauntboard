import {enterWalletCredential} from './gui-helpers.mjs';
import {confirmRecoveryWord} from './gui-helpers.mjs';
// Real public faucet claim only. No public test threads or posts. Preserve funded wallet privately.
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile,rename} from 'node:fs/promises';
process.umask(0o077);
const origin='https://payroll-levels-sensitivity-bit.trycloudflare.com',privateFile='/private/frontend-faucet-validation.json';
const save=async data=>{await writeFile(`${privateFile}.tmp`,JSON.stringify(data),{mode:0o600});await rename(`${privateFile}.tmp`,privateFile);};
let backup;try{backup=JSON.parse(await readFile(privateFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
if(backup?.result){console.log(JSON.stringify(backup.result));process.exit(0);}
const browser=await chromium.launch();
try{
 const context=await browser.newContext({viewport:{width:390,height:844},...(backup?.storage?{storageState:backup.storage}:{})}),page=await context.newPage();
 await page.goto(origin,{waitUntil:'networkidle'});await expect(page.locator('#provider-label')).toContainText('Esmeralda');
 const config=await page.evaluate(async()=>await(await fetch('/api/config')).json());assert.equal(config.network,'esmeralda');assert.equal(config.profile,'public');assert.equal(config.faucetEnabled,true);
 await page.locator('#browser-wallet-button').click();
 if(!backup){
  backup={password:'604281'};await page.locator('#wallet-create-choice').click();await enterWalletCredential(page, backup.password);await expect(page.locator('#wallet-seed-words li')).toHaveCount(24);
  backup.phrase=(await page.locator('#wallet-seed-words li').allTextContents()).join(' ');backup.address=await page.evaluate(async()=>(await import('/browser-wallet.mjs')).active().address);assert.match(backup.address,/^otl_esm_1/);
  await confirmRecoveryWord(page);await page.locator('#wallet-seed-saved').check();await page.locator('#wallet-confirm-seed').click();await expect(page.locator('#wallet-seed-panel')).toBeHidden();
  backup.storage=await context.storageState({indexedDB:true});await save(backup);
 }else{await enterWalletCredential(page, backup.password);await expect(page.locator('#wallet-lock')).toBeVisible();}
 await context.route(`${origin}/api/faucet-submit`,async route=>{
  // Save the exact pending signed request before allowing the public dispatch.
  backup.storage=await context.storageState({indexedDB:true});backup.pending=JSON.parse(route.request().postData());await save(backup);await route.continue();
 });
 await expect(page.locator('#wallet-faucet')).toBeEnabled();
 const responsePromise=page.waitForResponse(r=>r.url()===`${origin}/api/faucet-submit`&&r.request().method()==='POST',{timeout:90000});
 await page.locator('#wallet-faucet').click();
 const response=await responsePromise;if(!response.ok())throw new Error(`Public funding request returned ${response.status()}; exact pending request preserved`);
 const sent=await response.json();backup.transactionId=sent.transaction_id;await save(backup);
 await expect(page.locator('#wallet-message')).toContainText('500 test TARI confirmed on Tari',{timeout:180000});
 const amounts=await page.evaluate(async()=>(await import('/browser-wallet.mjs')).privateBalance());assert.equal(amounts.ready,'500000000');assert(BigInt(amounts.total)>=500000000n);
 await expect(page.locator('#browser-wallet-status')).toContainText('500 test TARI');await expect(page.locator('#wallet-faucet')).toBeDisabled();
 const checks=await Promise.all(['https://ootle-indexer-a.tari.com','https://ootle-indexer-b.tari.com'].map(async node=>{for(let i=0;i<60;i++){const receipt=await(await fetch(`${node}/transactions/${sent.transaction_id}/result`,{signal:AbortSignal.timeout(10000)})).json();const finalized=receipt.result?.Finalized;if(finalized){assert.equal(finalized.final_decision,'Commit');return {node,decision:'Commit'};}await new Promise(resolve=>setTimeout(resolve,2000));}throw new Error('Provider receipt confirmation is pending');}));
 const result={status:'PUBLIC_ESMERALDA_500_TEST_TARI_CLAIM_CONFIRMED',checkedAt:new Date().toISOString(),origin,transactionId:sent.transaction_id,recipient:backup.address,readyMicrotari:amounts.ready,walletBalanceMicrotari:amounts.total,checks,scope:'Actual public faucet claim and verified numeric frontend balance. Funded wallet recovery saved only in protected operator volume. No public messages posted.'};
 backup.storage=await context.storageState({indexedDB:true});backup.result=result;await save(backup);await writeFile('hauntboard/evidence/esmeralda-public-faucet-500.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}catch(error){await writeFile('/private/public-faucet-validation-error.txt',String(error.stack??error),{mode:0o600});throw new Error(`Public faucet check failed (${error.name}); exact wallet and pending intent are retained privately for reconciliation.`);}finally{await browser.close();}

