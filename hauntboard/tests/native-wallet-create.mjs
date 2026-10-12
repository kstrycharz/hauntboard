import {enterWalletCredential} from './gui-helpers.mjs';
import {confirmRecoveryWord} from './gui-helpers.mjs';
import {chromium,firefox,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin=process.env.RECOVERY_ORIGIN??'http://localhost:8283',fixtures=[];
for(const [engine,type]of Object.entries({chromium,firefox})){
 const browser=await type.launch();let stage='create';
 try{
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),requests=[];
  if(origin==='http://localhost:8283')await context.route('http://localhost:8283/**',async r=>{const headers=await r.request().allHeaders();headers.host='localhost:8283';await r.fulfill({response:await r.fetch({url:r.request().url().replace('http://localhost:8283','http://board-privacy:8280'),headers})});});
  page.on('request',r=>requests.push(r.url()+(r.postData()??'')));await page.goto(origin);await expect(page.locator('#identity')).toHaveText('Browser wallet locked',{timeout:30000});stage='open-wallet';await page.locator('#browser-wallet-button').click();await page.locator('#wallet-create-choice').click();await enterWalletCredential(page, '604281');stage='generate-wallet';await expect(page.locator('#wallet-seed-words li')).toHaveCount(24,{timeout:60000});
  const phrase=(await page.locator('#wallet-seed-words li').allTextContents()).join(' ');
  stage='decode';const result=await page.evaluate(async phrase=>{const r=await import('/wallet-recovery.mjs'),w=await import('/browser-wallet.mjs'),hex=b=>Array.from(b,x=>x.toString(16).padStart(2,'0')).join(''),keys=await r.keysFromPhrase(phrase,{format:'native'});try{return{phrase,owner:hex(keys.owner),view:hex(keys.view),format:keys.recoveryFormat,address:w.active().address,needsConfirmation:w.needsPhraseConfirmation()};}finally{keys.owner.fill(0);keys.view.fill(0);}},phrase);
  assert.equal(result.format,'tari-cipher-seed-v2');assert(result.needsConfirmation);assert(!requests.some(s=>s.includes(phrase)));assert.equal(await page.locator('option[value="hauntboard-bip39-tari-v1"]').count(),0);
  await confirmRecoveryWord(page);await page.locator('#wallet-seed-saved').check();await page.locator('#wallet-confirm-seed').click();await expect(page.locator('#wallet-seed-panel')).toBeHidden();assert.equal(await page.evaluate(async()=>(await import('/browser-wallet.mjs')).needsPhraseConfirmation()),false);
  stage='restore';const restored=await page.evaluate(async phrase=>{const w=await import('/browser-wallet.mjs');w.lock();return(await w.recover(phrase,'604281')).address;},phrase);assert.equal(restored,result.address);fixtures.push({phrase,owner:result.owner,view:result.view});await context.close();
  const report={status:'NATIVE_WALLET_CREATION_PASSED',origin,engine,checkedAt:new Date().toISOString(),checks:{standardCipherSeed:true,phraseConfirmationRequired:true,sameAddressAfterRecovery:true,noCustomPhraseChoice:true,phraseNotSent:true}};await writeFile(`hauntboard/evidence/native-wallet-create-${engine}.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
 }catch(error){console.log(JSON.stringify({stage,labels:['timeout','generate_cipher_seed','unreachable','getrandom','not a function','24'].filter(x=>String(error.message).includes(x))}));throw new Error(`Native creation failed at ${stage} (${error.name}); no private diagnostics logged.`);}finally{await browser.close();}
}
// Unfunded compatibility fixtures stay in the ignored artifact directory.
await writeFile('hauntboard/artifacts/native-created-vectors.json',JSON.stringify(fixtures),{mode:0o600});

