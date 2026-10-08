// Deposit faucet-origin funds into Tari's real Esmeralda faucet. No web-app signing keys.
import {createServer} from 'node:http';
import {readFile,writeFile,rename} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {faucetRefillProfile} from './faucet-refill-profile.mjs';
process.umask(0o077);
const file='/private/esmeralda-deployment.json',journal=JSON.parse(await readFile(file,'utf8'));
const profile=faucetRefillProfile();
assert.equal(journal.stages[profile.claimStage]?.status,'confirmed','Reconcile the actual faucet funding conversion first.');
const origin='https://ootle-indexer-a.tari.com';
const server=createServer(async(req,res)=>{try{
 if(req.url.startsWith('/rpc/')){const path=req.url.slice(5);assert(/^(network|epoch-manager\/stats|substates\/[a-z0-9_]+|transactions(?:\/dry-run|\/[a-f0-9]+\/result)?)$/.test(path));let body='';for await(const chunk of req)body+=chunk;const r=await fetch(`${origin}/${path}`,{method:req.method,headers:{'Content-Type':'application/json'},...(body?{body}:{}),signal:AbortSignal.timeout(60000),redirect:'error'});res.writeHead(r.status,{'Content-Type':'application/json'});res.end(await r.text());return;}
 if(req.url==='/'){res.end('<title>Private public-faucet funding</title>');return;}
 assert.equal(req.url,'/vendor/wallet-sdk.mjs');res.writeHead(200,{'Content-Type':'text/javascript'});res.end(await readFile('hauntboard/web/vendor/wallet-sdk.mjs'));
 }catch{res.writeHead(500);res.end('Operator request failed');}});
