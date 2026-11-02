// Claims only the fresh wallet's journalled 10-test-XTM burn. No archived-wallet fallback.
import {readFile,writeFile,rename,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import * as sdk from '../artifacts/reset-sdk/bundle/wallet-sdk.mjs';
process.umask(0o077);
assert(process.argv.includes('--authorized-esmeralda-20-tari'),'Explicit testnet budget required');
const execute=process.argv.includes('--execute'),file='/private/esmeralda-deployment.json',journal=JSON.parse(await readFile(file,'utf8'));
const burn=JSON.parse(await readFile('/private/reset-funding.json','utf8'));
assert.equal(burn.status,'submitted');assert.equal(burn.ownerPublicKey,journal.publicKey);assert.equal(burn.resetIdentity,journal.resetIdentity);assert.equal(journal.budgetMicrotari,'20000000');
const save=async()=>{await writeFile(file+'.tmp',JSON.stringify(journal),{mode:0o600});await rename(file+'.tmp',file);};
const api=async(path,body)=>{const response=await fetch('https://ootle-indexer-a.tari.com/'+path,{...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(45000),redirect:'error'});const json=await response.json();if(!response.ok)throw Error(`${path}: ${response.status}`);return json;};
const decode=result=>typeof result==='string'?sdk.decodeExecuteResult(result):result;
const network=await api('network');assert.equal(network.network,'esmeralda');assert.equal(network.network_byte,38);
let entry=journal.stages['fund-claim'];
if(!entry){
 const files=[];
 for(const name of await readdir('/private/burn_proofs')){if(!name.startsWith(journal.publicKey+'-')||!name.endsWith('.json'))continue;const proof=JSON.parse(await readFile('/private/burn_proofs/'+name));if(proof.claim_proof?.value===10000000)files.push({name,proof});}
 if(!files.length){console.log(JSON.stringify({status:'FRESH_BURN_PROOF_PENDING',transactionId:burn.response.transactionId}));process.exit(0);}
 assert.equal(files.length,1,'Multiple burn proofs require review');
 const {name,proof}=files[0],stats=await api('epoch-manager/stats'),epoch=Math.min(stats.current_epoch,stats.consensus_epoch);
 if(epoch<=proof.mined_in_epoch){console.log(JSON.stringify({status:'FRESH_BURN_WAITING_FOR_EPOCH',burnEpoch:proof.mined_in_epoch,currentEpoch:epoch}));process.exit(0);}
 const prepare=(fee,dry)=>JSON.parse(execFileSync('/target/debug/hauntboard_reset_burn_claim',['/private/burn_proofs/'+name,String(fee),String(epoch+5),String(dry)],{encoding:'utf8'}));
 const dry=decode((await api('transactions/dry-run',{transaction:prepare(1000000,true).transaction})).result);assert(dry.finalize?.result?.Accept,JSON.stringify(dry.finalize?.result));
 const required=BigInt(dry.finalize.total_fees_required),fee=required+required/5n+10000n,reserved=Object.values(journal.stages).reduce((n,s)=>n+BigInt(s.maxFee),0n);
 assert(required>0n&&fee<1000000n&&reserved+fee+1000000n<=20000000n);
 if(!execute){console.log(JSON.stringify({status:'FRESH_BURN_CLAIM_SIMULATION_PASSED',maxFeeMicrotari:String(fee)}));process.exit(0);}
 const prepared=prepare(fee,false);entry=journal.stages['fund-claim']={id:prepared.transactionId,envelope:prepared.transaction,maxFee:String(fee),status:'prepared'};await save();
}
if(!execute){console.log(JSON.stringify({status:'EXISTING_CLAIM_REQUIRES_RECONCILIATION',id:entry.id}));process.exit(0);}
if(entry.status==='prepared'){entry.status='submitting';await save();const sent=await api('transactions',{transaction:entry.envelope});assert.equal(sent.transaction_id,entry.id);entry.status='submitted';await save();}
const result=await sdk.watchTransaction({getTransactionResult:id=>api(`transactions/${id}/result`)},entry.id,{timeoutMs:180000,pollIntervalMs:1500}),final=result.result.Finalized,execution=decode(final.execution_result);
assert.equal(final.final_decision,'Commit');assert(execution.finalize?.result?.Accept);
const account=execution.finalize.result.Accept.up_substates.find(([id])=>id.startsWith('component_'))?.[0];assert(account);
const row=await api('substates/'+account);assert.equal(row.verified,true);assert.equal(sdk.decodeSubstateValue(row.state.up.substate).Component.header.owner_rule.ByPublicKey,journal.publicKey);
journal.account=account;entry.status='confirmed';entry.actualFee=String(execution.finalize.total_fees_required);await save();
console.log(JSON.stringify({status:'FRESH_RESET_WALLET_FUNDED',account,transactionId:entry.id,actualFeeMicrotari:entry.actualFee}));
