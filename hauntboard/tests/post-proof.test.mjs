import {test} from 'node:test';
import assert from 'node:assert/strict';
import {postProof,chainStateLink} from '../web/post-proof.mjs';
const pages=['a','b','c'].map(x=>`component_${x.repeat(64)}`);
const thread={schema:4,address:`component_${'d'.repeat(64)}`,pages,postCount:40};
const config={network:'esmeralda',providerUrl:'https://ootle-indexer-b.tari.com'};
test('opening, rollover and older replies point to their actual storage page',()=>{
  for(const index of [0,15,16,31,32,39]) {
    const proof=postProof(config,thread,{index});
    assert.equal(proof.address,pages[Math.floor(index/16)]);
    assert.equal(proof.slot,index%16);
    assert.equal(proof.postNumber,index+1);
    assert.equal(proof.href,`https://ootle-indexer-b.tari.com/substates/${proof.address}`);
  }
});
test('legacy posts link to their thread component and local clients use the raw-state route',()=>{
  const proof=postProof({network:'localnet'},{...thread,schema:2},{index:20});
  assert.equal(proof.address,thread.address);
  assert.equal(proof.slot,20);
  assert.equal(proof.href,`/api/raw?address=${thread.address}`);
});
test('invalid post positions, missing pages and unexpected provider URLs do not produce proof links',()=>{
  for(const index of [-1,40,1.5]) assert.throws(()=>postProof(config,thread,{index}));
  assert.throws(()=>postProof(config,{...thread,pages:[]},{index:0}));
  assert.throws(()=>chainStateLink({...config,providerUrl:'https://attacker.example'},pages[0]));
});
