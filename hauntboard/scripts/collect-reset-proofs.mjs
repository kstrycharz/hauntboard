// Read-only evidence capture. Never submits transactions or accesses wallet keys.
import {chromium} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const record=JSON.parse(await readFile('hauntboard/evidence/room-key-esmeralda.json','utf8'));
const directory='hauntboard/evidence/reset-proofs-2026-11-04';await mkdir(directory,{recursive:true});
const browser=await chromium.launch();
try{
 const page=await browser.newPage();await page.goto('https://hauntboard.taritracker.com/');
 const decode=async row=>page.evaluate(async row=>{const sdk=await import('/vendor/wallet-sdk.mjs');return sdk.decodeSubstateValue(row.state.up.substate);},row);
 const summary={checkedAt:new Date().toISOString(),network:record.network,resetIdentity:record.resetIdentity,independentConsensusVerification:false,providers:{}};
 const entries=Object.entries({...record.stages,...record.publicConversation?.stages});
 for(const [provider,url]of [['a','https://ootle-indexer-a.tari.com'],['b','https://ootle-indexer-b.tari.com']]){
  const observations={transactions:{},substates:{}};
  for(const [name,stage]of entries){
   const get=async path=>{const r=await fetch(url+path);assert.equal(r.status,200,provider+': '+path);return r.json();};
   const optional=async path=>{const r=await fetch(url+path);if(r.status===404)return null;assert.equal(r.status,200);return r.json();};
   const result=await optional(`/transactions/${stage.id}/result`),transaction=await optional(`/transactions/${stage.id}`),receipt=await get(`/transaction-receipts/${stage.id}`),proof=await get(`/substates/txreceipt_${stage.id}?include_proof=true`);
   assert.equal(proof.verified,true);assert(proof.state.up.substate);
   const decodedReceipt=await decode(proof);
   assert.equal(decodedReceipt.TransactionReceipt.outcome,'Commit');
   if(result)assert.equal(result.result.Finalized.final_decision,'Commit');
   const execution=result?await page.evaluate(async result=>{const sdk=await import('/vendor/wallet-sdk.mjs');return typeof result==='string'?sdk.decodeExecuteResult(result):result;},result.result.Finalized.execution_result):null;
   if(execution)assert(execution.finalize.result.Accept);
   await writeFile(`${directory}/${provider}-${name}.json`,JSON.stringify({transaction,result,execution,receipt,proof,decodedReceipt},null,2)+'\n');
   observations.transactions[name]={id:stage.id,decision:decodedReceipt.TransactionReceipt.outcome,transactionAvailable:Boolean(transaction),receiptVerified:true,proofMaterialPresent:Boolean(proof.proof),actualFeeMicrotari:String(decodedReceipt.TransactionReceipt.fee_receipt.total_fees_paid)};
  }
  for(const [name,address]of Object.entries({board:record.board,thread:record.thread,registry:record.registry,publicThread:record.publicThread})){
   const r=await fetch(`${url}/substates/${address}?include_proof=true`);assert.equal(r.status,200);const raw=await r.json();assert.equal(raw.verified,true);const decoded=await decode(raw);
   await writeFile(`${directory}/${provider}-${name}-state.json`,JSON.stringify({raw,decoded},null,2)+'\n');observations.substates[name]={address,version:raw.version,verified:true};
  }
  summary.providers[provider]=observations;
 }
 assert.deepEqual(summary.providers.a.transactions,summary.providers.b.transactions);
 summary.status='BOTH_INDEXERS_MATCH_COMMIT';await writeFile(`${directory}/summary.json`,JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary));
}finally{await browser.close();}
