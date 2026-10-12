// Read-only provider request: no wallet, faucet or transaction submission.
import assert from 'node:assert/strict';
import {createApiClient} from '../web/api-client.mjs';
const origin=process.env.SESSION_ORIGIN;
assert(origin?.startsWith('https://'));
const config=await (await fetch(`${origin}/api/config`,{cache:'no-store'})).json();
config.csrf='expired-before-release';
let posts=0,refreshes=0;
const api=createApiClient({getConfig:()=>config,fetchImpl:async(path,options)=>{
  if(options?.method==='POST') posts++;
  else if(path==='/api/config') refreshes++;
  return fetch(`${origin}${path}`,{...options,headers:{...options?.headers,Origin:origin}});
}});
const network=await api('/api/indexer',{method:'GET',path:'network'});
assert.equal(network.network,'esmeralda');
assert.equal(posts,2);
assert.equal(refreshes,1);
const denied=await fetch(`${origin}/api/indexer`,{method:'POST',headers:{Origin:'https://attacker.example','Content-Type':'application/json','X-Hauntboard-CSRF':config.csrf},body:JSON.stringify({method:'GET',path:'network'})});
assert.equal(denied.status,403);
assert.equal((await denied.json()).code,undefined);
console.log(JSON.stringify({status:'PASSED',expiredSessionRecovered:true,wrongOriginRejected:true,chainWrites:0}));
