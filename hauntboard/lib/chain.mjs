import { readFile, writeFile, rename, mkdir, open, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
export const NATIVE = `resource_${'01'.repeat(32)}`;
export const COMPONENT = /^component_[a-f0-9]{64}$/;
export const MAX_FEE = '1000000';
export const bytesVar = bytes => `[${Array.from(bytes, b => `${b}u8`).join(',')}]`;
export const textVar = text => JSON.stringify(text);
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export async function atomicJson(path, data) {
  const temp = `${path}.${randomUUID()}.tmp`;
  const handle=await open(temp,'wx',0o600);
  try{await handle.writeFile(JSON.stringify(data,null,2)+'\n');await handle.sync();}finally{await handle.close();}
  try{await rename(temp,path);}catch(e){await unlink(temp).catch(()=>{});throw e;}
}
const allowed = new Set(['wallet.get_info','accounts.get','accounts.get_balances','accounts.create_free_test_coins','accounts.stealth_transfer','stealth_utxos.list','transactions.get','transactions.get_all','transactions.submit_manifest','transactions.submit_instruction','transactions.publish_template','templates.list_authored','auth.create_api_key','auth.revoke_api_key']);
export async function rpc(config, method, params = {}) {
  if (!allowed.has(method)) throw new Error('WALLET_METHOD_NOT_ALLOWED');
  const token = config.token ?? (await readFile(config.tokenFile, 'utf8')).trim();
  const response = await fetch(config.rpcUrl, {
    method:'POST', headers:{'Content-Type':'application/json', Authorization:`Bearer ${token}`},
    body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}), signal:AbortSignal.timeout(30000), redirect:'error'
  });
  const body = await response.json();
  if (!response.ok || body.error || !body.result) {
    // Never log RPC bodies: they can contain plaintext memos or wallet details.
    throw Object.assign(new Error(`Wallet rejected ${method} (${body.error?.code ?? response.status})`), {rpcCode:body.error?.code, diagnostic: String(body.error?.message ?? '').slice(0,400)});
  }
  return body.result;
}
export async function verifyWallet(config) {
  const info = await rpc(config, 'wallet.get_info');
  if (info.network !== 'localnet' || info.network_byte !== 16 || info.version !== '0.43.0') throw new Error('LOCALNET_043_ONLY');
}
export async function waitTransaction(config, id, maxAttempts = 90) {
  for(let i=0;i<maxAttempts;i++) {
    const tx = await rpc(config,'transactions.get',{transaction_id:id});
    if(!['New','Pending'].includes(tx.status)) return tx;
    await sleep(1000);
  }
  throw Object.assign(new Error('Transaction outcome is unknown. Refresh its status before retrying.'), {transactionId:id});
}
export async function quoteCall(config, body, variables = {}, imported = '', dependencies = []) {
  await verifyWallet(config);
  // Wallet manifest input discovery follows typed instruction addresses, not string
  // locators in our compatibility schema. Explicit read calls declare bounded pages.
  for(const [i,address] of dependencies.entries()){variables[`dependency${i}`]=address;body=`let dependency${i}=var!["dependency${i}"];dependency${i}.get_counts();${body}`;}
  const manifest = `${imported}\nfn fee_main(){let account=var!["account"];account.pay_fee(${MAX_FEE});}\nfn main(){${body}}`;
  const dry = await rpc(config,'transactions.submit_manifest',{manifest,variables:{account:config.account,...variables},max_fee:MAX_FEE,dry_run:true,seal_signer_key_id:null});
  const tx = await waitTransaction(config,dry.transaction_id);
  if(tx.status !== 'DryRun' || !tx.result?.result?.Accept) throw new Error('CHAIN_SIMULATION_REJECTED');
  const maxFee = (BigInt(dry.required_fees) + 10000n).toString();
  if(BigInt(maxFee)>BigInt(MAX_FEE)) throw new Error('FEE_LIMIT_EXCEEDED');
  return {instructions:tx.transaction.V1.body.transaction.instructions,maxFee,execution:tx.result.execution_results};
}
export async function submitCall(config, prepared) {
  return rpc(config,'transactions.submit_instruction',{instructions:prepared.instructions,fee_account:config.account,max_fee:prepared.maxFee,inputs:[],override_inputs:true,proof_ids:[]});
}
export function requireAccepted(tx) {
  if(tx.status !== 'Accepted' || !tx.result?.result?.Accept) throw new Error(`TRANSACTION_${tx.status.toUpperCase()}`);
  return tx;
}
export function createdComponents(tx) {return tx.result.result.Accept.up_substates.map(([id])=>id).filter(id=>COMPONENT.test(id));}
export async function callConfirmed(config, body, variables, imported) {
  const prepared = await quoteCall(config,body,variables,imported);
  const sent = await submitCall(config,prepared);
  return requireAccepted(await waitTransaction(config,sent.transaction_id));
}
export async function getSubstate(indexer, address, template, fallbackProviders = []) {
  if(!COMPONENT.test(address)) throw new Error('INVALID_COMPONENT');
  const expected = Array.isArray(template)?template:[template];
  for(const provider of [...new Set([indexer,...fallbackProviders])]) {
    let row;
    try {
      const response = await fetch(`${provider}/substates/${address}`, {signal:AbortSignal.timeout(fallbackProviders.length?12000:20000),redirect:'error'});
      if(!response.ok) continue;
      row = providerState(await response.json());
    } catch { continue; }
    // A second provider may supply a verified row during indexing/proof delays.
    // Never accept an unverified row, or widen the configured template allowlist.
    if(row?.verified!==true) continue;
    const c=row.substate?.Component, actual=c?.header?.template_address;
    if(typeof actual!=='string') continue;
    if(!expected.includes(actual.replace(/^template_/,'')))
      throw Object.assign(new Error('This address uses a different contract. Open the current forum from Home.'),{status:409});
    return row;
  }
  throw Object.assign(new Error('Tari could not provide verified board state. Retry syncing shortly; no transaction was sent by this read.'),{status:503});
}
export function tipRequest(config, destination, amount, maxFee, dryRun, selection='ConfidentialOnly',memo='A candle from Hauntboard') {
  return {owner_account:{ComponentAddress:config.account},resource_address:NATIVE,input_selection:selection,
    fee_params:{input_selection:selection,pay_fee_with_swap:null},transfers:[{destination_address:destination,blinded_output_amount:amount,revealed_output_amount:'0',output_memo:{Message:memo},pay_to:'StealthPublicKey',attach_sender_address:false}],max_fee:maxFee,dry_run:dryRun};
}
export async function quoteTip(config, destination, amount, selection='ConfidentialOnly',memo) {
  await verifyWallet(config);
  const request=tipRequest(config,destination,amount,MAX_FEE,true,selection,memo);
  const dry=await rpc(config,'accounts.stealth_transfer',request);
  const tx=await waitTransaction(config,dry.transaction_id);
  if(tx.status!=='DryRun'||!tx.result?.result?.Accept) throw new Error('PRIVATE_FUNDS_OR_FEE_UNAVAILABLE');
  const maxFee=(BigInt(tx.result.total_fees_required)+10000n).toString();
  if(BigInt(maxFee)>BigInt(MAX_FEE)) throw new Error('FEE_LIMIT_EXCEEDED');
  if(selection==='ConfidentialOnly') {
    const body=tx.transaction.V1.body.transaction;
    const statements=[...body.instructions,...body.fee_instructions].filter(i=>i.StealthTransfer).map(i=>i.StealthTransfer.statement);
    if(!statements.length || statements.some(s=>s.inputs_statement.revealed_amount!=='0')) throw new Error('PRIVATE_INPUTS_REQUIRED');
    const reveals=statements.map(s=>s.outputs_statement.revealed_output).filter(Boolean);
    if(reveals.length!==1 || !body.fee_instructions.some(i=>i.PayFeeFromBucket)) throw new Error('INVALID_PRIVATE_FEE');
  }
  return {...request,max_fee:maxFee,dry_run:false};
}
import {providerState} from '../web/provider-state.mjs';
