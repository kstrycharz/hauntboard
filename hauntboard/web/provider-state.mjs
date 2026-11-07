// The indexer now distinguishes up/down state explicitly. Preserve verified and
// version; a down substate must never be treated as spendable/current state.
export function providerState(row, id) {
  if(row?.state){
    if(row.state.down && !row.state.up && !row.substate) throw Object.assign(new Error('These funds have already been spent.'), {code:'SUBSTATE_DOWN',verified:row.verified===true,substateId:id});
    if(!row.state.up?.substate || row.state.down || row.substate)throw Error('Substate is down or has conflicting representations.');
    return {...row,substate:typeof row.state.up.substate==='string'?decodeSubstateValue(row.state.up.substate):row.state.up.substate};
  }
  return row;
}
// Only a verified, matching spent state permits retiring a wallet entry.
// An outage, missing row or conflicting representation must retain it.
export function spentOutput(error,id) {
  return (error.code === 'SUBSTATE_DOWN' && error.verified === true && error.substateId === id) || error.message === `Input substate ${id} (v0) is down`;
}
import {decodeSubstateValue} from './vendor/wallet-sdk.mjs';
