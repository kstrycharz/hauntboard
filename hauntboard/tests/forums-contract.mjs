import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {decodeState} from '../lib/state.mjs';
const deployment=JSON.parse(await readFile('hauntboard/evidence/esmeralda-forums-contract.json','utf8'));
const nodes=[];
for(const base of ['https://ootle-indexer-a.tari.com','https://ootle-indexer-b.tari.com']){
 const get=async path=>{const r=await fetch(`${base}/${path}`,{signal:AbortSignal.timeout(30000)});assert(r.ok);return r.json();};
 const row=await get(`substates/${deployment.board}`),state=decodeState(row,deployment.board);
 assert.equal(state.schema,4);assert.equal(state.isBoard,true);assert.equal(state.title,'Hauntboard Forums');assert.equal(state.mode,0);
 assert.equal(row.substate.Component.header.template_address,deployment.template);assert.equal(row.substate.Component.header.owner_rule,'None');
 const transactions=[];
 for(const [stage,tx]of Object.entries(deployment.transactions)){
  const result=await get(`transactions/${tx.id}/result`);
  const finalized=result.result?.Finalized;
  assert.equal(finalized?.final_decision,'Commit');
  assert(finalized.execution_result?.finalize?.result?.Accept,`Transaction ${stage} is not accepted`);
  transactions.push({stage,id:tx.id,accepted:true});
 }
 nodes.push({provider:base,verified:true,schema:state.schema,title:state.title,threads:state.threads.length,transactions});
}
const report={status:'FORUMS_CONTRACT_VERIFIED_ON_BOTH_TARI_NODES',checkedAt:new Date().toISOString(),board:deployment.board,template:deployment.template,nodes,chainWrites:0};
await writeFile('hauntboard/evidence/forums-contract-verification.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
