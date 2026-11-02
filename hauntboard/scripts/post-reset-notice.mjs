// Explicitly authorized public General notice, using the deployed browser wallet.
import {chromium} from '@playwright/test';
import {readFile,writeFile,rename,access} from 'node:fs/promises';
import {randomInt,randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
assert(process.argv.includes('--authorized-esmeralda-20-tari'),'Explicit testnet posting authorization required');
process.umask(0o077);
const file='/private/esmeralda-deployment.json',stateFile='/private/reset-notice-browser.json';
const journal=JSON.parse(await readFile(file,'utf8'));
assert.equal(journal.resetIdentity,'esmeralda-reset-2026-11-02');assert.equal(journal.budgetMicrotari,'20000000');
const save=async()=>{await writeFile(file+'.tmp',JSON.stringify(journal),{mode:0o600});await rename(file+'.tmp',file);};
journal.notice??={pin:String(randomInt(100000,1000000)),uid:Array.from(randomBytes(16))};await save();
const content={category:'general',title:'Esmeralda reset: why the forum started fresh',name:'Hauntboard',body:'The Tari Ootle Esmeralda testnet was reset, which removed the previous Ootle on-chain state. That included Hauntboard’s board, threads, replies, room-key registries and L2 test-token balances. This is why the old forum was wiped.\n\nHauntboard stores posts in smart-contract state. Rebuilding the website cannot restore data erased by a network reset. We have deployed new board and room-key registry contracts, updated the client for the current network, and switched this site to the new deployment. New discussions and replies now start on this fresh board.\n\nYour recovery phrase still represents your wallet keys, but it does not restore erased on-chain posts or balances. Keep your recovery phrase and room-key backups private. Esmeralda is a testnet, so its data and balances may be reset again.\n\nThanks for testing Hauntboard. Welcome back!'};
const browser=await chromium.launch();let context;
try{
 let storageState;try{await access(stateFile);storageState=stateFile;}catch{}
 context=await browser.newContext(storageState?{storageState}:{});
 const page=await context.newPage();
 await page.exposeFunction('noticeCheckpoint',()=>context.storageState({path:stateFile,indexedDB:true}));
 await page.exposeFunction('reserveNoticeFee',async(name,maxFee)=>{assert(['notice-prepare','notice-post'].includes(name));assert(BigInt(maxFee)>0n&&BigInt(maxFee)<=1000000n);const total=Object.entries(journal.stages).reduce((n,[key,s])=>n+(key===name?0n:BigInt(s.maxFee)),0n);assert(total+BigInt(maxFee)+1000000n<=20000000n);journal.stages[name]??={maxFee:String(maxFee),status:'reviewed'};assert.equal(journal.stages[name].maxFee,String(maxFee));await save();});
 await page.exposeFunction('noticeDispatch',async(name,body)=>{const s=journal.stages[name];assert(s&&s.status==='reviewed','An existing dispatch requires reconciliation');const result=spawnSync('/target/debug/reset-transaction-id',[],{input:body.transaction,encoding:'utf8'});assert.equal(result.status,0,result.stderr);Object.assign(s,{id:result.stdout.trim(),envelope:body.transaction,operation:body.operation,status:'submitting'});await save();});
 await page.exposeFunction('noticeAcknowledged',async(name,id)=>{assert.equal(journal.stages[name].id,id);journal.stages[name].status='submitted';await save();});
 await page.exposeFunction('noticeConfirmed',async(name,receipt)=>{const s=journal.stages[name];assert.equal(receipt.result?.Finalized?.final_decision,'Commit');const execution=receipt.result.Finalized.execution_result;assert(execution.finalize?.result?.Accept);s.status='confirmed';s.actualFee=String(execution.finalize.fee_receipt.total_fees_paid);await save();});
 await page.goto('https://hauntboard.taritracker.com/?category=general');
 const result=await page.evaluate(async({phrase,pin,uid,content,board,prepared})=>{
  const config=await(await fetch('/api/config')).json();if(config.board!==board||config.resetIdentity!=='esmeralda-reset-2026-11-02')throw Error('Website has not switched to the reset deployment');
  const {createApiClient}=await import('/api-client.mjs'),wallet=await import('/browser-wallet.mjs');const raw=createApiClient({getConfig:()=>config});let stage=null;
  const api=async(path,body)=>{if(path==='/api/browser-submit'){await window.noticeCheckpoint();await window.noticeDispatch(stage,body);}const value=await raw(path,body);if(path==='/api/browser-submit')await window.noticeAcknowledged(stage,value.transaction_id);return value;};
  wallet.configure(config,api);
  const boardState=await api('/api/board'),prior=boardState.threads.find(t=>JSON.stringify(t.uid)===JSON.stringify(uid));
  if(prior)return {thread:prior.address,reused:true};
  if(await wallet.exists())await wallet.unlock(pin);else await wallet.recover(phrase,pin,{format:'native'});
  await window.noticeCheckpoint();await wallet.syncPrivateFunds();
  if(wallet.privateFunds().ready===0){
   if(prepared)throw Error('Previous preparation must be reconciled before another conversion');
   stage='notice-prepare';const quote=await wallet.reviewPostingPreparation();if(quote.pending)throw Error('Existing preparation needs reconciliation');await window.reserveNoticeFee(stage,quote.fee);await window.noticeCheckpoint();
   const receipt=await wallet.confirmPostingPreparation();await window.noticeConfirmed(stage,await api('/api/indexer',{method:'GET',path:`transactions/${receipt.id}/result`}));await window.noticeCheckpoint();
  }
  stage='notice-post';const payload=Array.from(new TextEncoder().encode(JSON.stringify({v:1,...content})));
  const quote=await wallet.review({kind:'thread',board,title:content.title,mode:0,uid,payload});await window.reserveNoticeFee(stage,quote.maxFee);await window.noticeCheckpoint();
  const sent=await wallet.submit(quote);await window.noticeCheckpoint();
  let final;for(let i=0;i<100;i++){final=await wallet.transaction(sent.transactionId);if(final.status!=='Pending')break;await new Promise(r=>setTimeout(r,1500));}
  if(final?.status!=='Accepted')throw Error('Notice outcome requires reconciliation: '+sent.transactionId);
  await window.noticeConfirmed(stage,await api('/api/indexer',{method:'GET',path:`transactions/${sent.transactionId}/result`}));await window.noticeCheckpoint();
  const updated=await api('/api/board'),thread=updated.threads.find(t=>JSON.stringify(t.uid)===JSON.stringify(uid));if(!thread)throw Error('Notice finalized but indexing is pending');
  const read=await api('/api/thread?address='+thread.address),posted=JSON.parse(new TextDecoder().decode(new Uint8Array(read.posts[0].payload)));
  if(posted.body!==content.body||posted.category!=='general')throw Error('Posted notice content mismatch');wallet.lock();return {thread:thread.address,transactionId:sent.transactionId,category:posted.category,title:posted.title,body:posted.body};
 },{phrase:journal.phrase,pin:journal.notice.pin,uid:journal.notice.uid,content,board:journal.board,prepared:journal.stages['notice-prepare']?.status==='confirmed'});
 const report={status:'RESET_NOTICE_POSTED',checkedAt:new Date().toISOString(),...result,url:`https://hauntboard.taritracker.com/?category=general&thread=${result.thread}`};
 await writeFile('hauntboard/evidence/reset-notice-2026-11-02.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{if(context){await context.storageState({path:stateFile,indexedDB:true}).catch(()=>{});await context.close();}await browser.close();}
