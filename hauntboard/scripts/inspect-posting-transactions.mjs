import {readFile,writeFile} from 'node:fs/promises';
const config=JSON.parse(await readFile('hauntboard/deploy/network.json','utf8'));
const get=async(origin,path)=>{const r=await fetch(`${origin}/${path}`,{redirect:'error',signal:AbortSignal.timeout(10000)});if(!r.ok)throw new Error(`Provider lookup failed (${r.status}).`);return r.json();};
const origins=['https://ootle-indexer-a.tari.com','https://ootle-indexer-b.tari.com'];
const report={checkedAt:new Date().toISOString(),network:'esmeralda',board:config.board,template:config.template,transactions:[],postingPrivacyVerified:false,scope:'Read-only inspection of existing transactions; no public messages or fee spends created.'};
for(const origin of origins){
 const recent=await get(origin,'transactions/recent?limit=100');
 for(const summary of recent.transactions??[]){
  const id=summary.transaction_id??summary.id;if(!/^[a-f0-9]{64}$/.test(id??'')||report.transactions.some(t=>t.id===id))continue;
  const row=await get(origin,`transactions/${id}`),raw=row.transaction?.transaction??row.transaction;
  const tx=raw?.V1?.body?.transaction??raw?.body?.transaction??raw;
  if(!tx?.instructions?.some(i=>i.CallMethod?.component_address===config.board&&i.CallMethod.method==='create_thread'))continue;
  const results=await Promise.all(origins.map(node=>get(node,`transactions/${id}/result`)));
  if(results.some(r=>r.result?.Finalized?.final_decision!=='Commit'||!r.result.Finalized.execution_result?.finalize?.result?.Accept))continue;
  const componentInputs=(tx.inputs??[]).filter(i=>(i.substate_id??'').startsWith('component_')).map(i=>i.substate_id);
  const feeInstructions=tx.fee_instructions??[],statement=feeInstructions.find(i=>i.StealthTransfer)?.StealthTransfer?.statement;
  report.transactions.push({id,providersAgreeOnCommit:true,boardCreateThread:true,componentInputs,onlyBoardComponentInput:componentInputs.every(i=>i===config.board),nativeStealthFee:Boolean(statement&&feeInstructions.some(i=>i.PayFeeFromBucket)),revealedInput:statement?.inputs_statement?.revealed_amount??null,feeReceipt:results[0].result.Finalized.execution_result.finalize.fee_receipt,signerCount:tx.signatures?.length??raw?.V1?.body?.signatures?.length??null,limitations:['Persistent-key omission cannot be verified without the participant public-key reference.','Graph, timing, funding and network observations remain exposed.']});
 }
 if(report.transactions.length)break;
}
report.status=report.transactions.length?'EXISTING_PUBLIC_POSTING_INSPECTED':'POSTING_RECEIPT_NOT_DISCOVERED';
await writeFile('hauntboard/evidence/delivery-public-transactions.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,transactions:report.transactions.length,postingPrivacyVerified:false}));
