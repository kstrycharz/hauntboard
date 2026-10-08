import {chromium,firefox} from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const origin=process.env.ACCOUNT_ORIGIN,reports=[];
for(const [engine,type]of Object.entries({chromium,firefox})){
 const browser=await type.launch();try{
  const page=await browser.newPage();await page.goto(origin);await page.waitForFunction(()=>document.body.dataset.ready==='true');
  const checks=await page.evaluate(async()=>{
   const w=await import('/browser-wallet.mjs'),config=await(await fetch('/api/config')).json();await w.create('584920');
   const check=async row=>{w.configure(config,async(path,body)=>{if(body.path==='network')return{network:config.network,network_byte:config.networkByte};return row;});let rejected=false;try{await w.privateBalance();}catch{rejected=true;}return rejected&&w.active().account===null;};
   return{unverifiedRejected:await check({verified:false,substate:{Component:{header:{owner_rule:{ByPublicKey:w.active().publicKey}}}}}),wrongOwnerRejected:await check({verified:true,substate:{Component:{header:{owner_rule:{ByPublicKey:'00'.repeat(32)}}}}})};
  });assert(checks.unverifiedRejected);assert(checks.wrongOwnerRejected);reports.push({engine,...checks});
 }finally{await browser.close();}
}
const report={status:'ACCOUNT_DISCOVERY_NEGATIVE_CHECKS_PASSED',origin,reports,chainWrites:0};await writeFile('hauntboard/evidence/account-discovery.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
