import {test} from 'node:test';
import assert from 'node:assert/strict';
import {providerState} from '../web/provider-state.mjs';
test('old and current up-state responses preserve verification and version',()=>{
  const substate={Component:{body:{state:[4]}}};
  const old={verified:true,version:2,substate};assert.equal(providerState(old),old);
  const current=providerState({verified:true,version:2,state:{up:{substate}}});assert.equal(current.substate,substate);assert.equal(current.verified,true);assert.equal(current.version,2);
  assert.equal(providerState({verified:false,version:2,state:{up:{substate}}}).verified,false);
});
test('down and conflicting provider state cannot be used as current state',()=>{
  assert.throws(()=>providerState({verified:true,state:{down:{}}}));
  assert.throws(()=>providerState({verified:true,substate:{},state:{up:{substate:{}}}}));
});
