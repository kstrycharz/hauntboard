// Container-only reset deployment. Keep /private in a dedicated, retained volume.
import {createServer} from 'node:http';
import {readFile,writeFile,rename,mkdir,open,unlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {chromium} from '@playwright/test';
process.umask(0o077);
const option=name=>process.argv.find(x=>x.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const resetIdentity=option('reset-identity');
assert(/^esmeralda-[a-z0-9-]{1,80}$/.test(resetIdentity??''),'Explicit reset identity required');
const execute=process.argv.includes('--execute'),budget=option('budget-microtari')??'20000000';
assert(/^\d+$/.test(budget)&&BigInt(budget)>0n&&BigInt(budget)<=20000000n,'Maximum authorized budget is 20 test TARI');
const path='/private/esmeralda-deployment.json',origin='https://ootle-indexer-a.tari.com';
const lock=await open('/private/reset-deployment.lock','wx',0o600);
try {
let journal=JSON.parse(await readFile(path,'utf8'));
assert(journal.owner&&journal.view&&journal.address,'Expected the deployment wallet');
const accountResult=spawnSync('/target/debug/reset-account-address',[journal.publicKey],{encoding:'utf8'});
assert.equal(accountResult.status,0,accountResult.stderr);
const derivedAccount=accountResult.stdout.trim();assert.match(derivedAccount,/^component_[a-f0-9]{64}$/);
assert(!journal.resetIdentity||journal.resetIdentity===resetIdentity,'Private journal belongs to another reset');
journal.resetIdentity=resetIdentity;journal.budgetMicrotari=budget;
const binaries=Object.fromEntries(await Promise.all([
 ['board','hauntboard/template-public/hauntboard_public.wasm'],
 ['registry','hauntboard/key-registry/hauntboard_key_registry.wasm'],
].map(async([name,file])=>{const bytes=await readFile(file);return [name,{base64:bytes.toString('base64'),sha256:createHash('sha256').update(bytes).digest('hex'),size:bytes.length}];})));
const hashes=Object.fromEntries(Object.entries(binaries).map(([k,v])=>[k,v.sha256]));
if(journal.binaryHashes&&JSON.stringify(journal.binaryHashes)!==JSON.stringify(hashes)){
 assert(process.argv.includes('--replace-incompatible-templates'),'Cannot resume with different contract binaries without explicitly replacing incompatible templates');
 assert(!journal.board&&!journal.stages['create-board'],'Cannot replace templates after board creation has started');
 assert(journal.stages['publish-board']?.status==='confirmed'&&journal.stages['publish-registry']?.status==='confirmed','Reconcile previous publications before replacing them');
 journal.supersededDeployments??=[];
 journal.supersededDeployments.push({template:journal.template,keyRegistryTemplate:journal.keyRegistryTemplate,binaryHashes:journal.binaryHashes,reason:'Pre-reset template ABI omits CreateComponentArg.upgrade_rule'});
 for(const name of ['board','registry']){journal.stages[`superseded-publish-${name}-${journal.binaryHashes[name].slice(0,12)}`]=journal.stages[`publish-${name}`];delete journal.stages[`publish-${name}`];}
 delete journal.template;delete journal.keyRegistryTemplate;
}
journal.binaryHashes=hashes;
const save=async value=>{await writeFile(path+'.tmp',JSON.stringify(value),{mode:0o600});await rename(path+'.tmp',path);journal=value;};
await save(journal);
const server=createServer(async(req,res)=>{try{
 if(req.url.startsWith('/rpc/')){
  const route=req.url.slice(5);assert(/^(network|info|epoch-manager\/stats|substates\/[a-z0-9_]+|transactions(?:\/dry-run|\/[a-f0-9]+\/result)?)$/.test(route));
  let body='';for await(const chunk of req)body+=chunk;
  const response=await fetch(`${origin}/${route}`,{method:req.method,headers:{'Content-Type':'application/json'},...(body?{body}:{}),redirect:'error',signal:AbortSignal.timeout(45000)});
  res.writeHead(response.status,{'Content-Type':'application/json'});res.end(await response.text());return;
 }
 if(req.url==='/'){res.end('<title>Private reset deployment</title>');return;}
 const file=req.url==='/sdk.mjs'?'hauntboard/artifacts/reset-sdk/bundle/wallet-sdk.mjs':req.url==='/transaction-identity.mjs'?'hauntboard/web/transaction-identity.mjs':req.url==='/transaction-identity.wasm'?'hauntboard/web/transaction-identity.wasm':null;
 assert(file);res.setHeader('Content-Type',file.endsWith('.wasm')?'application/wasm':'text/javascript');res.end(await readFile(file));
 }catch(e){res.writeHead(500);res.end(e.message);}});
await new Promise(resolve=>server.listen(8797,'127.0.0.1',resolve));
const browser=await chromium.launch();
try{
 const page=await browser.newPage();await page.exposeFunction('saveJournal',save);await page.exposeFunction('progress',message=>console.log(message));
 await page.exposeFunction('transactionId',envelope=>{const result=spawnSync('/target/debug/reset-transaction-id',[],{input:envelope,encoding:'utf8',maxBuffer:1048576});assert.equal(result.status,0,result.stderr);const id=result.stdout.trim();assert.match(id,/^[a-f0-9]{64}$/);return id;});
 await page.goto('http://127.0.0.1:8797');
 const report=await page.evaluate(async({journal,binaries,execute,derivedAccount})=>{
  const sdk=await import('/sdk.mjs'),unhex=s=>Uint8Array.from(s.match(/../g),v=>parseInt(v,16));
  const api=async(route,body)=>{const response=await fetch('/rpc/'+route,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});const value=await response.json();if(!response.ok)throw Error(`${route}: ${response.status} ${JSON.stringify(value).slice(0,500)}`);return value;};
  const state=async id=>{const row=await api('substates/'+id);if(row.verified!==true||!row.state?.up?.substate)throw Error('Unverified or down substate '+id);return {...row,substate:typeof row.state.up.substate==='string'?sdk.decodeSubstateValue(row.state.up.substate):row.state.up.substate};};
  const provider={network:()=>38,getCurrentEpoch:async()=>(await api('network')).epoch,getSubstate:id=>api('substates/'+id),resolveInputs:async inputs=>Promise.all(inputs.map(async i=>({...i,version:i.version??(await state(i.substate_id)).version}))),getTransactionResult:id=>api(`transactions/${id}/result`)};
  const identity=await api('network'),info=await api('info');if(identity.network!=='esmeralda'||identity.network_byte!==38)throw Error('Wrong network');
  const signer=sdk.SecretKeyWallet.fromSecretKey(unhex(journal.owner),38,unhex(journal.view));
  async function assertAddress(){if(await signer.getAddress()!==journal.address)throw Error('Wallet identity mismatch');}
  await assertAddress();
  const vault=await state(sdk.XTR_FAUCET_VAULT_ADDRESS),balance=vault.substate.Vault.resource_container.Stealth.revealed_amount;
  const report={checkedAt:new Date().toISOString(),network:'esmeralda',resetIdentity:journal.resetIdentity,providerRuntimeVersion:info.version,sdkVersion:'0.12.0',wasmVersion:'0.49.1',address:journal.address,budgetMicrotari:journal.budgetMicrotari,binaries:Object.fromEntries(Object.entries(binaries).map(([k,v])=>[k,{sha256:v.sha256,size:v.size}])),faucetBalanceMicrotari:balance,transactions:{}};
  const input=id=>({substate_id:id,version:null,is_write:true}),nonce=()=>BigInt(crypto.getRandomValues(new Uint32Array(1))[0]);
  const owned=async()=>{const row=await state(journal.account);if(row.substate.Component.header.owner_rule.ByPublicKey!==journal.publicKey)throw Error('Operator ownership mismatch');return [journal.account,...sdk.iterVaultIdsInState(row.substate.Component.body.state)].map(input);};
  const decodeResult=r=>typeof r==='string'?sdk.decodeExecuteResult(r):r;
  async function stage(name,build,ceiling){
   let entry=journal.stages[name];
   if(!entry){
    const unsigned=await sdk.resolveTransaction(provider,(await build(ceiling)).buildUnsignedTransaction());
    const dry=decodeResult((await api('transactions/dry-run',{transaction:sdk.sealTransaction(await sdk.signTransaction([signer],{...unsigned,dry_run:true}))})).result);
    if(!dry.finalize?.result?.Accept)throw Error(`Simulation ${name} rejected: ${JSON.stringify(dry.finalize?.result?.AcceptFeeRejectRest?.[1]??dry.finalize?.result?.Reject??dry).slice(0,1000)}`);
    const required=BigInt(dry.finalize.total_fees_required),fee=required+required/5n+10000n;
    const reserved=Object.values(journal.stages).reduce((n,s)=>n+BigInt(s.maxFee),0n);
    // Reserve one test TARI for L1 conversion fees as well as the L2 fees.
    if(required<=0n||fee>ceiling||reserved+fee+1000000n>BigInt(journal.budgetMicrotari))throw Error('Fee budget exceeded');
    if(!execute)return {simulationOnly:true,requiredFeeMicrotari:required.toString(),maxFeeMicrotari:fee.toString()};
    const tx=await sdk.resolveTransaction(provider,(await build(fee)).buildUnsignedTransaction()),envelope=sdk.sealTransaction(await sdk.signTransaction([signer],tx));
    // Native transaction hashing is pinned to the transaction protocol used here.
    const id=await window.transactionId(envelope);
    entry=journal.stages[name]={id,envelope,maxFee:fee.toString(),status:'prepared'};await window.saveJournal(journal);
   }
   if(!execute)return {simulationOnly:true,id:entry.id,status:entry.status,maxFeeMicrotari:entry.maxFee};
   if(entry.status==='prepared'){entry.status='submitting';await window.saveJournal(journal);const sent=await api('transactions',{transaction:entry.envelope});if(sent.transaction_id!==entry.id)throw Error('Transaction acknowledgement mismatch');entry.status='submitted';await window.saveJournal(journal);}
   const result=await sdk.watchTransaction(provider,entry.id,{timeoutMs:180000,pollIntervalMs:1500}),final=result.result.Finalized,execution=decodeResult(final.execution_result);
   if(final.final_decision!=='Commit'||!execution.finalize?.result?.Accept)throw Error('Outcome requires reconciliation: '+entry.id);
   entry.status='confirmed';entry.actualFee=String(execution.finalize.total_fees_required);await window.saveJournal(journal);await window.progress(`${name} finalized: ${entry.id}`);
   return execution.finalize.result.Accept.up_substates;
  }
  if(!journal.account){
   const response=await fetch('/rpc/substates/'+derivedAccount);
   if(response.ok){const row=await state(derivedAccount);if(row.substate.Component.header.owner_rule.ByPublicKey!==journal.publicKey)throw Error('Funding account ownership mismatch');journal.account=derivedAccount;await window.saveJournal(journal);}
   else if(response.status!==404)throw Error('Cannot check received deployment funds');
  }
  if(!journal.account){
   if(BigInt(balance)<1000000000n){report.status='FUNDING_REQUIRED';report.reason='Built-in faucet has less than its 1,000 test TARI claim. No funding transaction submitted.';return report;}
   const up=await stage('fund',async fee=>new sdk.TransactionBuilder(38,(await provider.getCurrentEpoch())+5).withNonce(nonce()).withFeeInstructionsBuilder(f=>f.createAccount(journal.publicKey).saveVar('account').callMethod({componentAddress:sdk.XTR_FAUCET_COMPONENT_ADDRESS,methodName:'take'},[{Workspace:'account'}]).callMethod({fromWorkspace:'account',methodName:'pay_fee'},[sdk.amountLiteral(fee)])).withInputs([sdk.XTR_FAUCET_COMPONENT_ADDRESS,sdk.XTR_FAUCET_VAULT_ADDRESS,sdk.XTR_FAUCET_CLAIM_RESOURCE_ADDRESS].map(input)),1000000n);
   if(!execute){report.status='FUNDING_SIMULATION_PASSED';report.funding=up;return report;}
   journal.account=up.find(([id])=>id.startsWith('component_')&&id!==sdk.XTR_FAUCET_COMPONENT_ADDRESS)?.[0];if(!journal.account)throw Error('Missing funded account');await window.saveJournal(journal);
  }
  for(const [name,key] of [['board','template'],['registry','keyRegistryTemplate']]){
   if(!journal[key]){const up=await stage('publish-'+name,async fee=>new sdk.TransactionBuilder(38,(await provider.getCurrentEpoch())+5).withNonce(nonce()).feeTransactionPayFromComponent(journal.account,fee).publishTemplate(binaries[name].base64).withInputs(await owned()),name==='board'?5000000n:3000000n);if(!execute){report.status='PUBLICATION_SIMULATION_PASSED';report[name]=up;return report;}journal[key]=up.find(([id])=>id.startsWith('template_'))?.[0].slice(9);if(!journal[key])throw Error('Missing template');await window.saveJournal(journal);}
  }
  if(!journal.board){const up=await stage('create-board',async fee=>new sdk.TransactionBuilder(38,(await provider.getCurrentEpoch())+5).withNonce(nonce()).feeTransactionPayFromComponent(journal.account,fee).callFunction({templateAddress:journal.template,functionName:'new'},[sdk.literalArg('Hauntboard Forums')]).withInputs(await owned()),1000000n);if(!execute){report.status='BOARD_SIMULATION_PASSED';return report;}journal.board=up.find(([id])=>id.startsWith('component_')&&id!==journal.account)?.[0];await window.saveJournal(journal);}
  const board=await state(journal.board);if(board.substate.Component.body.state[0]!==4)throw Error('Unexpected board schema');
  return {...report,status:'RESET_DEPLOYED',board:journal.board,template:journal.template,keyRegistryTemplate:journal.keyRegistryTemplate,transactions:Object.fromEntries(Object.entries(journal.stages).map(([k,s])=>[k,{id:s.id,status:s.status,maxFee:s.maxFee,actualFee:s.actualFee}]))};
 },{journal,binaries,execute,derivedAccount});
 await mkdir('hauntboard/evidence',{recursive:true});await writeFile(`hauntboard/evidence/redeployment-${resetIdentity}.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
 if(report.status==='RESET_DEPLOYED'){
  const current=JSON.parse(await readFile('hauntboard/deploy/network.public.json','utf8'));
  const candidate={...current,resetIdentity,instance:`hauntboard-${resetIdentity}`,board:report.board,template:report.template,keyRegistryTemplate:report.keyRegistryTemplate,providerRuntimeVersion:report.providerRuntimeVersion,legacyBoards:[],legacyTemplates:[],compatibilityVerified:false,posterPrivacyVerified:false};
  await writeFile(`hauntboard/deploy/network.${resetIdentity}.json`,JSON.stringify(candidate,null,2)+'\n');
 }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
}finally{await lock.close();await unlink('/private/reset-deployment.lock');}
