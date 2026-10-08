import {readFile,writeFile,readdir,rename} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
import {faucetRefillProfile} from './faucet-refill-profile.mjs';
process.umask(0o077);
const run=promisify(execFile),origin='https://ootle-indexer-a.tari.com',file='/private/esmeralda-deployment.json';
const dryRunOnly=process.argv.includes('--dry-run-only');
const profile=faucetRefillProfile(),faucetFunding=process.argv.includes('--faucet-funding');
const stageName=faucetFunding?profile.claimStage:'burnClaim',expectedAmount=faucetFunding?profile.amount:10000000;
const evidenceFile=faucetFunding?`hauntboard/evidence/${profile.evidence}-burn-claim.json`:'hauntboard/evidence/esmeralda-burn-claim.json';
const journal=JSON.parse(await readFile(file,'utf8'));
const save=async()=>{await writeFile(`${file}.tmp`,JSON.stringify(journal),{mode:0o600});await rename(`${file}.tmp`,file);};
const api=async(path,body)=>{const r=await fetch(`${origin}/${path}`,{...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000),redirect:'error'});const result=await r.json();if(!r.ok)throw new Error(`Indexer ${r.status}: ${JSON.stringify(result).slice(0,500)}`);return result;};
const network=await api('network');assert.equal(network.network,'esmeralda');assert.equal(network.network_byte,38);
let stage=journal.stages[stageName];
if(dryRunOnly&&stage){console.log(JSON.stringify({status:'EXISTING_CLAIM_READ_ONLY',transactionId:stage.id,claimStatus:stage.status,transactionSubmitted:false}));process.exit(0);}
if(stage&&stage.status!=='confirmed'){
 const prior=(await api(`transactions/${stage.id}/result`)).result?.Finalized;
 if(prior?.final_decision?.Abort){
   const code=prior.execution_result?.finalize?.result?.Reject?.ExecutionFailure?.code;
   const paid=String(prior.execution_result?.finalize?.fee_receipt?.total_fees_paid??'unknown');
   assert.equal(code,'NotYetValid','Review this finalized rejection before any new claim');assert.equal(paid,'0');
   stage.status='aborted';stage.actualFee='0';journal.burnClaimAttempts??=[];
   if(!journal.burnClaimAttempts.some(x=>x.id===stage.id))journal.burnClaimAttempts.push({...stage});
   delete journal.stages[stageName];stage=null;await save();
 }else if(prior){assert.equal(prior.final_decision,'Commit','Unexpected finalized claim outcome');}
}
if(!stage){
 let files;try{files=(await readdir('/private/burn_proofs')).filter(f=>f.endsWith('.json'));}catch(e){if(e.code!=='ENOENT')throw e;files=[];}
 if(files.length===0){console.log(JSON.stringify({status:'L1_PROOF_PENDING',checkedAt:new Date().toISOString()}));process.exit(0);}
 files=(await Promise.all(files.map(async name=>({name,data:JSON.parse(await readFile(`/private/burn_proofs/${name}`,'utf8'))})))).filter(x=>Number(x.data.claim_proof?.value)===expectedAmount).map(x=>x.name);
 if(files.length===0){console.log(JSON.stringify({status:'L1_PROOF_PENDING',expectedAmountMicrotari:String(expectedAmount),checkedAt:new Date().toISOString()}));process.exit(0);}
 assert.equal(files.length,1,'Review multiple matching proof files before claiming');const proof=`/private/burn_proofs/${files[0]}`;
 const proofContents=JSON.parse(await readFile(proof,'utf8'));
 const witnesses=await Promise.all([origin,'https://ootle-indexer-b.tari.com'].map(async node=>{const r=await fetch(`${node}/epoch-manager/stats`,{signal:AbortSignal.timeout(20000),redirect:'error'});assert.equal(r.status,200);const stats=await r.json();assert(Number.isSafeInteger(stats.current_epoch)&&Number.isSafeInteger(stats.consensus_epoch));return {origin:node,currentEpoch:stats.current_epoch,consensusEpoch:stats.consensus_epoch};}));
 // The rejected receipt required the burned block to belong to an earlier execution epoch.
 // The submission provider must report consensus past the burn. Both nodes must
 // identify the new current epoch; the secondary's indexed checkpoint may lag.
 const epoch=Math.min(witnesses[0].consensusEpoch,...witnesses.map(w=>w.currentEpoch));
 const earliest=Number(proofContents.mined_in_epoch)+1;assert(Number.isSafeInteger(earliest));
 if(epoch<earliest&&!dryRunOnly){const report={status:'BURN_CLAIM_WAITING_FOR_EPOCH',checkedAt:new Date().toISOString(),network:'esmeralda',burnEpoch:proofContents.mined_in_epoch,currentEpoch:epoch,earliestRetryEpoch:earliest,previousClaimAttempts:(journal.burnClaimAttempts??[]).map(s=>({id:s.id,status:s.status,feesPaid:s.actualFee}))};await writeFile(evidenceFile,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));process.exit(0);}
 let declared=[];
 if(journal.account){const sdk=await import('../web/vendor/wallet-sdk.mjs');const account=await api(`substates/${journal.account}`);assert.equal(account.verified,true);assert.equal(account.substate.Component.header.owner_rule.ByPublicKey,journal.publicKey);declared=await Promise.all([journal.account,...sdk.iterVaultIdsInState(account.substate.Component.body.state)].map(async substate_id=>{const row=await api(`substates/${substate_id}`);assert.equal(row.verified,true);return {substate_id,version:row.version,is_write:true};}));}
 await writeFile('/private/burn-claim-inputs.json',JSON.stringify(declared),{mode:0o600});
 const prepare=async(fee,dry)=>JSON.parse((await run('/workspace/hauntboard/artifacts/native-burn-claim',[proof,String(fee),String(epoch+5),String(dry),String(expectedAmount),'/private/burn-claim-inputs.json'],{timeout:30000,maxBuffer:1048576})).stdout);
 const estimate=await prepare(1000000,true),dry=await api('transactions/dry-run',{transaction:estimate.transaction});
 if(dryRunOnly){const report={status:'BURN_CLAIM_SIMULATION_CHECKED',checkedAt:new Date().toISOString(),network:'esmeralda',burnEpoch:proofContents.mined_in_epoch,currentEpoch:epoch,earliestRetryEpoch:earliest,simulationAccepted:Boolean(dry.result?.finalize?.result?.Accept),simulationEpoch:dry.result?.execute_epoch,requiredFeesMicrotari:dry.result?.finalize?.total_fees_required,rejection:dry.result?.finalize?.result?.Reject??null,transactionSubmitted:false};await writeFile(faucetFunding?`hauntboard/evidence/${profile.evidence}-claim-preflight.json`:'hauntboard/evidence/esmeralda-claim-preflight.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));process.exit(0);}
 if(!dry.result?.finalize?.result?.Accept){const reason=dry.result?.finalize?.result?.Reject;await writeFile('/private/burn-claim-dry-run.json',JSON.stringify(dry),{mode:0o600});console.log(JSON.stringify({status:'BURN_CLAIM_NOT_ACCEPTED',reason,checkedAt:new Date().toISOString()}));process.exit(0);}
 const fee=BigInt(dry.result.finalize.total_fees_required)+1000n;assert(fee>0n&&fee<=1000000n);
 const final=await prepare(fee,false);stage=journal.stages[stageName]={envelope:final.transaction,id:final.transactionId,maxFee:fee.toString(),status:'prepared'};
 // Include the conversion principal and conservatively reserve one XTM for its L1 fee.
 journal.budgetMicrotari='89000000';await save();
}
if(stage.status==='prepared'){stage.status='dispatching';await save();const sent=await api('transactions',{transaction:stage.envelope});assert.equal(sent.transaction_id,stage.id);stage.status='submitted';await save();}
let result;
for(let i=0;i<90;i++){result=await api(`transactions/${stage.id}/result`);if(result.result?.Finalized)break;await new Promise(r=>setTimeout(r,1000));}
const final=result.result?.Finalized;
assert(final,'Claim confirmation pending; reconcile this exact transaction');
if(final.final_decision?.Abort){const code=final.execution_result.finalize.result?.Reject?.ExecutionFailure?.code;stage.status='aborted';stage.actualFee=String(final.execution_result.finalize.fee_receipt.total_fees_paid);await save();const report={status:'BURN_CLAIM_ABORTED',checkedAt:new Date().toISOString(),network:'esmeralda',transactionId:stage.id,code,feesPaid:stage.actualFee};await writeFile(evidenceFile,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));process.exit(0);}
assert.equal(final.final_decision,'Commit');const accepted=final.execution_result.finalize.result.Accept;assert(accepted);
// Depositing into the existing account can update only its vault. The component
// itself need not appear in up_substates; never infer a new account in that case.
const account=journal.account??accepted.up_substates.find(([id])=>id.startsWith('component_'))?.[0];assert(account);
const state=await api(`substates/${account}`);assert.equal(state.verified,true);assert.equal(state.substate.Component.header.owner_rule.ByPublicKey,journal.publicKey);
journal.account=account;stage.status='confirmed';stage.actualFee=String(final.execution_result.finalize.total_fees_required);await save();
const report={status:'ESMERALDA_BURN_CLAIM_CONFIRMED',checkedAt:new Date().toISOString(),network:'esmeralda',account,transactionId:stage.id,maxFee:stage.maxFee,actualFee:stage.actualFee};await writeFile(evidenceFile,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
