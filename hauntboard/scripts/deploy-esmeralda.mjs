// Operator-only testnet deployment. SDK owns signing/encoding; journal precedes every dispatch.
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
process.umask(0o077);
const freshForums=process.argv.includes('--fresh-forums');
const ciRelease=process.argv.includes('--ci-release');
const releaseId=process.env.HAUNTBOARD_RELEASE_ID;
if(ciRelease)assert(/^[0-9]{1,24}$/.test(releaseId??''),'A GitHub run ID is required');
const newBoard=process.argv.includes('--new-board')||freshForums||ciRelease;
const root='/private',file=`${root}/${ciRelease?'esmeralda-ci-deployment':newBoard?'esmeralda-forums-deployment':'esmeralda-deployment'}.json`,origin='https://ootle-indexer-a.tari.com';
const walletOnly=process.argv.includes('--wallet-only');
const verifyPosting=process.argv.includes('--verify-posting');
await mkdir(root,{recursive:true,mode:0o700});
assert(!(newBoard&&(walletOnly||verifyPosting)),'New-board deployment does not create wallets or publish test posts');
let journal;try{journal=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;
 if(ciRelease){
  journal={network:'esmeralda',releaseId,budgetMicrotari:'5000000',stages:{}};
 }else if(freshForums){
  journal={network:'esmeralda',template:'f6773b90f8919097266a73e6c68e343724e2a4bdaf248f01e11b463bbc4e0b2d',legacyBoard:'component_ff8fd992a498d7c9b32e96fb8cb557029d2f96dbb033ae61932b45cbf9187a4b',budgetMicrotari:'1000000',stages:{}};
 }else if(newBoard){
  const retained=JSON.parse(await readFile(`${root}/esmeralda-deployment.json`,'utf8'));
  assert(retained.network==='esmeralda'&&retained.owner&&retained.view&&retained.account&&retained.template&&retained.board,'Retained deployment wallet is required');
  journal={network:'esmeralda',owner:retained.owner,view:retained.view,account:retained.account,template:retained.template,legacyBoard:retained.board,budgetMicrotari:'1000000',stages:{}};
 }else journal={network:'esmeralda',budgetMicrotari:'100000000',stages:{}};
}
const binary=await readFile('hauntboard/template-public/hauntboard_public.wasm');
const sha=createHash('sha256').update(binary).digest('hex');
if(ciRelease){
 const candidate=JSON.parse(await readFile('hauntboard/artifacts/public-contract-manifest.json','utf8'));
 assert.equal(candidate.wasm.sha256,sha);assert.equal(candidate.schema,4);assert.equal(candidate.engineEvidence.status,'PASSED');
 assert.equal(journal.releaseId,releaseId);assert(!journal.wasmSha256||journal.wasmSha256===sha,'Cannot resume a deployment with different WASM');
 journal.wasmSha256=sha;
 if(!journal.template&&sha==='75d3ab7a2e9265e1565ddd293aa651ae7a4e7687ccc1f148d371acc0c66d9582')journal.template='f6773b90f8919097266a73e6c68e343724e2a4bdaf248f01e11b463bbc4e0b2d';
}else assert.equal(sha,'75d3ab7a2e9265e1565ddd293aa651ae7a4e7687ccc1f148d371acc0c66d9582');
let faucetChecks=[];
const save=async value=>{if(journal.owner&&journal.owner!==value.owner){assert(!journal.account&&Object.keys(journal.stages).length===0,'A funded or pending wallet cannot be replaced');await writeFile(`${root}/esmeralda-pre-seed-wallet.json`,JSON.stringify(journal),{mode:0o600,flag:'wx'});}await writeFile(`${file}.tmp`,JSON.stringify(value),{mode:0o600});await rename(`${file}.tmp`,file);journal=value;};
const server=createServer(async(req,res)=>{try{
 if(req.url.startsWith('/rpc/')){const path=req.url.slice(5);assert(/^(network|epoch-manager\/stats|substates\/[a-z0-9_]+|transactions(?:\/dry-run|\/[a-f0-9]+\/result)?)$/.test(path));let body='';for await(const chunk of req)body+=chunk;const r=await fetch(`${origin}/${path}`,{method:req.method,headers:{'Content-Type':'application/json'},...(body?{body}:{}),signal:AbortSignal.timeout(60000),redirect:'error'});res.writeHead(r.status,{'Content-Type':'application/json'});res.end(await r.text());return;}
 if(req.url==='/'){res.end('<title>Private Esmeralda operator</title>');return;}
 assert(['/wallet-recovery.mjs','/wallet-recovery.wasm','/stealth-fee.mjs'].includes(req.url)||req.url.startsWith('/vendor/'));assert(!req.url.includes('..'));const bytes=await readFile(`hauntboard/web${req.url}`);res.writeHead(200,{'Content-Type':req.url.endsWith('.wasm')?'application/wasm':'text/javascript'});res.end(bytes);
 }catch(e){res.writeHead(500);res.end(String(e.message));}});