await new Promise(r=>server.listen(8797,'127.0.0.1',r));const browser=await chromium.launch();
try{
 const page=await browser.newPage();await page.exposeFunction('saveFaucetJournal',async value=>{await writeFile(`${file}.tmp`,JSON.stringify(value),{mode:0o600});await rename(`${file}.tmp`,file);});await page.goto('http://127.0.0.1:8797');
 const report=await page.evaluate(async ({journal,profile})=>{
 const sdk=await import('/vendor/wallet-sdk.mjs'),unhex=x=>Uint8Array.from(x.match(/../g),b=>parseInt(b,16)),NATIVE=`resource_${'01'.repeat(32)}`;
 const api=async(path,body)=>{const r=await fetch(`/rpc/${path}`,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});const j=await r.json();if(!r.ok)throw new Error(`Indexer ${r.status}`);return j;};
 const network=await api('network');if(network.network!=='esmeralda'||network.network_byte!==38)throw new Error('Wrong network');
 const provider={network:()=>38,getCurrentEpoch:async()=>(await api('epoch-manager/stats')).current_epoch,getSubstate:id=>api(`substates/${id}`),resolveInputs:async xs=>Promise.all(xs.map(async x=>({...x,version:x.version??(await api(`substates/${x.substate_id}`)).version}))),getTransactionResult:id=>api(`transactions/${id}/result`)};
 const signer=sdk.SecretKeyWallet.fromSecretKey(unhex(journal.owner),38,unhex(journal.view));
 let stage=journal.stages[profile.depositStage];
 if(!stage){
  const account=await provider.getSubstate(journal.account);if(!account.verified||account.substate.Component.header.owner_rule.ByPublicKey!==journal.publicKey)throw new Error('Unverified source account');
  const vaultIds=[...sdk.iterVaultIdsInState(account.substate.Component.body.state)];let balance=0n;
  for(const id of vaultIds){const row=await provider.getSubstate(id);if(!row.verified)throw new Error('Unverified source vault');const v=row.substate.Vault.resource_container.Stealth;if(v?.address===NATIVE)balance+=BigInt(v.revealed_amount);}
  if(balance<BigInt(profile.amount)+1000000n)throw new Error('Insufficient confirmed faucet-origin funds');
  const build=async fee=>new sdk.TransactionBuilder(38,(await provider.getCurrentEpoch())+5).withNonce(BigInt(crypto.getRandomValues(new Uint32Array(1))[0])).feeTransactionPayFromComponent(journal.account,fee).callMethod({componentAddress:journal.account,methodName:'withdraw'},[sdk.resourceAddressLiteral(NATIVE),sdk.amountLiteral(BigInt(profile.amount))]).saveVar('faucet-funds').callMethod({componentAddress:sdk.XTR_FAUCET_COMPONENT_ADDRESS,methodName:'deposit'},[{Workspace:'faucet-funds'}]).withInputs([journal.account,...vaultIds,sdk.XTR_FAUCET_COMPONENT_ADDRESS,sdk.XTR_FAUCET_VAULT_ADDRESS].map(substate_id=>({substate_id,version:null,is_write:true})));
  const estimate=await sdk.resolveTransaction(provider,(await build(1000000n)).buildUnsignedTransaction()),dry=await api('transactions/dry-run',{transaction:sdk.sealTransaction(await sdk.signTransaction([signer],{...estimate,dry_run:true}))});
  if(!dry.result?.finalize?.result?.Accept)throw new Error('Public faucet deposit fee check rejected');
  const required=BigInt(dry.result.finalize.total_fees_required??0),fee=required+(required+4n)/5n+1000n;if(required<=0n||fee>1000000n)throw new Error('Fee exceeds one-test-TARI ceiling');
  const reserved=Object.values(journal.stages).reduce((total,s)=>total+BigInt(s.maxFee??0),0n);if(reserved+fee>BigInt(journal.budgetMicrotari))throw new Error('Authorized fee budget exceeded');
  const transaction=await sdk.resolveTransaction(provider,(await build(fee)).buildUnsignedTransaction());stage=journal.stages[profile.depositStage]={status:'prepared',maxFee:fee.toString(),envelope:sdk.sealTransaction(await sdk.signTransaction([signer],transaction)),depositMicrotari:String(profile.amount)};await window.saveFaucetJournal(journal);
 }
 if(!stage.id){if(stage.status!=='prepared')throw new Error('Previous deposit outcome is uncertain; reconcile before retrying');stage.status='dispatching';await window.saveFaucetJournal(journal);const sent=await api('transactions',{transaction:stage.envelope});stage.id=sent.transaction_id;await window.saveFaucetJournal(journal);}
 const receipt=await sdk.watchTransaction(provider,stage.id,{timeoutMs:180000}),final=receipt.result?.Finalized;
 if(final?.final_decision!=='Commit'||!final.execution_result?.finalize?.result?.Accept)throw new Error('Public deposit outcome requires reconciliation');
 stage.status='confirmed';stage.actualFee=String(final.execution_result.finalize.total_fees_required);await window.saveFaucetJournal(journal);
 const state=await provider.getSubstate(sdk.XTR_FAUCET_VAULT_ADDRESS);if(!state.verified)throw new Error('Public faucet balance is not verified');
 return {status:'PUBLIC_ESMERALDA_FAUCET_FUNDED',transactionId:stage.id,depositMicrotari:stage.depositMicrotari,requiredFeeMicrotari:stage.actualFee,vault:sdk.XTR_FAUCET_VAULT_ADDRESS,verifiedBalanceMicrotari:state.substate.Vault.resource_container.Stealth.revealed_amount};
 },{journal,profile});
 report.checkedAt=new Date().toISOString();
 report.checks=await Promise.all(['https://ootle-indexer-a.tari.com','https://ootle-indexer-b.tari.com'].map(async node=>{
  const deadline=Date.now()+30000;
  while(Date.now()<deadline){
   try{const receipt=await(await fetch(`${node}/transactions/${report.transactionId}/result`,{signal:AbortSignal.timeout(5000),redirect:'error'})).json();
    if(receipt.result?.Finalized?.final_decision==='Commit'){const state=await(await fetch(`${node}/substates/${report.vault}`,{signal:AbortSignal.timeout(5000),redirect:'error'})).json();if(state.verified===true)return {node,decision:'Commit',verified:true,balanceMicrotari:state.substate.Vault.resource_container.Stealth.revealed_amount};}
   }catch{/* A witness read cannot change or repeat the confirmed deposit. */}
   await new Promise(resolve=>setTimeout(resolve,1000));
  }
  return {node,decision:'Witness confirmation pending'};
 }));
 await writeFile(`hauntboard/evidence/${profile.evidence}-refill.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser.close();server.close();}
