import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {decodeState} from '../lib/state.mjs';
const deployment=JSON.parse(await readFile('hauntboard/evidence/esmeralda-ci-contract.json','utf8'));
const candidate=JSON.parse(await readFile('hauntboard/artifacts/public-contract-manifest.json','utf8'));
assert.equal(deployment.wasmSha256,candidate.wasm.sha256);
const nodes=[];
for(const base of ['https://ootle-indexer-a.tari.com','https://ootle-indexer-b.tari.com']){
 const get=async path=>{const r=await fetch(`${base}/${path}`,{signal:AbortSignal.timeout(30000)});assert(r.ok);return r.json();};
 const row=await get(`substates/${deployment.board}`),state=decodeState(row,deployment.board);
 assert.equal(state.schema,4);assert.equal(state.isBoard,true);assert.equal(state.title,'Hauntboard Forums');
 assert.equal(row.substate.Component.header.template_address,deployment.template);assert.equal(row.substate.Component.header.owner_rule,'None');
 const transactions=[];
 for(const [stage,tx]of Object.entries(deployment.transactions)){
  const result=(await get(`transactions/${tx.id}/result`)).result?.Finalized;
  assert.equal(result?.final_decision,'Commit');assert(result.execution_result.finalize.result.Accept);
  transactions.push({stage,id:tx.id,accepted:true});
 }
 nodes.push({provider:base,verified:true,board:deployment.board,transactions});
}
const fee=Object.values(deployment.transactions).reduce((n,x)=>n+BigInt(x.actualFee),0n);assert(fee<=5000000n);
const config=JSON.parse(await readFile('/live/network.json','utf8'));
assert.equal(config.network,'esmeralda');assert.equal(config.networkByte,38);
if(config.board!==deployment.board)config.legacyBoards=[...new Set([...(config.legacyBoards??[]),config.board])];
if(config.template!==deployment.template)config.legacyTemplates=[...new Set([...(config.legacyTemplates??[]),config.template])];
config.board=deployment.board;config.template=deployment.template;config.schema=4;
config.instance=`hauntboard-actions-${process.env.HAUNTBOARD_RELEASE_ID}`;
config.compatibilityVerified=false;config.posterPrivacyVerified=false;
await writeFile('hauntboard/artifacts/actions-network.json',JSON.stringify(config,null,2)+'\n');
const report={status:'ACTIONS_CONTRACT_VERIFIED',sourceRevision:process.env.GITHUB_SHA,board:deployment.board,template:deployment.template,wasmSha256:deployment.wasmSha256,feesMicrotari:fee.toString(),nodes};
await writeFile('hauntboard/evidence/actions-contract-verification.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
