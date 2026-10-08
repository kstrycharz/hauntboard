// Operator-only transfer to the human user's frontend wallet. Never publishes a post.
import {createServer} from 'node:http';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
process.umask(0o077);
const recipientIndex=process.argv.indexOf('--recipient');
const recipient=recipientIndex<0?undefined:process.argv[recipientIndex+1];
const checkOnly=process.argv.includes('--check-funding');
if(!checkOnly)assert(/^otl_esm_1[a-z0-9]{50,160}$/.test(recipient??''),'Supply the frontend wallet Esmeralda receive address.');
const operator=JSON.parse(await readFile('/private/esmeralda-deployment.json','utf8'));
assert(operator.account&&operator.owner&&operator.view,'Confirmed deployment wallet required.');
const journalFile=`/private/frontend-funding-${createHash('sha256').update(recipient??'balance-check').digest('hex')}.json`;
let journal;try{journal=JSON.parse(await readFile(journalFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const server=createServer(async(req,res)=>{try{
 if(req.url.startsWith('/rpc/')){
  const path=req.url.slice(5);assert(/^(network|epoch-manager\/stats|substates\/[a-z0-9_]+|transactions(?:\/dry-run|\/[a-f0-9]+\/result)?)$/.test(path));
  let body='';for await(const chunk of req)body+=chunk;
  const upstream=await fetch(`https://ootle-indexer-a.tari.com/${path}`,{method:req.method,headers:{'Content-Type':'application/json'},...(body?{body}:{}),redirect:'error',signal:AbortSignal.timeout(60000)});
  res.writeHead(upstream.status,{'Content-Type':'application/json'});res.end(await upstream.text());return;
 }
 if(req.url==='/'){res.end('<title>Private frontend funding operator</title>');return;}
 assert.equal(req.url,'/vendor/wallet-sdk.mjs');res.writeHead(200,{'Content-Type':'text/javascript'});res.end(await readFile('hauntboard/web/vendor/wallet-sdk.mjs'));
 }catch{res.writeHead(500);res.end('Funding operator request failed');}});
await new Promise(resolve=>server.listen(8799,'127.0.0.1',resolve));
const browser=await chromium.launch();
try{
 const page=await browser.newPage();
 await page.exposeFunction('saveFundingJournal',async value=>{await writeFile(`${journalFile}.tmp`,JSON.stringify(value),{mode:0o600});await rename(`${journalFile}.tmp`,journalFile);});
 await page.goto('http://127.0.0.1:8799');
 const report=await page.evaluate(async({operator,recipient,journal,checkOnly})=>{
  const sdk=await import('/vendor/wallet-sdk.mjs');
  const api=async(path,body)=>{const response=await fetch(`/rpc/${path}`,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});const value=await response.json();if(!response.ok)throw new Error(`Indexer request failed (${response.status})`);return value;};
  const network=await api('network');if(network.network!=='esmeralda'||network.network_byte!==38)throw new Error('Wrong network');
  const provider={network:()=>38,getCurrentEpoch:async()=>(await api('epoch-manager/stats')).current_epoch,getSubstate:id=>api(`substates/${id}`),resolveInputs:async xs=>Promise.all(xs.map(async x=>({...x,version:x.version??(await api(`substates/${x.substate_id}`)).version}))),getTransactionResult:id=>api(`transactions/${id}/result`)};
  const account=await provider.getSubstate(operator.account);if(!account.verified||account.substate.Component.header.owner_rule.ByPublicKey!==operator.publicKey)throw new Error('Unverified deployment account');
  const vaultIds=[...sdk.iterVaultIdsInState(account.substate.Component.body.state)],NATIVE=`resource_${'01'.repeat(32)}`;
  let balance=0n;for(const id of vaultIds){const row=await provider.getSubstate(id);if(!row.verified)throw new Error('Unverified balance');const value=row.substate.Vault.resource_container.Stealth;if(value?.address===NATIVE)balance+=BigInt(value.revealed_amount);}
  if(checkOnly)return {status:'FRONTEND_FUNDING_AVAILABLE',network:'esmeralda',availableMicrotari:balance.toString(),transferMicrotari:'1000000',outputCount:4,maximumFeeMicrotari:'1000000'};
  if(recipient===operator.address)throw new Error('Use the human frontend wallet, not the deployment wallet.');
  if(!journal){
   if(balance<2000000n)throw new Error('Insufficient operator test funds');
   const unhex=value=>Uint8Array.from(value.match(/../g),x=>parseInt(x,16)),signer=sdk.SecretKeyWallet.fromSecretKey(unhex(operator.owner),38,unhex(operator.view)),native=new sdk.WasmStealthCrypto(38);
   const outputs=Array.from({length:4},()=>sdk.createOutput({destination:recipient,amount:250000n,resourceAddress:NATIVE,memo:{Message:'hauntboard:frontend-funding:v1'}}));
   const generated=await native.generateOutputsStatement(outputs,null),inputs=await native.buildInputsStatement([],1000000n),statement=new sdk.StealthTransferStatement(inputs,generated.statement,await sdk.signBalanceProof(native,sdk.Mask.zero(),generated.outputMask,inputs,generated.statement));
   const build=async fee=>new sdk.TransactionBuilder(38,(await provider.getCurrentEpoch())+5).withNonce(BigInt(crypto.getRandomValues(new Uint32Array(1))[0])).feeTransactionPayFromComponent(operator.account,fee).callMethod({componentAddress:operator.account,methodName:'withdraw'},[sdk.resourceAddressLiteral(NATIVE),sdk.amountLiteral(1000000n)]).saveVar('frontend-funds').addInstruction(sdk.stealthTransferInstruction({resourceAddress:NATIVE,revealedInputBucket:'frontend-funds',statement},()=>({id:0,offset:null}))).withInputs([operator.account,...vaultIds].map(substate_id=>({substate_id,version:null,is_write:true})));
   const estimate=await sdk.resolveTransaction(provider,(await build(1000000n)).buildUnsignedTransaction()),dry=await api('transactions/dry-run',{transaction:sdk.sealTransaction(await sdk.signTransaction([signer],{...estimate,dry_run:true}))});
   if(!dry.result?.finalize?.result?.Accept)throw new Error('Network rejected the funding fee estimate; no transfer sent');
   const required=BigInt(dry.result.finalize.total_fees_required??0),fee=required+required/5n+10000n;if(required<=0n||fee>1000000n)throw new Error('Funding fee exceeds limit');
   const transaction=await sdk.resolveTransaction(provider,(await build(fee)).buildUnsignedTransaction());
   journal={recipient,envelope:sdk.sealTransaction(await sdk.signTransaction([signer],transaction)),maximumFeeMicrotari:fee.toString(),status:'prepared'};await window.saveFundingJournal(journal);
  }
  if(journal.recipient!==recipient)throw new Error('Recipient journal mismatch');
  if(!journal.id){
   if(journal.status!=='prepared')throw new Error('Previous transfer outcome is uncertain. Reconcile before another transfer.');
   journal.status='dispatching';await window.saveFundingJournal(journal);
   const sent=await api('transactions',{transaction:journal.envelope});journal.id=sent.transaction_id;await window.saveFundingJournal(journal);
  }
  const receipt=await sdk.watchTransaction(provider,journal.id,{timeoutMs:180000}),finalized=receipt.result?.Finalized;
  if(finalized?.final_decision!=='Commit'||!finalized.execution_result?.finalize?.result?.Accept)throw new Error('Funding transaction needs reconciliation');
  journal.status='confirmed';await window.saveFundingJournal(journal);
  return {status:'FRONTEND_WALLET_FUNDED',network:'esmeralda',recipient,transactionId:journal.id,transferMicrotari:'1000000',outputCount:4,maximumFeeMicrotari:journal.maximumFeeMicrotari,outputIds:finalized.execution_result.finalize.result.Accept.up_substates.filter(([id])=>id.startsWith('utxo_')).map(([id])=>id)};
 },{operator,recipient,journal,checkOnly});
 report.checkedAt=new Date().toISOString();await writeFile(`hauntboard/evidence/esmeralda-frontend-${checkOnly?'funding-check':'funding'}.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser.close();server.close();}
