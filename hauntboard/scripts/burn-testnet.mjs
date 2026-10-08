// One bounded testnet conversion; persists intent before dispatch and never repeats an uncertain burn.
import {readFile,writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
process.umask(0o077);
const run=promisify(execFile),path='/private/minotari-burn.json';
const rpc=async(method,body={})=>JSON.parse((await run('/workspace/hauntboard/artifacts/grpcurl',['-plaintext','-import-path','/private/proto','-proto','wallet.proto','-d',JSON.stringify(body),'127.0.0.1:18143',`tari.rpc.Wallet/${method}`],{timeout:60000,maxBuffer:1048576})).stdout);
let old;try{old=JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
if(old){console.log(JSON.stringify({status:'EXISTING_BURN_REQUIRES_RECONCILIATION',transactionId:old.response?.transactionId,commitment:old.response?.commitment}));process.exit(0);}
const wallet=JSON.parse(await readFile('/private/esmeralda-deployment.json','utf8'));
assert.equal(wallet.network,'esmeralda');assert.match(wallet.publicKey,/^[a-f0-9]{64}$/);
const state=await rpc('GetState');assert.equal(state.network.status,'Online');assert.equal(state.hasDoneInitialValidation,true);assert(BigInt(state.balance.availableBalance??0)>=11000000n);
const request={amount:'10000000',feePerGram:'5',claimPublicKey:Buffer.from(wallet.publicKey,'hex').toString('base64')};
const journal={status:'prepared',network:'esmeralda',ownerPublicKey:wallet.publicKey,amountMicroXtm:request.amount,request,createdAt:new Date().toISOString()};
await writeFile(path,JSON.stringify(journal),{mode:0o600,flag:'wx'});
const response=await rpc('CreateBurnTransaction',request);journal.response=response;journal.status=response.isSuccess?'submitted':'rejected';await writeFile(path,JSON.stringify(journal),{mode:0o600});
assert.equal(response.isSuccess,true,response.failureMessage??'Burn rejected');
console.log(JSON.stringify({status:'TESTNET_BURN_SUBMITTED',network:'esmeralda',amountMicroXtm:request.amount,transactionId:response.transactionId,commitment:response.commitment,ownerPublicKey:wallet.publicKey,remainingDeploymentFeeBudgetMicrotari:'90000000'}));
