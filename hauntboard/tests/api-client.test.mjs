import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApiClient} from '../web/api-client.mjs';
const response=(status,data)=>({status,ok:status>=200&&status<300,json:async()=>data});
test('an explicitly unaccepted expired session refreshes once and preserves exact signed bytes',async()=>{
  const config={network:'esmeralda',board:'existing',resetIdentity:'same',csrf:'old'};
  const calls=[];
  const api=createApiClient({getConfig:()=>config,fetchImpl:async(path,options)=>{
    calls.push({path,options});
    if(path==='/api/config') return response(200,{...config,csrf:'new'});
    return calls.length===1?response(403,{code:'SESSION_EXPIRED'}):response(200,{accepted:true});
  }});
  assert.deepEqual(await api('/api/browser-submit',{signed:'exact-envelope',operation:'same-operation'}),{accepted:true});
  assert.equal(calls.length,3);
  assert.equal(calls[0].options.body,calls[2].options.body);
  assert.equal(calls[0].options.headers['X-Hauntboard-CSRF'],'old');
  assert.equal(calls[2].options.headers['X-Hauntboard-CSRF'],'new');
  assert(calls.every(call=>call.options.cache==='no-store'));
});
test('origin failures, provider failures and uncertain transport are never retried',async()=>{
  for(const failure of [response(403,{error:'Origin rejected'}),response(503,{error:'Provider unavailable'}),new Error('Lost acknowledgement')]) {
    let calls=0;
    const api=createApiClient({getConfig:()=>({csrf:'old'}),fetchImpl:async()=>{calls++;if(failure instanceof Error)throw failure;return failure;}});
    await assert.rejects(api('/api/browser-submit',{signed:'same'}));
    assert.equal(calls,1);
  }
});
test('a changed board or reset stops before retrying the signed operation',async()=>{
  for(const changed of [{board:'different'},{resetIdentity:'different'}]) {
    let calls=0;
    const config={board:'existing',resetIdentity:'same',csrf:'old'};
    const api=createApiClient({getConfig:()=>config,fetchImpl:async()=>++calls===1?response(403,{code:'SESSION_EXPIRED'}):response(200,{...config,...changed,csrf:'new'})});
    await assert.rejects(api('/api/browser-submit',{signed:'same'}),/configuration changed/);
    assert.equal(calls,2);
    assert.equal(config.csrf,'old');
  }
});
test('repeated expiration is surfaced after one retry',async()=>{
  let calls=0;
  const config={csrf:'old'};
  const api=createApiClient({getConfig:()=>config,fetchImpl:async(path)=>{calls++;return path==='/api/config'?response(200,{csrf:'new'}):response(403,{code:'SESSION_EXPIRED',error:'Session expired'});}});
  await assert.rejects(api('/api/browser-submit',{signed:'same'}),/Session expired/);
  assert.equal(calls,3);
});
