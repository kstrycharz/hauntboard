// The indexer now distinguishes up/down state explicitly. Preserve verified and
// version; a down substate must never be treated as spendable/current state.
export function providerState(row) {
  if(row?.state){
    if(!row.state.up?.substate || row.substate)throw Error('Substate is down or has conflicting representations.');
    return {...row,substate:typeof row.state.up.substate==='string'?decodeSubstateValue(row.state.up.substate):row.state.up.substate};
  }
  return row;
}
import {decodeSubstateValue} from './vendor/wallet-sdk.mjs';
