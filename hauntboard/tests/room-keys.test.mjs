import {test} from 'node:test';
import assert from 'node:assert/strict';
import {roomScope,recipientIdentity,recipientRequest,wrapRoomKeys,unwrapRoomKeys,newRecoverySecret,sealVault,openVault,nextGeneration,rotationEnvelopes} from '../web/room-keys.mjs';
import {sealPost,openSealedPost,sealedMetadata} from '../web/sealed-posts.mjs';
const profile={network:'esmeralda',resetIdentity:'synthetic-reset'}, board=`component_${'a'.repeat(64)}`,thread=`component_${'b'.repeat(64)}`,registry=`component_${'c'.repeat(64)}`;
const scope=roomScope(profile,board,thread);
test('HPKE delivery is recipient-specific and bound to room, network, generation and ciphertext',async()=>{
  const bob=await recipientIdentity(scope),eve=await recipientIdentity(scope),keys=[{generation:0,key:newRecoverySecret()}];
  const envelope=await wrapRoomKeys(await recipientRequest(bob),scope,0,keys);
  assert.deepEqual(await unwrapRoomKeys(envelope,bob,scope,0),keys);
  await assert.rejects(unwrapRoomKeys(envelope,eve,scope,0));
  await assert.rejects(unwrapRoomKeys(envelope,bob,scope+'different',0));
  await assert.rejects(unwrapRoomKeys(envelope,bob,scope,1));
  const bad={...envelope,ct:(envelope.ct[0]==='A'?'B':'A')+envelope.ct.slice(1)};
  await assert.rejects(unwrapRoomKeys(bad,bob,scope,0));
  assert(!JSON.stringify(envelope).includes(keys[0].key));
});
test('recovery authenticates the complete manifest and wrong secrets cannot restore it',async()=>{
  const secret=newRecoverySecret(),identity=await recipientIdentity(scope),value={v:1,rooms:{[thread]:{identity}}};
  const encrypted=await sealVault(value,secret,scope);
  assert.deepEqual(await openVault(encrypted,secret,scope),value);
  await assert.rejects(openVault(encrypted,newRecoverySecret(),scope));
  await assert.rejects(openVault(encrypted,secret,scope+'reset'));
  assert(!JSON.stringify(encrypted).includes(identity.privateKey.d));
});
test('removal blocks future content while retained historical keys still work',async()=>{
  const alice=await recipientIdentity(scope),bob=await recipientIdentity(scope),keys=[{generation:0,key:newRecoverySecret()}],next=nextGeneration(keys);
  const envelopes=await rotationEnvelopes([await recipientRequest(alice)],scope,next);
  await assert.rejects(unwrapRoomKeys(envelopes[0],bob,scope,1));
  const context=[board,Array(16).fill(1),Array(16).fill(2),0],content={title:'',name:'Ghost',body:'synthetic secret'};
  const p0=await sealPost(content,keys[0].key,profile,context,{title:'Room',category:'general',registry,generation:0});
  const p1=await sealPost(content,next[1].key,profile,context,{title:'Room',category:'general',registry,generation:1});
  assert.equal((await openSealedPost(p0,keys[0].key,profile,context,'Room')).body,content.body);
  await assert.rejects(openSealedPost(p1,keys[0].key,profile,context,'Room'));
  assert.equal((await openSealedPost(p1,next[1].key,profile,context,'Room')).body,content.body);
  assert.equal(sealedMetadata(p1).generation,1);
  const tampered=JSON.parse(new TextDecoder().decode(new Uint8Array(p1)));tampered.generation=0;
  await assert.rejects(openSealedPost(Array.from(new TextEncoder().encode(JSON.stringify(tampered))),next[1].key,profile,context,'Room'));
});
test('recipient substitution, duplicate membership and generation exhaustion are rejected',async()=>{
  const alice=await recipientIdentity(scope),request=await recipientRequest(alice);
  await assert.rejects(wrapRoomKeys({...request,publicKey:(await recipientIdentity(scope)).publicKey},scope,0,[{generation:0,key:newRecoverySecret()}]));
  await assert.rejects(rotationEnvelopes([request,request],scope,[{generation:0,key:newRecoverySecret()}]));
  assert.throws(()=>nextGeneration(Array.from({length:16},(_,generation)=>({generation,key:newRecoverySecret()}))));
});
