import {chromium,firefox,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {scanOutputLedger} from '../web/output-ledger.mjs';
const origin=process.env.SCAN_ORIGIN,resource='resource_'+'01'.repeat(32),providers=[];
for(const base of ['https://ootle-indexer-a.tari.com','https://ootle-indexer-b.tari.com']){
 let descending=0,count=0,last=null,state;
 const readPage=async cursor=>{const response=await fetch(`${base}/utxos?resource_address=${resource}&limit=100${cursor?'&from_id='+cursor:''}`,{signal:AbortSignal.timeout(15000)});assert(response.ok);const data=await response.json();for(const [id]of data.utxos){if(last&&id<last)descending++;last=id;count++;}return data;};
 const first=await scanOutputLedger({coins:[],readPage,verifyOwned:async()=>null,maxPages:1,checkpoint:async value=>state=structuredClone(value)});
 if(!first.complete)await scanOutputLedger({...state,readPage,verifyOwned:async()=>null,maxPages:2});
 providers.push({provider:new URL(base).host,rows:count,decreasingCommitments:descending,resumeChecked:!first.complete});
}
const browsers=[];
for(const [engine,type]of Object.entries({chromium,firefox})){
 const browser=await type.launch();try{
  const page=await browser.newPage();await page.goto(origin);await expect(page.locator('body')).toHaveAttribute('data-ready','true',{timeout:30000});
  const scan=await page.evaluate(async()=>{const w=await import('/browser-wallet.mjs');await w.create('604281');const result=await w.syncPrivateFunds();w.lock();return{found:result.found,complete:result.complete,capacityReached:result.capacityReached};});
  assert.equal(scan.found,0);assert.equal(scan.capacityReached,false);browsers.push({engine,...scan});
 }catch(error){throw new Error(`Live scan failed (${error.name}); no wallet secrets logged.`);}finally{await browser.close();}
}
const report={status:'PUBLIC_OUTPUT_SCAN_PASSED',origin,checkedAt:new Date().toISOString(),providers,browsers,chainWrites:0};await writeFile('hauntboard/evidence/output-scan-live.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
