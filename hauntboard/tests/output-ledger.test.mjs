import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scanOutputLedger} from '../web/output-ledger.mjs';
const commitment=n=>n.toString(16).padStart(64,'0'),row=n=>[commitment(n),{synthetic:n}];
const id=n=>`utxo_${'01'.repeat(32)}_${commitment(n)}`;
test('recovery resumes beyond 1,000 outputs, preserves reserved coins and quarantines change',async()=>{
 const all=Array.from({length:1201},(_,n)=>row(n+1));let saved;
 const readPage=cursor=>({utxos:all.filter(([id])=>!cursor||id>cursor).slice(0,100)});
 const verifyOwned=async(_,u)=>[1100,1201].includes(u.synthetic)?{change:u.synthetic===1201}:null;
 const first=await scanOutputLedger({coins:[{id:id(9999),state:'reserved',pendingTx:'a'.repeat(64)}],readPage,verifyOwned,checkpoint:async s=>saved=structuredClone(s)});
 assert.equal(first.complete,false);assert.equal(first.cursor,commitment(1000));assert.equal(saved.coins[0].pendingTx,'a'.repeat(64));
 const second=await scanOutputLedger({...saved,readPage,verifyOwned});assert.equal(second.complete,true);assert.equal(second.found,2);assert.equal(second.coins.find(c=>c.id===id(1201)).state,'quarantined');
});
test('capacity checkpoints retain discovered funds and resume at the unrecorded output',async()=>{
 const coins=Array.from({length:31},(_,n)=>({id:id(n+1),state:'ready'}));coins.push({id:id(99),state:'used'});let saved;
 const readPage=cursor=>({utxos:[row(40),row(41)].filter(([id])=>!cursor||id>cursor)});
 const result=await scanOutputLedger({coins,readPage,verifyOwned:async()=>({change:false}),checkpoint:async s=>saved=structuredClone(s)});
 assert.equal(result.capacityReached,true);assert.equal(saved.coins.length,32);assert.equal(saved.cursor,commitment(40));assert(saved.coins.some(c=>c.id===id(40)));
 const resumed=await scanOutputLedger({...saved,coins:saved.coins.slice(1),readPage,verifyOwned:async()=>({change:false})});assert.equal(resumed.found,1);assert.equal(resumed.complete,true);
});
test('unverified ownership and repeating cursors cannot activate outputs',async()=>{
 await assert.rejects(scanOutputLedger({coins:[],readPage:async()=>({utxos:[row(1)]}),verifyOwned:()=>{throw new Error('unverified');}}),/unverified/);
 await assert.rejects(scanOutputLedger({coins:[],readPage:async()=>({utxos:[[commitment(1),null]]}),verifyOwned:async()=>({change:false})}),/Invalid output/);
 await assert.rejects(scanOutputLedger({coins:[],readPage:async()=>({utxos:[row(1),row(1)]}),verifyOwned:async()=>({change:false})}),/cursor/);
});
test('opaque insertion-order cursors resume through decreasing commitments',async()=>{
 const all=Array.from({length:201},(_,n)=>row(201-n));let saved;
 const readPage=cursor=>({utxos:all.slice(cursor?all.findIndex(([id])=>id===cursor)+1:0).slice(0,100)});
 const verifyOwned=async(_,u)=>[150,1].includes(u.synthetic)?{change:u.synthetic===1}:null;
 const first=await scanOutputLedger({coins:[],readPage,verifyOwned,maxPages:1,checkpoint:async state=>saved=structuredClone(state)});
 assert.equal(first.complete,false);assert.equal(first.cursor,commitment(102));
 const second=await scanOutputLedger({...saved,readPage,verifyOwned});assert.equal(second.complete,true);assert.equal(second.coins.length,2);assert.equal(second.coins.find(c=>c.id===id(1)).state,'quarantined');
});
test('cursor replay and multi-page cycles fail before activating repeated outputs',async()=>{
 let verified=0;
 await assert.rejects(scanOutputLedger({coins:[],cursor:commitment(1),readPage:async()=>({utxos:[row(1)]}),verifyOwned:async()=>{verified++;return{change:false};}}),/cursor/);assert.equal(verified,0);
 let page=0;
 await assert.rejects(scanOutputLedger({coins:[],readPage:async()=>({utxos:page++===0?Array.from({length:100},(_,n)=>row(n+1)):[row(1)]}),verifyOwned:async()=>null}),/cursor/);
});
