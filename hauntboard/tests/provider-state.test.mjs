import {test} from 'node:test';
import assert from 'node:assert/strict';
import {providerState,spentOutput} from '../web/provider-state.mjs';
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

test('only a matching verified down state can retire a spent wallet input',()=>{
  const id='utxo_example';
  for(const verified of [true,false]) {
    try { providerState({verified,state:{down:{}}},id);assert.fail('Down state was accepted'); }
    catch(error) { assert.equal(spentOutput(error,id),verified);assert.equal(spentOutput(error,'another-input'),false); }
  }
  assert.equal(spentOutput(new Error('Provider unavailable'),id),false);
  assert.equal(spentOutput(Object.assign(new Error('conflicting'),{code:'SUBSTATE_DOWN',substateId:id}),id),false);
  assert.throws(()=>providerState({verified:true,state:{down:{},up:{substate:{}}}},id),/conflicting/);
});
