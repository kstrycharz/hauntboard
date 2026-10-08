import {test} from 'node:test';
import assert from 'node:assert/strict';
import {decodeState} from '../lib/state.mjs';
const address=n=>`component_${n.repeat(64)}`;
function page(){return {verified:true,version:1,substate:{Component:{body:{state:[4,false,address('a'),'',0,Array(16).fill(2),[],[[Array(16).fill(3),0,[1],10]],[],1,address('b'),16]}}}};}
test('chain decoding rejects hostile page roles, counts, parents, bounds and provider metadata',()=>{
 assert.equal(decodeState(page(),address('c')).posts[0].index,16);
 for(const mutate of [r=>r.verified=false,r=>r.version=-1,r=>r.substate.Component.body.state[1]=true,r=>r.substate.Component.body.state[5]=[1],r=>r.substate.Component.body.state[9]=2,r=>r.substate.Component.body.state[11]=2048,r=>r.substate.Component.body.state[7][0][1]=16,r=>r.substate.Component.body.state[7][0][1]=-2,r=>r.substate.Component.body.state[7][0][2]=[],r=>r.substate.Component.body.state[7][0][3]=-1,r=>r.substate.Component.body.state[8]=null]){
  const row=page();mutate(row);assert.throws(()=>decodeState(row,address('c')));
 }
});
test('thread metadata must reference distinct pages and board entries have distinct identities',()=>{
 const row={verified:true,version:0,substate:{Component:{body:{state:[4,false,address('a'),'Title',0,Array(16).fill(2),[],[],[address('c'),address('c')],17,'',0]}}}};
 assert.throws(()=>decodeState(row,address('b')),/INVALID_CHAIN_PAGE_RANGE/);
 const thread=[address('b'),'Thread',0,Array(16).fill(2)];
 row.substate.Component.body.state=[4,true,'','Board',0,[],[thread,structuredClone(thread)],[],[],0,'',0];
 assert.throws(()=>decodeState(row,address('a')),/DUPLICATE_CHAIN_THREAD/);
 row.substate.Component.body.state[6].pop();assert.equal(decodeState(row,address('a')).threads.length,1);
});