await new Promise(r=>server.listen(8798,'127.0.0.1',r));const browser=await chromium.launch();
try{
 if(!walletOnly&&!journal.account){faucetChecks=await Promise.all([origin,'https://ootle-indexer-b.tari.com'].map(async node=>{const r=await fetch(`${node}/substates/vault_0102030000000000000000000000000000000000000000000000000000000001`,{signal:AbortSignal.timeout(20000),redirect:'error'}),state=await r.json();assert.equal(r.status,200);assert.equal(state.verified,true);const balance=state.substate?.Vault?.resource_container?.Stealth?.revealed_amount;assert.match(balance,/^\d+$/);return {origin:node,verified:true,balanceMicrotari:balance};}));if(faucetChecks.some(c=>BigInt(c.balanceMicrotari)<1000000000n))throw new Error('PUBLIC_FAUCET_EMPTY: a claim requires 1,000 test TARI; both Tari-hosted nodes report insufficient faucet funds. No transaction submitted.');}
 const page=await browser.newPage();await page.exposeFunction('saveJournal',save);await page.goto('http://127.0.0.1:8798');
 const report=await page.evaluate(async({journal,binary,sha,walletOnly,verifyPosting,freshForums,ciRelease})=>{
 const sdk=await import('/vendor/wallet-sdk.mjs'),hex=x=>Array.from(x,b=>b.toString(16).padStart(2,'0')).join(''),unhex=x=>Uint8Array.from(x.match(/../g),b=>parseInt(b,16));
 const api=async(path,body)=>{const r=await fetch(`/rpc/${path}`,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});const j=await r.json();if(!r.ok)throw new Error(`Indexer ${r.status}: ${JSON.stringify(j).slice(0,900)}`);return j;};
 const identity=await api('network');if(identity.network!=='esmeralda'||identity.network_byte!==38)throw new Error('Wrong network');
 const provider={network:()=>38,getCurrentEpoch:async()=>(await api('epoch-manager/stats')).current_epoch,getSubstate:id=>api(`substates/${id}`),resolveInputs:async xs=>Promise.all(xs.map(async x=>({...x,version:x.version??(await api(`substates/${x.substate_id}`)).version}))),getTransactionResult:id=>api(`transactions/${id}/result`),submitTransaction:transaction=>api('transactions',{transaction})};
 if(freshForums||(ciRelease&&journal.template)){const template=await provider.getSubstate(`template_${journal.template}`);if(!template.verified)throw new Error('Published template is not verified');}
 if(walletOnly&&!journal.phrase&&!journal.account&&Object.keys(journal.stages).length===0){const recovery=await import('/wallet-recovery.mjs'),keys=await recovery.keysFromPhrase(await recovery.newPhrase(),{format:'native'});journal={...journal,phrase:keys.phrase,recoveryFormat:keys.recoveryFormat,owner:hex(keys.owner),view:hex(keys.view)};keys.owner.fill(0);keys.view.fill(0);await window.saveJournal(journal);}
 if(!journal.owner){const keys=sdk.generateOotleSecretKey();journal.owner=hex(keys.owner_key);journal.view=hex(keys.view_key);keys.free();await window.saveJournal(journal);}
 const signer=sdk.SecretKeyWallet.fromSecretKey(unhex(journal.owner),38,unhex(journal.view)),pub=hex(await signer.getPublicKey());
 journal.address=await signer.getAddress();journal.publicKey=pub;await window.saveJournal(journal);
 if(walletOnly){if(journal.phrase){const recovery=await import('/wallet-recovery.mjs'),keys=await recovery.keysFromPhrase(journal.phrase);try{const recovered=sdk.SecretKeyWallet.fromSecretKey(keys.owner,38,keys.view);if(await recovered.getAddress()!==journal.address)throw new Error('Seed recovery mismatch');}finally{keys.owner.fill(0);keys.view.fill(0);}}return {status:'ESMERALDA_WALLET_CREATED',network:'esmeralda',networkByte:38,address:journal.address,publicKey:pub,recoveryFormat:journal.recoveryFormat??'original-key-backup',seedRecoveryVerified:Boolean(journal.phrase),onChainAccount:journal.account??null,privateBackup:'hauntboard-esmeralda-operator:/private/esmeralda-deployment.json',checkedAt:new Date().toISOString()};}
 const input=id=>({substate_id:id,version:null,is_write:true}),nonce=()=>BigInt(crypto.getRandomValues(new Uint32Array(1))[0]);
 async function stage(name,build,ceiling){let s=journal.stages[name];if(!s){
   const b=await build(ceiling),u=await sdk.resolveTransaction(provider,b.buildUnsignedTransaction());
   const dry=await api('transactions/dry-run',{transaction:sdk.sealTransaction(await sdk.signTransaction([signer],{...u,dry_run:true}))});
   if(!dry.result?.finalize?.result?.Accept)throw new Error(`Simulation ${name}: ${JSON.stringify(dry).slice(0,1800)}`);
   const required=BigInt(dry.result.finalize.total_fees_required??0);if(required<=0n)throw new Error(`Missing estimate ${JSON.stringify(dry).slice(0,1800)}`);
   const fee=required+required/5n+10000n;if(fee>ceiling)throw new Error('Fee ceiling');
   const spent=Object.values(journal.stages).reduce((n,x)=>n+BigInt(x.maxFee),0n);if(spent+fee>BigInt(journal.budgetMicrotari))throw new Error('Budget exhausted');
   const final=await sdk.resolveTransaction(provider,(await build(fee)).buildUnsignedTransaction());
   s=journal.stages[name]={envelope:sdk.sealTransaction(await sdk.signTransaction([signer],final)),maxFee:fee.toString(),status:'prepared'};await window.saveJournal(journal);
 }
 if(!s.id){const sent=await api('transactions',{transaction:s.envelope});s.id=sent.transaction_id;await window.saveJournal(journal);}
 const receipt=await sdk.watchTransaction(provider,s.id,{timeoutMs:180000});const f=receipt.result?.Finalized;if(f?.final_decision!=='Commit'||!f.execution_result?.finalize?.result?.Accept)throw new Error(`Outcome requires reconciliation ${name}: ${JSON.stringify(receipt).slice(0,1800)}`);
 s.status='confirmed';s.actualFee=String(f.execution_result.finalize.total_fees_required);await window.saveJournal(journal);return f.execution_result.finalize.result.Accept.up_substates;
 }
 if(!journal.account){const up=await stage('fund',async fee=>new sdk.TransactionBuilder(38,(await provider.getCurrentEpoch())+5).withNonce(nonce()).withFeeInstructionsBuilder(f=>f.createAccount(pub).saveVar('account').callMethod({componentAddress:sdk.XTR_FAUCET_COMPONENT_ADDRESS,methodName:'take'},[{Workspace:'account'}]).callMethod({fromWorkspace:'account',methodName:'pay_fee'},[sdk.amountLiteral(fee)])).withInputs([sdk.XTR_FAUCET_COMPONENT_ADDRESS,sdk.XTR_FAUCET_VAULT_ADDRESS,sdk.XTR_FAUCET_CLAIM_RESOURCE_ADDRESS].map(input)),1000000n);journal.account=up.find(([id])=>id.startsWith('component_')&&id!==sdk.XTR_FAUCET_COMPONENT_ADDRESS)?.[0];if(!journal.account)throw new Error('Missing account');await window.saveJournal(journal);}
 const ownedInputs=async()=>{const s=await provider.getSubstate(journal.account);if(!s.verified)throw new Error('Unverified account');return [journal.account,...sdk.iterVaultIdsInState(s.substate.Component.body.state)].map(input);};
 if(!journal.template){const up=await stage('publish',async fee=>new sdk.TransactionBuilder(38,(await provider.getCurrentEpoch())+5).withNonce(nonce()).feeTransactionPayFromComponent(journal.account,fee).publishTemplate(binary).withInputs(await ownedInputs()),5000000n);journal.template=up.find(([id])=>id.startsWith('template_'))?.[0].slice(9);if(!journal.template)throw new Error('Missing template');await window.saveJournal(journal);}
 if(!journal.board){const up=await stage('board',async fee=>new sdk.TransactionBuilder(38,(await provider.getCurrentEpoch())+5).withNonce(nonce()).feeTransactionPayFromComponent(journal.account,fee).callFunction({templateAddress:journal.template,functionName:'new'},[sdk.literalArg('Hauntboard Forums')]).withInputs(await ownedInputs()),1000000n);journal.board=up.find(([id])=>id.startsWith('component_')&&id!==journal.account)?.[0];if(!journal.board)throw new Error('Missing board');await window.saveJournal(journal);}
 const row=await provider.getSubstate(journal.board);if(!row.verified||row.substate.Component.body.state[0]!==4)throw new Error('Unverified schema');
 if(freshForums){
  await stage('returnUnused',async fee=>new sdk.TransactionBuilder(38,(await provider.getCurrentEpoch())+5).withNonce(nonce()).feeTransactionPayFromComponent(journal.account,fee)
   .callMethod({componentAddress:journal.account,methodName:'withdraw'},[sdk.resourceAddressLiteral(`resource_${'01'.repeat(32)}`),sdk.amountLiteral(999000000n)]).saveVar('unused')
   .callMethod({componentAddress:sdk.XTR_FAUCET_COMPONENT_ADDRESS,methodName:'deposit'},[{Workspace:'unused'}])
   .withInputs([...await ownedInputs(),input(sdk.XTR_FAUCET_COMPONENT_ADDRESS),input(sdk.XTR_FAUCET_VAULT_ADDRESS)]),100000n);
 }
 if(ciRelease){
  let available=0n;
  for(const i of await ownedInputs()){if(i.substate_id.startsWith('vault_')){const v=await provider.getSubstate(i.substate_id);if(!v.verified)throw new Error('Unverified operator vault');const c=v.substate?.Vault?.resource_container?.Stealth;if(c?.address===`resource_${'01'.repeat(32)}`)available+=BigInt(c.revealed_amount);}}
  await stage('returnUnused',async fee=>new sdk.TransactionBuilder(38,(await provider.getCurrentEpoch())+5).withNonce(nonce()).feeTransactionPayFromComponent(journal.account,fee)
   .callMethod({componentAddress:journal.account,methodName:'withdraw'},[sdk.resourceAddressLiteral(`resource_${'01'.repeat(32)}`),sdk.amountLiteral(available-fee)]).saveVar('unused')
   .callMethod({componentAddress:sdk.XTR_FAUCET_COMPONENT_ADDRESS,methodName:'deposit'},[{Workspace:'unused'}])
   .withInputs([...await ownedInputs(),input(sdk.XTR_FAUCET_COMPONENT_ADDRESS),input(sdk.XTR_FAUCET_VAULT_ADDRESS)]),100000n);
 }
 if(verifyPosting){
   const recovery=await import('/wallet-recovery.mjs'),NATIVE=`resource_${'01'.repeat(32)}`;
   if(!journal.poster){const keys=await recovery.keysFromPhrase(await recovery.newPhrase(),{format:'native'});journal.poster={phrase:keys.phrase,owner:hex(keys.owner),view:hex(keys.view)};keys.owner.fill(0);keys.view.fill(0);await window.saveJournal(journal);}
   const poster=sdk.SecretKeyWallet.fromSecretKey(unhex(journal.poster.owner),38,unhex(journal.poster.view)),address=await poster.getAddress(),native=new sdk.WasmStealthCrypto(38);
   if(!journal.poster.coins){const outputs=Array.from({length:2},()=>sdk.createOutput({destination:address,amount:1500000n,resourceAddress:NATIVE,memo:{Message:'hauntboard:public-verification:v1'}}));
     const generated=await native.generateOutputsStatement(outputs,null),inputs=await native.buildInputsStatement([],3000000n),statement=new sdk.StealthTransferStatement(inputs,generated.statement,await sdk.signBalanceProof(native,sdk.Mask.zero(),generated.outputMask,inputs,generated.statement));
     const up=await stage('postingFunds',async fee=>new sdk.TransactionBuilder(38,(await provider.getCurrentEpoch())+5).withNonce(nonce()).feeTransactionPayFromComponent(journal.account,fee).callMethod({componentAddress:journal.account,methodName:'withdraw'},[sdk.resourceAddressLiteral(NATIVE),sdk.amountLiteral(3000000n)]).saveVar('posting-funds').addInstruction(sdk.stealthTransferInstruction({resourceAddress:NATIVE,revealedInputBucket:'posting-funds',statement},()=>({id:0,offset:null}))).withInputs(await ownedInputs()),1000000n);
     const coins=[];for(const [id] of up){if(id.startsWith('utxo_')){const state=await provider.getSubstate(id);if(state.verified&&await sdk.decryptOwnedUtxo(native,await poster.getViewSecret(),state,id))coins.push(id);}}if(coins.length!==2)throw new Error('Native incoming output verification failed');journal.poster.coins=coins;await window.saveJournal(journal);
   }
   let s=journal.stages.privatePost;
   if(!s){const {prepareStealthFee}=await import('/stealth-fee.mjs');const uid=crypto.getRandomValues(new Uint8Array(16)),payload=new TextEncoder().encode('Public Esmeralda deployment verification. This post used a native stealth fee input and no persistent poster-owner signature.');
     const b=new sdk.TransactionBuilder(38,0).callMethod({componentAddress:journal.board,methodName:'create_thread'},[sdk.literalArg('Esmeralda launch verification'),sdk.intLiteral(0n),sdk.vectorLiteral(uid),sdk.vectorLiteral(payload)]);
     const args={provider,signer:poster,coinId:journal.poster.coins[0],networkByte:38,mainInstructions:b.buildUnsignedTransaction().instructions,mainInputs:[input(journal.board)]};
     const dry=await api('transactions/dry-run',{transaction:(await prepareStealthFee({...args,maxFee:1000000n,dryRun:true})).envelope});if(!dry.result?.finalize?.result?.Accept)throw new Error(`Native post dry run: ${JSON.stringify(dry).slice(0,1200)}`);
     const paid=BigInt(dry.result.finalize.fee_receipt.total_fees_paid)-BigInt(dry.result.finalize.fee_receipt.total_fee_overcharge??0),fee=paid+(paid+4n)/5n+1000n;
     const ready=await prepareStealthFee({...args,maxFee:fee});if(ready.transaction.inputs.some(i=>i.substate_id===journal.account))throw new Error('Named operator input in private post');
     const posterKey=hex(await poster.getPublicKey());if(JSON.stringify(ready.transaction).includes(posterKey))throw new Error('Persistent poster key in native post');
     s=journal.stages.privatePost={envelope:ready.envelope,maxFee:fee.toString(),status:'prepared',coinId:args.coinId,transaction:ready.transaction};await window.saveJournal(journal);
   }
   if(!s.id){const sent=await api('transactions',{transaction:s.envelope});s.id=sent.transaction_id;await window.saveJournal(journal);}
   const receipt=await sdk.watchTransaction(provider,s.id,{timeoutMs:180000}),f=receipt.result?.Finalized;if(f?.final_decision!=='Commit'||!f.execution_result?.finalize?.result?.Accept)throw new Error(`Private post requires reconciliation: ${JSON.stringify(receipt).slice(0,1500)}`);
   s.status='confirmed';s.actualFee=String(f.execution_result.finalize.fee_receipt.total_fees_paid);journal.poster.thread=f.execution_result.finalize.result.Accept.up_substates.find(([id])=>id.startsWith('component_')&&id!==journal.board)?.[0];
   const thread=await provider.getSubstate(journal.poster.thread);if(!thread.verified||thread.substate.Component.header.owner_rule!=='None')throw new Error('Unverified public thread');await window.saveJournal(journal);
 }
 return {status:'ESMERALDA_CONTRACT_DEPLOYED',network:'esmeralda',board:journal.board,template:journal.template,wasmSha256:sha,transactions:Object.fromEntries(Object.entries(journal.stages).map(([k,v])=>[k,{id:v.id,maxFee:v.maxFee,actualFee:v.actualFee}]))};
 },{journal,binary:binary.toString('base64'),sha,walletOnly,verifyPosting,freshForums,ciRelease});
 await writeFile(`hauntboard/evidence/${ciRelease?'esmeralda-ci-contract':newBoard?'esmeralda-forums-contract':walletOnly?'esmeralda-wallet':'esmeralda-contract'}.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}catch(error){await writeFile('hauntboard/evidence/esmeralda-contract.json',JSON.stringify({status:'PUBLIC_DEPLOYMENT_BLOCKED',checkedAt:new Date().toISOString(),network:'esmeralda',wasmSha256:sha,reason:String(error.message).slice(0,2200),faucetChecks,submittedTransactions:Object.values(journal.stages).filter(s=>s.id).map(s=>s.id),feesSpentMicrotari:Object.values(journal.stages).filter(s=>s.status==='confirmed').reduce((n,s)=>n+BigInt(s.actualFee),0n).toString()},null,2)+'\n');throw error;}finally{await browser.close();server.close();}
