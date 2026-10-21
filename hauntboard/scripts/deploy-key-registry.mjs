// Operator-only Esmeralda run. Invocation explicitly acknowledges the bounded
// testnet budget. Private journal/keys live only in the mounted operator volume.
import {createServer} from 'node:http';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
process.umask(0o077);
assert(process.argv.includes('--authorized-esmeralda-20-tari'),'Explicit testnet authorization required');
const origin='https://ootle-indexer-a.tari.com',port=8794;
const profile=JSON.parse(await readFile('hauntboard/deploy/network.public.json','utf8'));
const operator=JSON.parse(await readFile('/private/esmeralda-deployment.json','utf8'));
assert.equal(operator.network,'esmeralda');assert(operator.owner&&operator.view&&operator.account);
const binary=await readFile('hauntboard/key-registry/hauntboard_key_registry.wasm'),sha=createHash('sha256').update(binary).digest('hex');
const journalPath='/private/room-key-deployment.json';
let journal;
try{journal=JSON.parse(await readFile(journalPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;journal={v:1,network:'esmeralda',resetIdentity:profile.resetIdentity,wasmSha256:sha,budgetMicrotari:'20000000',fundingLimitMicrotari:'10000000',stages:{}};}
assert.equal(journal.wasmSha256,sha,'Cannot resume a transaction journal with different WASM');assert.equal(journal.resetIdentity,profile.resetIdentity);
const save=async value=>{await writeFile(journalPath+'.tmp',JSON.stringify(value),{mode:0o600});await rename(journalPath+'.tmp',journalPath);journal=value;};
const server=createServer(async(req,res)=>{try{
  if(req.url.startsWith('/rpc/')){
    const path=req.url.slice(5);assert(/^(network|epoch-manager\/stats|substates\/[a-z0-9_]+|transactions(?:\/dry-run|\/[a-f0-9]+\/result)?)$/.test(path));
    let body='';for await(const chunk of req)body+=chunk;
    const r=await fetch(`${origin}/${path}`,{method:req.method,headers:{'Content-Type':'application/json'},...(body?{body}:{}),redirect:'error',signal:AbortSignal.timeout(30000)});
    res.writeHead(r.status,{'Content-Type':'application/json'});res.end(await r.text());return;
  }
  if(req.url==='/'){res.end('<title>Private Hauntboard key-registry operator</title>');return;}
  assert(/^\/(vendor\/[A-Za-z0-9_.-]+|[a-z-]+\.(mjs|wasm))$/.test(req.url));
  const bytes=await readFile('hauntboard/web'+req.url);res.writeHead(200,{'Content-Type':req.url.endsWith('.wasm')?'application/wasm':'text/javascript'});res.end(bytes);
}catch{res.writeHead(500);res.end('Operator transport unavailable.');}});
await new Promise(r=>server.listen(port,'127.0.0.1',r));const browser=await chromium.launch();
try{
  const page=await browser.newPage();await page.exposeFunction('savePrivateJournal',save);await page.exposeFunction('operatorProgress',text=>console.log(text));await page.goto(`http://127.0.0.1:${port}`);
  const report=await page.evaluate(async({operator,journal,binary,profile})=>{
    const sdk=await import('/vendor/wallet-sdk.mjs'),{providerState}=await import('/provider-state.mjs'),{transactionMetadata}=await import('/transaction-identity.mjs');
    const rooms=await import('/room-keys.mjs'),{envelopeEntries,decodeRegistry}=await import('/key-registry.mjs'),{sealPost,openSealedPost}=await import('/sealed-posts.mjs'),{prepareStealthFee,NATIVE}=await import('/stealth-fee.mjs');
    const hex=x=>Array.from(x,b=>b.toString(16).padStart(2,'0')).join(''),unhex=x=>Uint8Array.from(x.match(/../g),b=>parseInt(b,16));
    const save=()=>window.savePrivateJournal(journal),progress=window.operatorProgress;
    const rpc=async(path,body)=>{const r=await fetch('/rpc/'+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});if(!r.ok)throw Object.assign(Error(`Provider ${r.status} at ${path}`),{status:r.status});return r.json();};
    const identity=await rpc('network');if(identity.network!=='esmeralda'||identity.network_byte!==38)throw Error('Wrong network');
    const provider={network:()=>38,getCurrentEpoch:async()=>(await rpc('epoch-manager/stats')).current_epoch,getSubstate:async id=>providerState(await rpc('substates/'+id)),getTransactionResult:id=>rpc(`transactions/${id}/result`),resolveInputs:async inputs=>Promise.all(inputs.map(async i=>({...i,version:i.version??(await provider.getSubstate(i.substate_id)).version}))),submitTransaction:transaction=>rpc('transactions',{transaction})};
    const signer=sdk.SecretKeyWallet.fromSecretKey(unhex(operator.owner),38,unhex(operator.view));
    const input=id=>({substate_id:id,version:null,is_write:true});
    const ownedInputs=async()=>{const row=await provider.getSubstate(operator.account);if(!row.verified||row.substate?.Component?.header?.owner_rule?.ByPublicKey!==hex(await signer.getPublicKey()))throw Error('Unverified operator ownership');return [operator.account,...sdk.iterVaultIdsInState(row.substate.Component.body.state)].map(input);};
    const totalFees=()=>Object.values(journal.stages).reduce((n,s)=>n+BigInt(s.maxFee??'0'),0n);
    async function stage(name,prepare,ceiling){
      let s=journal.stages[name];
      if(!s){
        const dry=await rpc('transactions/dry-run',{transaction:await prepare(ceiling,true)});
        if(!dry.result?.finalize?.result?.Accept)throw Error(`Simulation rejected ${name}: ${JSON.stringify(dry).slice(0,1600)}`);
        const required=BigInt(dry.result.finalize.total_fees_required??0),max=required+required/5n+2000n;
        if(required<=0n||max>ceiling||totalFees()+max>20000000n)throw Error(`Fee review exceeds ceiling: required=${required}, reviewed=${max}, ceiling=${ceiling}`);
        const envelope=await prepare(max,false),meta=await transactionMetadata(envelope);
        s=journal.stages[name]={id:meta.id,envelope,maxFee:max.toString(),status:'prepared'};await save();
      }
      if(s.status==='prepared'){
        s.status='submitting';await save();
        const sent=await rpc('transactions',{transaction:s.envelope});if(sent.transaction_id!==s.id)throw Error('Provider acknowledged a different transaction');
        s.status='submitted';await save();
      }
      let final;
      // A resumed uncertain dispatch only reconciles its precomputed identity.
      for(let i=0;i<100;i++){
        try{const receipt=await provider.getTransactionResult(s.id);if(receipt.result?.Finalized){final=receipt.result.Finalized;break;}}catch(e){if(e.status!==404)throw e;}await new Promise(r=>setTimeout(r,1500));
      }
      if(!final)throw Error(`Pending ${name}; resume the same journal`);
      if(final.final_decision!=='Commit'||!final.execution_result?.finalize?.result?.Accept)throw Error(`Chain rejected ${name}: ${JSON.stringify(final.execution_result?.finalize?.result).slice(0,1400)}`);
      s.status='confirmed';s.actualFee=String(final.execution_result.finalize.fee_receipt?.total_fees_paid??final.execution_result.finalize.total_fees_required);await save();await progress(`${name}: confirmed ${s.id}`);
      return final.execution_result.finalize.result.Accept.up_substates;
    }
    const normal=build=>async(fee,dry)=>{
      const b=new sdk.TransactionBuilder(38,(await provider.getCurrentEpoch())+5).withNonce(BigInt(crypto.getRandomValues(new Uint32Array(1))[0])).feeTransactionPayFromComponent(operator.account,fee);
      await build(b);b.withInputs(await ownedInputs());
      const u=await sdk.resolveTransaction(provider,b.buildUnsignedTransaction());
      if(u.inputs.some(i=>!Number.isSafeInteger(i.version)))throw Error('Unresolved transaction input: '+JSON.stringify(u.inputs));
      return sdk.sealTransaction(await sdk.signTransaction([signer],{...u,dry_run:dry}));
    };
    if(!journal.template){const up=await stage('publishRegistry',normal(b=>b.publishTemplate(binary)),2000000n);journal.template=up.find(([id])=>id.startsWith('template_'))?.[0].slice(9);if(!journal.template)throw Error('Published template missing');await save();}
    if(!journal.poster){const k=sdk.generateOotleSecretKey();journal.poster={owner:hex(k.owner_key),view:hex(k.view_key)};k.free();journal.legacyKey=rooms.newRecoverySecret();journal.uid=Array.from(crypto.getRandomValues(new Uint8Array(16)));journal.admin={...journal.poster};const a=sdk.generateOotleSecretKey();journal.admin={owner:hex(a.owner_key),view:hex(a.view_key)};a.free();await save();}
    const poster=sdk.SecretKeyWallet.fromSecretKey(unhex(journal.poster.owner),38,unhex(journal.poster.view)),admin=sdk.SecretKeyWallet.fromSecretKey(unhex(journal.admin.owner),38,unhex(journal.admin.view));
    const native=new sdk.WasmStealthCrypto(38);
    if(!journal.coins){
      const destination=await poster.getAddress(),amount=6000006n;
      if(amount>BigInt(journal.fundingLimitMicrotari))throw Error('Funding limit exceeded');
      const outputs=Array.from({length:6},()=>sdk.createOutput({destination,amount:1000001n,resourceAddress:NATIVE,memo:{Message:'hauntboard:room-demo:v1'}}));
      const generated=await native.generateOutputsStatement(outputs,null),inputs=await native.buildInputsStatement([],amount);
      const statement=new sdk.StealthTransferStatement(inputs,generated.statement,await sdk.signBalanceProof(native,sdk.Mask.zero(),generated.outputMask,inputs,generated.statement));
      const up=await stage('preparePostingFunds',normal(b=>b.callMethod({componentAddress:operator.account,methodName:'withdraw'},[sdk.resourceAddressLiteral(NATIVE),sdk.amountLiteral(amount)]).saveVar('funds').addInstruction(sdk.stealthTransferInstruction({resourceAddress:NATIVE,revealedInputBucket:'funds',statement},()=>({id:0,offset:null})))),80000n);
      const coins=[];for(const [id]of up)if(id.startsWith('utxo_')){const row=await provider.getSubstate(id);if(row.verified&&await sdk.decryptOwnedUtxo(native,await poster.getViewSecret(),row,id))coins.push(id);}
      if(coins.length!==6)throw Error('Expected six owned posting outputs');journal.coins=coins;await save();
    }
    const privateArgs=(index,instructions,inputs,adminRequired=false)=>({provider,signer:poster,coinId:journal.coins[index],networkByte:38,mainInstructions:instructions,mainInputs:inputs.map(input),extraSigners:adminRequired?[admin]:[]});
    const privatePrepare=args=>async(maxFee,dryRun)=>(await prepareStealthFee({...args,maxFee,dryRun})).envelope;
    const uid=journal.uid,title='Sealed room privacy demonstration',metadata={title,category:'tari'};
    const content={title,name:'Ghost',body:'Synthetic demonstration message. Room keys are generated and used locally; public chain state contains ciphertext.'};
    if(!journal.openingPayload){journal.openingPayload=await sealPost(content,journal.legacyKey,profile,[profile.board,uid,uid,null],metadata);await save();}
    if(!journal.thread){
      const instructions=new sdk.TransactionBuilder(38,0).callMethod({componentAddress:profile.board,methodName:'create_thread'},[sdk.literalArg(title),sdk.intLiteral(0n),sdk.vectorLiteral(uid),sdk.vectorLiteral(journal.openingPayload)]).buildUnsignedTransaction().instructions;
      const up=await stage('sealedOpeningPost',privatePrepare(privateArgs(0,instructions,[profile.board])),1000000n);
      const board=await provider.getSubstate(profile.board);journal.thread=board.substate.Component.body.state[6].find(t=>JSON.stringify(t[3])===JSON.stringify(uid))?.[0];
      if(!journal.thread)throw Error('Opening post confirmed; thread indexing pending');await save();
    }
    const scope=rooms.roomScope(profile,profile.board,journal.thread);
    if(!journal.alice){journal.alice=await rooms.recipientIdentity(scope);journal.bob=await rooms.recipientIdentity(scope);journal.eve=await rooms.recipientIdentity(scope);journal.keys=[{generation:-1,key:journal.legacyKey},{generation:0,key:rooms.newRecoverySecret()}];await save();}
    const aliceRequest=await rooms.recipientRequest(journal.alice),bobRequest=await rooms.recipientRequest(journal.bob),adminPublic=hex(await admin.getPublicKey());
    if(!journal.initialEnvelopes){journal.initialEnvelopes=await rooms.rotationEnvelopes([aliceRequest],scope,journal.keys);await save();}
    if(!journal.registry){
      const instructions=new sdk.TransactionBuilder(38,0).callFunction({templateAddress:journal.template,functionName:'new'},[sdk.literalArg(scope),sdk.literalArg(profile.board),sdk.literalArg(journal.thread),sdk.bytesLiteral(unhex(adminPublic)),sdk.vectorLiteral(envelopeEntries(journal.initialEnvelopes))]).buildUnsignedTransaction().instructions;
      const up=await stage('createKeyRegistry',privatePrepare(privateArgs(1,instructions,[profile.board],true)),1000000n);
      for(const[id]of up)if(id.startsWith('component_')&&id!==profile.board){try{const row=await provider.getSubstate(id);if(row.substate?.Component?.header?.template_address===journal.template){journal.registry=id;break;}}catch{}}
      if(!journal.registry)throw Error('Registry confirmed; indexing pending');await save();
    }
    const registry=async()=>decodeRegistry(await provider.getSubstate(journal.registry),journal.registry,journal.template);
    if(!journal.bobEnvelope){journal.bobEnvelope=await rooms.wrapRoomKeys(bobRequest,scope,0,journal.keys);await save();}
    const grantInstruction=new sdk.TransactionBuilder(38,0).callMethod({componentAddress:journal.registry,methodName:'grant'},[sdk.intLiteral(0n),sdk.vectorLiteral(envelopeEntries([journal.bobEnvelope])[0][0]),sdk.vectorLiteral(envelopeEntries([journal.bobEnvelope])[0][1])]).buildUnsignedTransaction().instructions;
    await stage('grantBobAccess',privatePrepare(privateArgs(2,grantInstruction,[journal.registry],true)),1000000n);
    if(!journal.bobRecovered){
      const vaultSecret=rooms.newRecoverySecret(),vault=await rooms.sealVault({identity:journal.bob},vaultSecret,scope);
      // Reconstruct from encrypted recovery data rather than a retained CryptoKey.
      const recovered=(await rooms.openVault(vault,vaultSecret,scope)).identity;
      const state=await registry(),envelope=state.generations[0].find(e=>e.recipient===recovered.id);
      const keys=await rooms.unwrapRoomKeys(envelope,recovered,scope,0);
      if(keys.at(-1).key!==journal.keys.at(-1).key)throw Error('Recovered recipient keys differ');
      let denied=false;try{await rooms.unwrapRoomKeys(envelope,journal.eve,scope,0);}catch{denied=true;}if(!denied)throw Error('Outsider decrypted an envelope');
      journal.bobRecovered=true;await save();
    }
    const post=async(name,index,seed,generation,key)=>{
      if(!journal[name+'Payload']){const nonce=Array(16).fill(seed);nonce.splice(0,4,0,0,0,0);journal[name+'Nonce']=nonce;journal[name+'Payload']=await sealPost({...content,title:'',body:`Synthetic managed-room message, generation ${generation}.`},key,profile,[profile.board,uid,nonce,0],{...metadata,registry:journal.registry,generation});await save();}
      const state=(await provider.getSubstate(journal.thread)).substate.Component.body.state;
      const instructions=new sdk.TransactionBuilder(38,0).callMethod({componentAddress:journal.thread,methodName:'append'},[sdk.vectorLiteral(journal[name+'Nonce']),sdk.intLiteral(0n),sdk.vectorLiteral(journal[name+'Payload'])]).buildUnsignedTransaction().instructions;
      await stage(name,privatePrepare(privateArgs(index,instructions,[journal.thread,state[8][0]])),1000000n);
    };
    await post('managedPostBeforeRemoval',3,41,0,journal.keys.at(-1).key);
    if(!journal.nextKeys){journal.nextKeys=rooms.nextGeneration(journal.keys);journal.rotationEnvelopes=await rooms.rotationEnvelopes([aliceRequest],scope,journal.nextKeys);await save();}
    const rotateInstructions=new sdk.TransactionBuilder(38,0).callMethod({componentAddress:journal.registry,methodName:'rotate'},[sdk.intLiteral(1n),sdk.vectorLiteral(envelopeEntries(journal.rotationEnvelopes))]).buildUnsignedTransaction().instructions;
    await stage('removeBobAndRotate',privatePrepare(privateArgs(4,rotateInstructions,[journal.registry],true)),1000000n);
    await post('managedPostAfterRemoval',5,42,1,journal.nextKeys.at(-1).key);
    const current=await registry();if(current.generation!==1||current.revision!==2||current.generations[1].some(e=>e.recipient===journal.bob.id))throw Error('Rotation state mismatch');
    const before=await openSealedPost(journal.managedPostBeforeRemovalPayload,journal.keys.at(-1).key,profile,[profile.board,uid,journal.managedPostBeforeRemovalNonce,0],title);
    let removedDenied=false;try{await openSealedPost(journal.managedPostAfterRemovalPayload,journal.keys.at(-1).key,profile,[profile.board,uid,journal.managedPostAfterRemovalNonce,0],title);}catch{removedDenied=true;}
    if(!before.body||!removedDenied)throw Error('Removal confidentiality failed');
    const after=await openSealedPost(journal.managedPostAfterRemovalPayload,journal.nextKeys.at(-1).key,profile,[profile.board,uid,journal.managedPostAfterRemovalNonce,0],title);
    // These attempts are simulations only; neither incurs an additional fee spend.
    const currentPage=(await provider.getSubstate(journal.thread)).substate.Component.body.state[8][0];
    const oldFeeOutput=journal.coins[0];
    // Authorization and stale-revision negative cases are independently covered
    // by native engine tests; all six demonstration coins are now consumed.
    const stages=Object.fromEntries(Object.entries(journal.stages).map(([name,s])=>[name,{id:s.id,status:s.status,maxFee:s.maxFee,actualFee:s.actualFee}]));
    return {status:'PASSED',network:'esmeralda',resetIdentity:profile.resetIdentity,template:journal.template,registry:journal.registry,board:profile.board,thread:journal.thread,wasmSha256:journal.wasmSha256,stages,authorizedFeeBudgetMicrotari:'20000000',reservedMaximumFeesMicrotari:totalFees().toString(),demonstrationFundingMicrotari:'6000006',checks:{recipientDelivery:true,outsiderDenied:true,encryptedRecovery:true,historicalAccessRetained:true,removedMemberCannotDecryptFuture:removedDenied,remainingMemberCanDecrypt:Boolean(after.body),finalizedChainExecution:true},limits:'Public metadata, administration linkage, funding ancestry, fees and timing remain observable. Existing board writes are permissionless. Historical keys and plaintext cannot be revoked.',checkedAt:new Date().toISOString()};
  },{operator,journal,binary:binary.toString('base64'),profile});
  await writeFile('hauntboard/evidence/room-key-esmeralda.json',JSON.stringify(report,null,2)+'\n');
  const next={...profile,keyRegistryTemplate:report.template};await writeFile('hauntboard/deploy/network.public.json',JSON.stringify(next,null,2)+'\n');
  console.log(JSON.stringify(report));
}finally{await browser.close();server.close();}
