import {chromium,firefox} from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const engine=process.env.BROWSER==='firefox'?'firefox':'chromium';
const browser=await (engine==='firefox'?firefox:chromium).launch();
const report={checkedAt:new Date().toISOString(),browser:engine,network:'localnet',checks:{}};
async function client(){const context=await browser.newContext();await context.route('http://localhost:8280/**',async route=>{const headers=await route.request().allHeaders();headers.host='localhost:8280';await route.fulfill({response:await route.fetch({url:route.request().url().replace('http://localhost:8280','http://board-web:8280'),headers})});});return context;}
try{
 const context=await client(),page=await context.newPage();await page.goto('http://localhost:8280/');await page.waitForFunction(()=>document.getElementById('provider-label').textContent==='Primary local indexer');
 const result=await page.evaluate(async()=>{
  const w=await import('/browser-wallet.mjs'),password='synthetic-recovery-test-password';
  await w.create(password);const identity=w.active(),backup=await w.backup(password),checks={};
  async function rejected(value,pw=password){try{await w.restore(value,pw);return false;}catch{return w.active()?.address===identity.address;}}
  checks.wrongPasswordPreservesActiveWallet=await rejected(backup,'synthetic-wrong-password');
  const corrupt=structuredClone(backup);corrupt.ct[0]^=1;checks.corruptBackupPreservesWallet=await rejected(corrupt);
  checks.wrongNetworkPreservesWallet=await rejected({...backup,network:'esmeralda',networkByte:38});
  checks.wrongResetPreservesWallet=await rejected({...backup,resetIdentity:'another-generation'});
  const original=indexedDB.open.bind(indexedDB);indexedDB.open=()=>{throw new Error('synthetic storage failure');};
  checks.storageFailurePreservesActiveWallet=await rejected(backup);indexedDB.open=original;
  await w.restore(backup,password);checks.sameIdentityRestore=w.active().address===identity.address;
  const originalConfig=await (await fetch('/api/config')).json();
  w.configure({...originalConfig,network:'esmeralda',networkByte:38,resetIdentity:'synthetic-public-generation'},()=>{throw new Error('No public API permitted in this generation test.');});
  checks.networkStorageIsSeparated=!(await w.exists());await w.create(password);const publicBackup=await w.backup(password);
  checks.publicNetworkKeysAndBackupMetadata=publicBackup.network==='esmeralda'&&publicBackup.networkByte===38&&w.active().address!==identity.address;
  w.configure(originalConfig,()=>{throw new Error('No API needed for an unfunded identity.');});await w.unlock(password);checks.localWalletPreservedAfterNetworkSwitch=w.active().address===identity.address;
  return {identity,backup,checks};
 });Object.assign(report.checks,result.checks);for(const [name,passed] of Object.entries(result.checks))assert.equal(passed,true,name);
 const second=await client(),other=await second.newPage();await other.goto('http://localhost:8280/');await other.waitForFunction(()=>document.getElementById('provider-label').textContent==='Primary local indexer');
 const otherBackup=await other.evaluate(async()=>{const w=await import('/browser-wallet.mjs');await w.create('synthetic-recovery-test-password');return w.backup('synthetic-recovery-test-password');});
 const replaced=await page.evaluate(async backup=>{const w=await import('/browser-wallet.mjs'),before=w.active();try{await w.restore(backup,'synthetic-recovery-test-password');return false;}catch{return before.address===w.active().address;}},otherBackup);
 assert(replaced);report.checks.differentIdentityCannotReplaceSavedWallet=true;
 const raced=await client(),a=await raced.newPage(),b=await raced.newPage();await Promise.all([a.goto('http://localhost:8280/'),b.goto('http://localhost:8280/')]);await Promise.all([a,b].map(p=>p.waitForFunction(()=>document.getElementById('provider-label').textContent==='Primary local indexer')));
 const attempt=p=>p.evaluate(async()=>{const w=await import('/browser-wallet.mjs');try{await w.create('synthetic-race-test-password');return 'created';}catch{return 'blocked';}});
 const outcomes=await Promise.all([attempt(a),attempt(b)]);assert.deepEqual(outcomes.sort(),['blocked','created']);report.checks.crossTabCreateClaimsOneIdentity=true;
 const recovered=await client(),fresh=await recovered.newPage();await fresh.goto('http://localhost:8280/');await fresh.waitForFunction(()=>document.getElementById('provider-label').textContent==='Primary local indexer');
 const restored=await fresh.evaluate(async backup=>{const w=await import('/browser-wallet.mjs');await w.restore(backup,'synthetic-recovery-test-password');return w.active();},result.backup);assert.equal(restored.address,result.identity.address);report.checks.preFundingBackupRecoversKeys=true;
 report.status='PASSED';
}catch(e){report.status='FAILED';report.error=e.message;process.exitCode=1;}
finally{await writeFile(`hauntboard/evidence/wallet-hardening-${engine}.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));for(const c of browser.contexts())await c.unrouteAll({behavior:'ignoreErrors'});await browser.close();}
