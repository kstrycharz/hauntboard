import {readFile,writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile),j=JSON.parse(await readFile('/private/minotari-burn.json','utf8'));
const rpc=async(method,body={})=>JSON.parse((await run('/workspace/hauntboard/artifacts/grpcurl',['-plaintext','-import-path','/private/proto','-proto','wallet.proto','-d',JSON.stringify(body),'127.0.0.1:18143',`tari.rpc.Wallet/${method}`],{timeout:20000,maxBuffer:1048576})).stdout);
const state=await rpc('GetState');
let proof;
try{proof=await rpc('GetBurnClaimProof',{commitment:j.response.commitment});await writeFile('/private/burn-grpc-proof.json',JSON.stringify(proof),{mode:0o600});}catch(e){console.log(JSON.stringify({status:'BURN_PROOF_PENDING',reason:String(e.stderr??e.message).slice(0,500),walletState:state}));process.exit(0);}
console.log(JSON.stringify({status:proof.burnOutputProof?'L1_BURN_PROOF_AVAILABLE':'BURN_PROOF_PENDING',transactionId:j.response.transactionId,hasProof:Boolean(proof.burnOutputProof),value:proof.value,minedInEpoch:proof.minedInEpoch,walletState:state}));
