import {decodeExecuteResult,decodeUtxo} from './vendor/wallet-sdk.mjs';
export function providerResult(row){
 if(typeof row?.result==='string'&&row.result!=='Pending')return {...row,result:decodeExecuteResult(row.result)};
 const final=row?.result?.Finalized;
 if(final&&typeof final.execution_result==='string')return {...row,result:{Finalized:{...final,encoded_execution_result:final.execution_result,execution_result:decodeExecuteResult(final.execution_result)}}};
 return row;
}
export function providerUtxos(row){return {...row,utxos:row.utxos.map(([id,value])=>[id,typeof value==='string'?decodeUtxo(value):value])};}
