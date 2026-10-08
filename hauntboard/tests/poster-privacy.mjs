import {chromium} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {rpc,quoteTip,waitTransaction,requireAccepted} from '../lib/chain.mjs';
const browser=await chromium.launch();
const report={network:'localnet',checkedAt:new Date().toISOString(),status:'RUNNING',checks:{},limitations:['Local engine 0.43.0; not public Esmeralda proof.','IP, timing and spent-output graph remain visible.','Synthetic test funding origin is known; this test does not prove an anonymity set.']};
try{
 const c=JSON.parse(await readFile('/sender-companion/config.json','utf8'));assert.equal(c.network,'localnet');
 const context=await browser.newContext();await context.route('http://localhost:8280/**',async route=>{const headers=await route.request().allHeaders();headers.host='localhost:8280';await route.fulfill({response:await route.fetch({url:route.request().url().replace('http://localhost:8280','http://board-web:8280'),headers})});});
 const page=await context.newPage();await page.goto('http://localhost:8280/');
 const destination=await page.evaluate(async()=>{const sdk=await import('/vendor/wallet-sdk.mjs');globalThis.privacySigner=sdk.SecretKeyWallet.randomWithViewKey(16);return globalThis.privacySigner.getAddress();});
 const fund=await quoteTip(c,destination,'3000000','ConfidentialOnly','Synthetic poster privacy funding');
 const funded=requireAccepted(await waitTransaction(c,(await rpc(c,'accounts.stealth_transfer',fund)).transaction_id));
 const candidates=funded.result.result.Accept.up_substates.map(([id])=>id).filter(id=>id.startsWith('utxo_'));
 const prepared=await page.evaluate(async({candidates,board})=>{
  const sdk=await import('/vendor/wallet-sdk.mjs'),native=await import('/stealth-fee.mjs');
  const call=async(method,path,body)=>{const r=await fetch('/api/indexer',{method:'POST',headers:{'Content-Type':'application/json','X-Hauntboard-CSRF':(await(await fetch('/api/config')).json()).csrf},body:JSON.stringify({method,path,body})});const data=await r.json();if(!r.ok)throw new Error(data.error);return data;};
  const provider={network:()=>16,getSubstate:id=>call('GET',`substates/${id}`),getStealthUtxo:(resource,commitment)=>call('GET',`substates/${sdk.stealthUtxoSubstateId(resource,commitment)}`),getCurrentEpoch:async()=>(await call('GET','epoch-manager/stats')).current_epoch,resolveInputs:inputs=>Promise.all(inputs.map(async i=>({...i,version:i.version??(await provider.getSubstate(i.substate_id)).version})))};
  let coinId;for(const id of candidates){const row=await provider.getSubstate(id);if(await sdk.decryptOwnedUtxo(new sdk.WasmStealthCrypto(16),await globalThis.privacySigner.getViewSecret(),row,id)){coinId=id;break;}}
  if(!coinId)throw new Error('Cannot discover the owned synthetic fee output.');
  const uid=[...crypto.getRandomValues(new Uint8Array(16))],title=`Public ghost ${Date.now()}`,payload=[...new TextEncoder().encode(JSON.stringify({v:1,title,name:'Ghost',body:'Public message funded through native stealth input.'}))];
  const main=new sdk.TransactionBuilder(16,0).callMethod({componentAddress:board,methodName:'create_thread'},[sdk.literalArg(title),sdk.intLiteral(0n),sdk.vectorLiteral(uid),sdk.vectorLiteral(payload)]).buildUnsignedTransaction().instructions;
  const args={provider,signer:globalThis.privacySigner,coinId,networkByte:16,maxFee:1000000n,mainInstructions:main,mainInputs:[{substate_id:board,version:null,is_write:true}]};
  const dry=await native.prepareStealthFee({...args,dryRun:true});const simulated=await call('POST','transactions/dry-run',{transaction:dry.envelope});
  if(!simulated.result?.finalize?.result?.Accept)throw new Error(`Stealth fee simulation rejected: ${JSON.stringify(simulated.result?.finalize?.result).slice(0,600)}`);
  const receipt=simulated.result.finalize.fee_receipt,paid=BigInt(receipt.total_fees_paid)-BigInt(receipt.total_fee_overcharge??'0'),fee=paid+(paid+4n)/5n+1000n;
  const ready=await native.prepareStealthFee({...args,maxFee:fee,dryRun:false});
  const final=await call('POST','transactions/dry-run',{transaction:(await native.prepareStealthFee({...args,maxFee:fee,dryRun:true})).envelope});
  if(!final.result?.finalize?.result?.Accept)throw new Error('Bounded stealth fee simulation rejected.');
  const text=JSON.stringify(ready.transaction),owner=[...await globalThis.privacySigner.getPublicKey()].map(x=>x.toString(16).padStart(2,'0')).join('');
  const parsed=ready.feeStatement;
  const checks={noNamedAccountInput:ready.transaction.inputs.every(i=>!i.substate_id.startsWith('component_')||i.substate_id===board),noWalletOwnerInUnsignedBody:!text.includes(owner),noRevealedFunding:parsed.inputs_statement.revealed_amount==='0',nativeFeeBucket:ready.transaction.fee_instructions.some(i=>i.PayFeeFromBucket)};
  if(!Object.values(checks).every(Boolean))throw new Error('Privacy checks failed before submission.');
  const sent=await fetch('/api/browser-submit',{method:'POST',headers:{'Content-Type':'application/json','X-Hauntboard-CSRF':(await(await fetch('/api/config')).json()).csrf},body:JSON.stringify({transaction:ready.envelope,operation:[...crypto.getRandomValues(new Uint8Array(32))].map(x=>x.toString(16).padStart(2,'0')).join('')})});const result=await sent.json();if(!sent.ok)throw new Error(result.error);
  return {id:result.transaction_id,uid,owner,checks};
 },{candidates,board:c.board});
 let final;for(let attempt=0;attempt<90;attempt++){const result=await(await fetch(`http://indexer:18300/transactions/${prepared.id}/result`)).json();if(result.result?.Finalized){final=result.result.Finalized;break;}await new Promise(resolve=>setTimeout(resolve,1000));}
 assert.equal(final?.final_decision,'Commit');assert(final.execution_result.finalize.result.Accept);
 const raw=(await(await fetch(`http://indexer:18300/transactions/${prepared.id}`)).json()).transaction.transaction;
 const tx=raw.V1?.body?.transaction??raw.body?.transaction??raw;const wire=JSON.stringify(raw);
 report.checks={...prepared.checks,noWalletOwnerInFinalTransaction:!wire.includes(prepared.owner),actualFeeProgram:tx.fee_instructions.some(i=>i.PayFeeFromBucket),confirmedPublicPost:true};
 assert(Object.values(report.checks).every(Boolean));report.transactionId=prepared.id;report.status='LOCAL_STEALTH_FEE_POST_PASSED';
 await writeFile('hauntboard/evidence/poster-privacy.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser.close();}
