// Read-only operator diagnostic. Seed is supplied through stdin, never a file/report.
import {chromium,firefox,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
let phrase='';for await(const chunk of process.stdin)phrase+=chunk;
phrase=phrase.trim();if(!phrase)throw new Error('Seed required on stdin');
const engine=process.env.BROWSER??'chromium',origin=process.env.WALLET_DIAGNOSTIC_ORIGIN??'https://payroll-levels-sensitivity-bit.trycloudflare.com/';
const browser=await ({chromium,firefox}[engine]).launch();
try{
 const page=await browser.newPage();await page.goto(origin);await page.waitForFunction(()=>document.body.dataset.ready==='true');
 const derived=await page.evaluate(async phrase=>{
  const recovery=await import('/wallet-recovery.mjs'),sdk=await import('/vendor/wallet-sdk.mjs'),w=await import('/browser-wallet.mjs');
  const keys=await recovery.keysFromPhrase(phrase,{format:'native'});let identity;
  try{const pub=sdk.ootlePublicKeyFromSecretKey(keys.owner,keys.view);try{identity={address:sdk.generateOotleAddress(pub.owner_key,pub.view_key,38),publicKey:Array.from(pub.owner_key,x=>x.toString(16).padStart(2,'0')).join(''),candidateAccount:await recovery.accountFromPublicKey(pub.owner_key)};}finally{pub.free();}}finally{keys.owner.fill(0);keys.view.fill(0);}
  return identity;
 },phrase);
 await page.locator('#browser-wallet-button').click();await page.locator('#wallet-recover-choice').click();
 await page.evaluate(phrase=>{document.querySelector('#wallet-recovery-input').value=phrase;},phrase);
 await page.locator('#wallet-password').fill('864209');await page.locator('#wallet-pin-confirm').fill('864209');await page.locator('#wallet-restore').click();await expect(page.locator('#wallet-ready-panel')).toBeVisible({timeout:60000});
 const balance=await page.evaluate(async()=>await(await import('/browser-wallet.mjs')).privateBalance());
 const displayed=await page.locator('#wallet-balance-value').textContent();
 if(process.env.EXPECTED_NATIVE_BALANCE){if(balance.total!==process.env.EXPECTED_NATIVE_BALANCE||!displayed.includes('500'))throw new Error('Recovered balance mismatch');}
 phrase='';
 const providers=[];
 for(const base of ['https://ootle-indexer-a.tari.com','https://ootle-indexer-b.tari.com']){
  const r=await fetch(`${base}/substates/${derived.candidateAccount}`,{signal:AbortSignal.timeout(30000)});
  if(r.status===404){providers.push({provider:base,accountFound:false});continue;}if(!r.ok)throw new Error('Provider read failed');
  const row=await r.json();if(!row.verified||row.substate?.Component?.header?.owner_rule?.ByPublicKey!==derived.publicKey)throw new Error('Account owner verification failed');
  const {iterVaultIdsInState}=await import('../web/vendor/wallet-sdk.mjs');
  let nativeRevealed=0n;const resources=[];
  for(const id of iterVaultIdsInState(row.substate.Component.body.state)){
   const v=await(await fetch(`${base}/substates/${id}`,{signal:AbortSignal.timeout(30000)})).json();if(!v.verified)throw new Error('Unverified vault');
   const container=v.substate?.Vault?.resource_container,stealth=container?.Stealth;
   if(stealth){resources.push({resource:stealth.address,revealedMicrotari:stealth.revealed_amount});if(stealth.address==='resource_'+'01'.repeat(32))nativeRevealed+=BigInt(stealth.revealed_amount);}
  }
  providers.push({provider:base,accountFound:true,ownerVerified:true,nativeRevealedMicrotari:nativeRevealed.toString(),resources});
 }
 const report={status:'IMPORTED_WALLET_DIAGNOSED',checkedAt:new Date().toISOString(),engine,origin,...derived,hauntboardBalance:balance,displayedBalance:displayed,providers,chainWrites:0};await writeFile(`hauntboard/evidence/imported-wallet-diagnostic-${engine}.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}catch{throw new Error('Read-only imported-wallet diagnostic failed; no seed diagnostics logged.');}finally{phrase='';await browser.close();}
