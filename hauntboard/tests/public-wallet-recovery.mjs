import {enterWalletCredential} from './gui-helpers.mjs';
// Restore the retained public validation wallet on a fresh device. No funds sent or posts made.
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
process.umask(0o077);
const source=JSON.parse(await readFile('/private/frontend-faucet-validation.json','utf8'));
assert(source.result&&source.phrase,'The confirmed validation wallet is required.');
const expectedReady=source.recycled?.retainedMicrotari??'500000000';
const expectedTokens=String(Number(expectedReady)/1000000);
const origin=source.result.origin,password='604281',browser=await chromium.launch();
try{
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),bodies=[];
 page.on('request',r=>{if(r.method()==='POST')bodies.push(r.postData()??'');});
 await page.goto(origin,{waitUntil:'networkidle'});
 await page.locator('#browser-wallet-button').click();
 await page.locator('#wallet-recover-choice').click();
 await page.locator('#wallet-recovery-input').fill(source.phrase);
 await enterWalletCredential(page, password);
 await page.locator('#wallet-restore').click();
 await expect(page.locator('#wallet-restore')).toBeEnabled({timeout:120000});
 await expect.poll(async()=>{
  const snapshot=await page.evaluate(async()=>{const w=await import('/browser-wallet.mjs');return {address:w.active()?.address,amounts:await w.privateBalance(),faucet:w.faucetStatus()};});
  if(snapshot.amounts.ready!==expectedReady){
   await page.locator('#wallet-sync-funds').click();
   await expect(page.locator('#wallet-sync-funds')).toBeEnabled({timeout:90000});
  }
  return snapshot;
 },{timeout:180000,intervals:[1000,3000,5000]}).toMatchObject({address:source.address,amounts:{ready:expectedReady},faucet:{claimed:true,pending:false}});
 await expect(page.locator('#browser-wallet-status')).toContainText(`${expectedTokens} test TARI`);
 await expect(page.locator('#wallet-faucet')).toBeDisabled();
 assert(!bodies.some(body=>body.includes(source.phrase)||body.includes(password)));
 await writeFile('/private/frontend-recovered-validation.json',JSON.stringify({password,storage:await context.storageState({indexedDB:true})}),{mode:0o600});
 const result={status:'PUBLIC_ESMERALDA_SEED_RECOVERY_CONFIRMED',checkedAt:new Date().toISOString(),origin,originalClaimTransaction:source.transactionId,verifiedReadyMicrotari:expectedReady,checks:{freshBrowserPhraseRecovery:true,sameWalletAddress:true,newDevicePassword:true,verifiedOwnedBalance:true,oneTimeFaucetRemainsDisabled:true,phraseAndPasswordStayLocal:true},scope:'Read-only recovery of the retained public validation wallet. No new claims, transfers or public messages.'};
 await writeFile(source.recycled?'hauntboard/evidence/esmeralda-public-wallet-recovery-after-recycle.json':'hauntboard/evidence/esmeralda-public-wallet-recovery.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}catch(error){await writeFile('/private/public-wallet-recovery-error.txt',String(error.stack??error),{mode:0o600});throw new Error(`Public wallet recovery check failed (${error.name}); diagnostic retained privately.`);}finally{await browser.close();}
