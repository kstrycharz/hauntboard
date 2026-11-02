import {chromium,firefox} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const notice=JSON.parse(await readFile('hauntboard/evidence/reset-notice-2026-11-02.json'));
const report={checkedAt:new Date().toISOString(),url:notice.url,transactionId:notice.transactionId,browsers:{},assets:{}};
for(const file of ['vendor/wallet-sdk.mjs','transaction-identity.wasm','provider-state.mjs','indexer-codec.mjs']){
 const response=await fetch('https://hauntboard.taritracker.com/'+file,{signal:AbortSignal.timeout(20000)});assert(response.ok);const local=await readFile('hauntboard/web/'+file),remote=Buffer.from(await response.arrayBuffer());assert(local.equals(remote),file);report.assets[file]=createHash('sha256').update(remote).digest('hex');
}
for(const [name,engine]of[['chromium',chromium],['firefox',firefox]]){
 const browser=await engine.launch();try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(notice.url);
  await page.getByText(notice.title,{exact:true}).first().waitFor({timeout:30000});await page.getByText('Thanks for testing Hauntboard. Welcome back!',{exact:false}).first().waitFor({timeout:30000});
  const checks=await page.evaluate(async({thread,body})=>{
   const config=await(await fetch('/api/config')).json(),ready=await fetch('/health/ready'),read=await(await fetch('/api/thread?address='+thread)).json();
   const content=JSON.parse(new TextDecoder().decode(new Uint8Array(read.posts[0].payload)));
   return {ready:ready.ok,newBoard:config.board==='component_14d6f4fb8e5bb76f833220284e59f6e0ad866bd35385f30ededdafa282c3399b',newReset:config.resetIdentity==='esmeralda-reset-2026-11-02',general:content.category==='general',exactBody:content.body===body,faucetConfigured:config.faucetEnabled===true,currentSdk:config.sdkVersion==='0.12.0'&&config.wasmVersion==='0.49.1'};
  },notice);assert(Object.values(checks).every(Boolean));assert.equal(errors.length,0,errors.join('\n'));report.browsers[name]=checks;
  if(name==='chromium')await page.screenshot({path:'hauntboard/evidence/reset-live-2026-11-02.png',fullPage:true});
  console.log(`${name}: live new board and exact General notice rendered without page errors`);
 }finally{await browser.close();}
}
report.status='PASSED';await writeFile('hauntboard/evidence/reset-vps-browser-2026-11-02.json',JSON.stringify(report,null,2)+'\n');
