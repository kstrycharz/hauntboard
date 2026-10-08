import {readFile,writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {faucetRefillProfile} from './faucet-refill-profile.mjs';
const profile=faucetRefillProfile(),run=promisify(execFile),journal=JSON.parse(await readFile(profile.burnFile,'utf8'));
const rpc=async(method,body={})=>JSON.parse((await run('/workspace/hauntboard/artifacts/grpcurl',['-plaintext','-import-path','/private/proto','-proto','wallet.proto','-d',JSON.stringify(body),'127.0.0.1:18143',`tari.rpc.Wallet/${method}`],{timeout:30000,maxBuffer:1048576})).stdout);
let report;try{const proof=await rpc('GetBurnClaimProof',{commitment:journal.response.commitment});report={status:proof.burnOutputProof?'FAUCET_BURN_PROOF_AVAILABLE':'FAUCET_BURN_PROOF_PENDING',transactionId:journal.response.transactionId,value:proof.value,minedInEpoch:proof.minedInEpoch};}catch{report={status:'FAUCET_BURN_PROOF_PENDING',transactionId:journal.response.transactionId};}
report.checkedAt=new Date().toISOString();await writeFile(`hauntboard/evidence/${profile.evidence}-burn-proof.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
