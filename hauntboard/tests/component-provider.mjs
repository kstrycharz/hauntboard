import assert from 'node:assert/strict';
import {getSubstate} from '../lib/chain.mjs';
const original=globalThis.fetch, address='component_'+'ab'.repeat(32), template='cd'.repeat(32);
const primary='https://ootle-indexer-a.tari.com', secondary='https://ootle-indexer-b.tari.com';
const row=(verified=true,t=template)=>({verified,version:0,substate:{Component:{header:{template_address:t}}}});
let calls=[];
const mock=fn=>{calls=[];globalThis.fetch=async url=>{calls.push(url);return fn(url);};};
const response=data=>({ok:true,json:async()=>data});
try {
  mock(url=>response(row(url.startsWith(secondary))));
  assert.equal((await getSubstate(primary,address,template,[secondary])).verified,true);
  assert.equal(calls.length,2);
  mock(url=>{if(url.startsWith(primary))throw new TypeError('network');return response(row());});
  assert.equal((await getSubstate(primary,address,template,[secondary])).verified,true);
  mock(()=>response(row(false)));
  await assert.rejects(()=>getSubstate(primary,address,template,[secondary]),e=>e.status===503);
  assert.equal(calls.length,2);
  mock(()=>response(row(true,'ef'.repeat(32))));
  await assert.rejects(()=>getSubstate(primary,address,template,[secondary]),e=>e.status===409);
  assert.equal(calls.length,1);
  mock(()=>response({verified:true,substate:{Vault:{}}}));
  await assert.rejects(()=>getSubstate(primary,address,template,[secondary]),e=>e.status===503);
  mock(()=>response(row(false)));
  await assert.rejects(()=>getSubstate('http://indexer:18300',address,template),e=>e.status===503);
  assert.equal(calls.length,1,'Localnet never falls back to a public provider.');
  console.log(JSON.stringify({status:'VERIFIED_COMPONENT_FALLBACK_PASSED',checks:['unverified-primary','primary-outage','both-unverified-rejected','wrong-template-rejected','non-component-rejected','localnet-isolated']}));
}finally{globalThis.fetch=original;}
