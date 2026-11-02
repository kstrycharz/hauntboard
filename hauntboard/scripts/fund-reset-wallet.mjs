// One bounded L1 testnet conversion into the new reset's deployment wallet.
import {readFile,writeFile,rename} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
process.umask(0o077);
assert(process.argv.includes('--authorized-esmeralda-20-tari'),'Explicit deployment budget required');
const run=promisify(execFile),file='/private/reset-funding.json';
const rpc=async(method,body={})=>JSON.parse((await run('/workspace/hauntboard/artifacts/grpcurl',['-plaintext','-import-path','/private/proto','-proto','wallet.proto','-d',JSON.stringify(body),'127.0.0.1:18143',`tari.rpc.Wallet/${method}`],{timeout:60000,maxBuffer:1048576})).stdout);
let prior;try{prior=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
if(prior){console.log(JSON.stringify({status:'EXISTING_BURN_REQUIRES_RECONCILIATION',transactionId:prior.response?.transactionId,commitment:prior.response?.commitment}));process.exit(0);}
const wallet=JSON.parse(await readFile('/private/esmeralda-deployment.json','utf8'));
assert.equal(wallet.network,'esmeralda');assert.equal(wallet.resetIdentity,'esmeralda-reset-2026-11-02');assert.match(wallet.publicKey,/^[a-f0-9]{64}$/);
const state=await rpc('GetState');assert.equal(state.network.status,'Online');
if(!state.hasDoneInitialValidation){console.log(JSON.stringify({status:'L1_WALLET_SYNCING',scannedHeight:state.scannedHeight,availableBalanceMicroXtm:state.balance.availableBalance}));process.exit(0);}
if(BigInt(state.balance.availableBalance??0)<11000000n){console.log(JSON.stringify({status:'FRESH_L1_FUNDING_REQUIRED',availableBalanceMicroXtm:state.balance.availableBalance??'0',requiredBalanceMicroXtm:'11000000'}));process.exit(0);}
const request={amount:'10000000',feePerGram:'5',claimPublicKey:Buffer.from(wallet.publicKey,'hex').toString('base64')};
const journal={status:'prepared',network:'esmeralda',resetIdentity:wallet.resetIdentity,ownerPublicKey:wallet.publicKey,amountMicroXtm:request.amount,request,createdAt:new Date().toISOString()};
await writeFile(file,JSON.stringify(journal),{mode:0o600,flag:'wx'});
const response=await rpc('CreateBurnTransaction',request);journal.response=response;journal.status=response.isSuccess?'submitted':'rejected';await writeFile(file+'.tmp',JSON.stringify(journal),{mode:0o600});await rename(file+'.tmp',file);
assert.equal(response.isSuccess,true,response.failureMessage??'Burn rejected');
console.log(JSON.stringify({status:'RESET_WALLET_BURN_SUBMITTED',amountMicroXtm:request.amount,transactionId:response.transactionId,commitment:response.commitment,ownerPublicKey:wallet.publicKey}));
