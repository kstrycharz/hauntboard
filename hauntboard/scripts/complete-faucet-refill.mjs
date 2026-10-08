// One finite deployment operation, not a recurring task. Keys remain in the private operator volume.
import {readFile,writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {faucetRefillProfile} from './faucet-refill-profile.mjs';
const profile=faucetRefillProfile(),run=promisify(execFile),start=Date.now();
for(;;){
 const journal=JSON.parse(await readFile('/private/esmeralda-deployment.json','utf8'));
 if(journal.stages[profile.depositStage]?.status==='confirmed'){console.log('PUBLIC_FAUCET_REFILL_ALREADY_CONFIRMED');break;}
 const claim=await run(process.execPath,['hauntboard/scripts/claim-testnet-burn.mjs','--faucet-funding',...profile.flags],{timeout:180000,maxBuffer:1048576});
 const status=JSON.parse(claim.stdout.trim().split('\n').at(-1));console.log(JSON.stringify(status));
 if(status.status==='ESMERALDA_BURN_CLAIM_CONFIRMED'){
  const deposit=await run(process.execPath,['hauntboard/scripts/fund-public-faucet.mjs',...profile.flags],{timeout:240000,maxBuffer:1048576});console.log(deposit.stdout);break;
 }
 if(!['BURN_CLAIM_WAITING_FOR_EPOCH','L1_PROOF_PENDING'].includes(status.status))throw new Error('Refill needs manual reconciliation; no blind retry.');
 if(Date.now()-start>90*60000){await writeFile(`hauntboard/evidence/${profile.evidence}-worker.json`,JSON.stringify({status:'WAITING_FOR_PUBLIC_NETWORK',last:status,checkedAt:new Date().toISOString()},null,2)+'\n');throw new Error('Public epoch progress exceeded bounded deployment wait; proof and journal preserved.');}
 await new Promise(resolve=>setTimeout(resolve,60000));
}
