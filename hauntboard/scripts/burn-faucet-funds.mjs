// Convert only existing faucet-origin Esmeralda XTM to refill the actual public faucet.
import {readFile,writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
import {faucetRefillProfile} from './faucet-refill-profile.mjs';
process.umask(0o077);
const profile=faucetRefillProfile(),run=promisify(execFile),file=profile.burnFile;
const rpc=async(method,body={})=>JSON.parse((await run('/workspace/hauntboard/artifacts/grpcurl',['-plaintext','-import-path','/private/proto','-proto','wallet.proto','-d',JSON.stringify(body),'127.0.0.1:18143',`tari.rpc.Wallet/${method}`],{timeout:60000,maxBuffer:1048576})).stdout);
let prior;try{prior=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
if(prior){console.log(JSON.stringify({status:'EXISTING_FAUCET_BURN_REQUIRES_RECONCILIATION',transactionId:prior.response?.transactionId,commitment:prior.response?.commitment}));process.exit(0);}
const wallet=JSON.parse(await readFile('/private/esmeralda-deployment.json','utf8'));
assert.equal(wallet.network,'esmeralda');assert.match(wallet.publicKey,/^[a-f0-9]{64}$/);
const state=await rpc('GetState');assert.equal(state.network.status,'Online');assert.equal(state.hasDoneInitialValidation,true);assert(BigInt(state.balance.availableBalance??0)>=BigInt(profile.amount)+1000000n);
const request={amount:String(profile.amount),feePerGram:'5',claimPublicKey:Buffer.from(wallet.publicKey,'hex').toString('base64')};
const journal={status:'prepared',network:'esmeralda',purpose:'Public testnet faucet refill for frontend 500-test-TARI claims',ownerPublicKey:wallet.publicKey,amountMicroXtm:request.amount,request,createdAt:new Date().toISOString()};
await writeFile(file,JSON.stringify(journal),{mode:0o600,flag:'wx'});
const response=await rpc('CreateBurnTransaction',request);journal.response=response;journal.status=response.isSuccess?'submitted':'rejected';await writeFile(file,JSON.stringify(journal),{mode:0o600});
assert.equal(response.isSuccess,true,response.failureMessage??'Burn rejected');
const report={status:'FAUCET_BURN_SUBMITTED',network:'esmeralda',amountMicroXtm:request.amount,transactionId:response.transactionId,commitment:response.commitment,ownerPublicKey:wallet.publicKey,checkedAt:new Date().toISOString()};
await writeFile(`hauntboard/evidence/${profile.evidence}-burn.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
