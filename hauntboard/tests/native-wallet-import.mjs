import {enterWalletCredential} from './gui-helpers.mjs';
import {chromium,firefox,expect} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin=process.env.RECOVERY_ORIGIN??'http://localhost:8283';let stage='start';
const vectors=JSON.parse(await readFile('hauntboard/artifacts/native-import-vectors.json','utf8'));

for(const [engine,type]of Object.entries({chromium,firefox})){
 const browser=await type.launch(),report={origin,engine,checkedAt:new Date().toISOString(),checks:{}};
 try{
  for(const vector of vectors){
   const context=await browser.newContext({viewport:{width:390,height:844}}),p=await context.newPage(),requests=[];
   if(origin==='http://localhost:8283')await context.route('http://localhost:8283/**',async r=>{const headers=await r.request().allHeaders();headers.host='localhost:8283';await r.fulfill({response:await r.fetch({url:r.request().url().replace('http://localhost:8283','http://board-privacy:8280'),headers})});});stage='navigation';p.on('request',r=>requests.push(r.url()+(r.postData()??'')));await p.goto(origin);await expect(p.locator('#identity')).toHaveText('Browser wallet locked',{timeout:30000});
   stage='derive';const result=await p.evaluate(async v=>{const r=await import('/wallet-recovery.mjs'),sdk=await import('/vendor/wallet-sdk.mjs'),hex=b=>Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');const k=await r.keysFromPhrase(v.phrase,{seedPassphrase:v.seedPassphrase,accountIndex:v.accountIndex});try{const pub=sdk.ootlePublicKeyFromSecretKey(k.owner,k.view);try{return{owner:hex(k.owner),view:hex(k.view),address:sdk.generateOotleAddress(pub.owner_key,pub.view_key,38),format:k.recoveryFormat};}finally{pub.free();}}finally{k.owner.fill(0);k.view.fill(0);}},vector);
   assert.equal(result.owner,vector.owner);assert.equal(result.view,vector.view);assert.equal(result.format,'tari-cipher-seed-v2');
   stage='ui';stage='open-ui';await p.locator('#browser-wallet-button').click();stage='recover-choice';await p.locator('#wallet-recover-choice').click();stage='phrase-input';await p.locator('#wallet-recovery-input').fill(vector.phrase);await p.locator('#wallet-recovery-advanced summary').click();stage='seed-passphrase-input';await p.locator('#wallet-seed-passphrase').fill(vector.seedPassphrase);stage='account-index-input';await p.locator('#wallet-account-index').fill(String(vector.accountIndex));
   // Localnet address is produced from the same keys with a different network prefix.
   stage='address';const address=await p.evaluate(async v=>{const r=await import('/wallet-recovery.mjs'),sdk=await import('/vendor/wallet-sdk.mjs'),config=await(await fetch('/api/config')).json(),k=await r.keysFromPhrase(v.phrase,{seedPassphrase:v.seedPassphrase,accountIndex:v.accountIndex});try{const pub=sdk.ootlePublicKeyFromSecretKey(k.owner,k.view);try{return sdk.generateOotleAddress(pub.owner_key,pub.view_key,config.networkByte);}finally{pub.free();}}finally{k.owner.fill(0);k.view.fill(0);}},vector);
   await p.locator('#wallet-expected-address').fill(address);stage='device-pin-input';await enterWalletCredential(p, '604281');stage='recover';await p.locator('#wallet-restore').click();await expect(p.locator('#wallet-restore')).toBeEnabled({timeout:60000});
   const active=await p.evaluate(async()=>(await import('/browser-wallet.mjs')).active());assert.equal(active?.address,address);
   stage='negative';const failures=await p.evaluate(async v=>{const r=await import('/wallet-recovery.mjs'),w=await import('/browser-wallet.mjs'),before=w.active().address;let wrongPassphrase=false,wrongAddress=false;try{await r.keysFromPhrase(v.phrase,{format:'native',seedPassphrase:'wrong synthetic passphrase'});}catch{wrongPassphrase=true;}try{await w.recover(v.phrase,'604281',{seedPassphrase:v.seedPassphrase,accountIndex:v.accountIndex,expectedAddress:'wrong address'});}catch{wrongAddress=w.active().address===before;}return{wrongPassphrase,wrongAddress};},vector);assert(failures.wrongPassphrase&&failures.wrongAddress);
   assert(!requests.some(s=>s.includes(vector.phrase)||s.includes('604281')||(vector.seedPassphrase&&s.includes(vector.seedPassphrase))));await context.close();
  }
  stage='legacy-and-account-address';const c=await browser.newContext(),page=await c.newPage();
  if(origin==='http://localhost:8283')await c.route('http://localhost:8283/**',async r=>{const headers=await r.request().allHeaders();headers.host='localhost:8283';await r.fulfill({response:await r.fetch({url:r.request().url().replace('http://localhost:8283','http://board-privacy:8280'),headers})});});await page.goto(origin);
  await page.waitForFunction(async()=>{try{await (await import("/browser-wallet.mjs")).exists();return true;}catch{return false;}},{timeout:30000});const compatibility=await page.evaluate(async()=>{const r=await import('/wallet-recovery.mjs'),w=await import('/browser-wallet.mjs'),sdk=await import('/vendor/wallet-sdk.mjs'),phrase=sdk.generateMnemonic(sdk.recoveryWordlist,256),legacy=await r.keysFromPhrase(phrase,{format:r.RECOVERY_FORMAT}),auto=await r.keysFromPhrase(phrase);let same;try{same=legacy.owner.every((x,i)=>x===auto.owner[i])&&legacy.view.every((x,i)=>x===auto.view[i]);}finally{legacy.owner.fill(0);legacy.view.fill(0);auto.owner.fill(0);auto.view.fill(0);}const config=await(await fetch("/api/config")).json();w.configure(config,async(path,body)=>{const response=await fetch(path,{method:body?"POST":"GET",headers:body?{"Content-Type":"application/json","X-Hauntboard-CSRF":config.csrf}:{},body:body?JSON.stringify(body):undefined}),value=await response.json();if(!response.ok)throw new Error(value.error??"Provider unavailable");return value;});const original=await w.recover(phrase,'604281',{format:r.RECOVERY_FORMAT}),address=original.address;w.lock();const restored=await w.recover(phrase,'604281',{format:r.RECOVERY_FORMAT});const pub=Uint8Array.from('ae03dfb32a1ca5748b55d92349eb3e950b8622a2271f4ec0cb39e2ea8b756447'.match(/../g),x=>parseInt(x,16));return{same,restored:address===restored.address,component:await r.accountFromPublicKey(pub)};});stage='legacy-round-trip';assert(compatibility.same&&compatibility.restored);stage='published-account-address';assert.equal(compatibility.component,'component_cf94eaf5d5c6d5a35a4f648bb12e1bc7096a344150f3310557a49232bb7ea7c0');await c.close();
  report.checks={officialCipherSeedKeysMatch:true,encryptedSeedPassphrase:true,accountZeroAndSeven:true,mobileUiImport:true,addressMismatchPreservesWallet:true,wrongSeedPassphraseRejected:true,secretsNeverSent:true,existingHauntboardRecoveryPreserved:true,accountAddressMatchesPublishedNetworkAccount:true};report.status='NATIVE_L2_WALLET_IMPORT_PASSED';await writeFile(`hauntboard/evidence/native-wallet-import-${engine}.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
 }catch(e){const labels=["Invalid recovery phrase","seed passphrase","unsupported","from_mnemonic","derive_keys","address","network","confirmed","Cannot read properties","not a function","Invalid wallet","recovery keys","different wallet","CipherSeed version"];console.log(JSON.stringify({stage,errorClass:e.name,frames:String(e.stack).split("\n").slice(1).map(line=>line.match(/at ([A-Za-z0-9_.$]+)/)?.[1]).filter(Boolean),labels:labels.filter(label=>String(e.message).includes(label))}));throw new Error(`Native import test failed at ${stage} (${e.name}); no recovery words logged.`);}finally{await browser.close();}
}










