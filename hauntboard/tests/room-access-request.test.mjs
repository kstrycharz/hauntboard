import {test}from'node:test';import assert from'node:assert/strict';
import {accessRequestCode,parseAccessRequest,memberLabel}from'../web/room-access-request.mjs';
test('copyable access requests preserve recipient context and Unicode names; older JSON requests still work',()=>{
  const request={format:'hauntboard-recipient',v:1,scope:'synthetic-room',publicKey:'synthetic',id:'synthetic',name:'Sam 👻'};
  assert.deepEqual(parseAccessRequest(accessRequestCode(request)),request);assert.deepEqual(parseAccessRequest(JSON.stringify(request)),request);assert.equal(memberLabel(request,0),'Sam 👻');assert.equal(memberLabel({},1),'Member 2');
});
test('incomplete or inappropriate input gives an actionable error',()=>{
  for(const value of ['','hauntboard-access-v1.!','[]','null',JSON.stringify({name:'x'.repeat(41)}),'x'.repeat(4097)])assert.throws(()=>parseAccessRequest(value));
});
