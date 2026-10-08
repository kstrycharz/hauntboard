// Return unused faucet-origin validation funds. Participant wallets are never accessed.
import {readFile,writeFile,rename} from 'node:fs/promises';
import assert from 'node:assert/strict';
import * as sdk from '../web/vendor/wallet-sdk.mjs';
process.umask(0o077);
const privateFile='/private/esmeralda-deployment.json',sourceFile='/private/frontend-faucet-validation.json';
const operator=JSON.parse(await readFile(privateFile,'utf8')),source=JSON.parse(await readFile(sourceFile,'utf8'));
const save=async()=>{await writeFile(`${privateFile}.tmp`,JSON.stringify(operator),{mode:0o600});await rename(`${privateFile}.tmp`,privateFile);};
const origin='https://ootle-indexer-a.tari.com',NATIVE=`resource_${'01'.repeat(32)}`;
const api=async(path,body)=>{const r=await fetch(`${origin}/${path}`,{...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000),redirect:'error'});const j=await r.json();if(!r.ok)throw new Error(`Provider returned ${r.status}`);return j;};
const provider={network:()=>38,getCurrentEpoch:async()=>(await api('epoch-manager/stats')).current_epoch,getSubstate:id=>api(`substates/${id}`),getStealthUtxo:async(resource,commitment)=>api(`substates/${sdk.stealthUtxoSubstateId(resource,commitment)}`),resolveInputs:async xs=>Promise.all(xs.map(async x=>({...x,version:x.version??(await api(`substates/${x.substate_id}`)).version}))),getTransactionResult:id=>api(`transactions/${id}/result`)};
try{
 const network=await api('network');assert.equal(network.network,'esmeralda');assert.equal(network.network_byte,38);
 let stage=operator.stages.faucetValidationRecycle;
 if(!stage){
  assert(source.result&&source.phrase&&!source.recycled,'Retained confirmed validation wallet required.');
  const entropy=sdk.mnemonicToEntropy(source.phrase,sdk.recoveryWordlist);
  const {default:initNative}=await import('../web/vendor/wallet-recovery-glue.mjs');
  const native=await initNative({module_or_path:await readFile('hauntboard/web/wallet-recovery.wasm')});
  let owner,view;try{new Uint8Array(native.memory.buffer,native.seed_buffer(),32).set(entropy);native.derive_keys();const keys=new Uint8Array(native.memory.buffer,native.key_buffer(),64);owner=new Uint8Array(keys.subarray(0,32));view=new Uint8Array(keys.subarray(32));}finally{entropy.fill(0);native.clear_buffers();}
  // The SDK retains its key buffers; clear only the temporary adapter buffers.
  const validation=sdk.SecretKeyWallet.fromSecretKey(new Uint8Array(owner),38,new Uint8Array(view));owner.fill(0);view.fill(0);assert.equal(await validation.getAddress(),source.address);
  const unhex=x=>Uint8Array.from(x.match(/../g),b=>parseInt(b,16)),funding=sdk.SecretKeyWallet.fromSecretKey(unhex(operator.owner),38,unhex(operator.view));
  const account=await provider.getSubstate(operator.account);assert.equal(account.verified,true);assert.equal(account.substate.Component.header.owner_rule.ByPublicKey,operator.publicKey);
  const vaultIds=[...sdk.iterVaultIdsInState(account.substate.Component.body.state)];let balance=0n;
  for(const id of vaultIds){const row=await provider.getSubstate(id);assert.equal(row.verified,true);const v=row.substate.Vault.resource_container.Stealth;if(v?.address===NATIVE)balance+=BigInt(v.revealed_amount);}
  assert(balance>=3000000n,'Reserve one TARI above the fixed two-TARI contribution.');
  // Older receipts may be pruned. The retained encrypted wallet identifies the
  // outputs; each still requires current verified chain state and ownership.
  const record=source.storage.origins.flatMap(o=>o.indexedDB??[]).filter(d=>d.name==='hauntboard-browser-wallet-v1').flatMap(d=>d.stores).filter(s=>s.name==='wallet').flatMap(s=>s.records).map(r=>r.value).find(v=>v.walletAddress===source.address);
  assert(record?.v===2&&record.network==='esmeralda'&&record.networkByte===38);
  const passwordKey=await globalThis.crypto.subtle.importKey('raw',new TextEncoder().encode(source.password),'PBKDF2',false,['deriveKey']);
  const key=await globalThis.crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',iterations:600000,salt:Uint8Array.from(record.salt)},passwordKey,{name:'AES-GCM',length:256},false,['decrypt']);
  const aad=new TextEncoder().encode(`hauntboard-browser-wallet-v1|${record.network}:${record.resetIdentity}|${record.networkByte}|${record.walletAddress}`);
  const plain=new Uint8Array(await globalThis.crypto.subtle.decrypt({name:'AES-GCM',iv:Uint8Array.from(record.iv),additionalData:aad},key,Uint8Array.from(record.ct)));
  let material;try{material=JSON.parse(new TextDecoder().decode(plain));}finally{plain.fill(0);}assert.equal(material.address,source.address);
  const ids=material.coins.filter(c=>c.state==='ready').map(c=>c.id);assert.equal(new Set(ids).size,ids.length);
  const crypto=new sdk.WasmStealthCrypto(38),owned=[];let total=0n;
  for(const id of ids){const row=await provider.getSubstate(id);assert.equal(row.verified,true);const coin=await sdk.decryptOwnedUtxo(crypto,await validation.getViewSecret(),row,id);if(coin){owned.push({id,row,input:new sdk.StealthInput(sdk.commitmentOf(id))});total+=coin.value;}}
  assert.equal(total,500000000n);assert.equal(owned.length,4);
  const build=async(fee,dryRun)=>{
   const ephemeral=sdk.EphemeralKeySigner.generate(38),receiver=await ephemeral.getPublicKey();
   const change=sdk.createOutput({destination:source.address,amount:1000000n,resourceAddress:NATIVE,memo:{Message:'hauntboard:faucet:v1'}});
   const outputs=await crypto.generateOutputsStatement([change],{amount:499000000n,receiver}),inputs=await crypto.buildInputsStatement(owned.map(x=>x.input),0n),statement=new sdk.StealthTransferStatement(inputs,outputs.statement);
   const builder=new sdk.TransactionBuilder(38,(await provider.getCurrentEpoch())+5).withNonce(BigInt(globalThis.crypto.getRandomValues(new Uint32Array(1))[0])).feeTransactionPayFromComponent(operator.account,fee)
    .addInstruction(sdk.stealthTransferInstruction({resourceAddress:NATIVE,revealedInputBucket:null,statement},()=>{throw new Error('Unexpected revealed input');})).saveVar('recycled')
    .callMethod({componentAddress:sdk.XTR_FAUCET_COMPONENT_ADDRESS,methodName:'deposit'},[{Workspace:'recycled'}])
    .callMethod({componentAddress:operator.account,methodName:'withdraw'},[sdk.resourceAddressLiteral(NATIVE),sdk.amountLiteral(2000000n)]).saveVar('reserve')
    .callMethod({componentAddress:sdk.XTR_FAUCET_COMPONENT_ADDRESS,methodName:'deposit'},[{Workspace:'reserve'}])
    .withInputs([...owned.map(x=>({substate_id:x.id,version:x.row.version,is_write:true})),...[operator.account,...vaultIds,sdk.XTR_FAUCET_COMPONENT_ADDRESS,sdk.XTR_FAUCET_VAULT_ADDRESS].map(substate_id=>({substate_id,version:null,is_write:true}))]);
   const unsignedTx=await sdk.resolveTransaction(provider,builder.buildUnsignedTransaction());unsignedTx.dry_run=dryRun;
   const wallet=new sdk.OotleWallet().registerKeyProvider(source.address,validation).setDefaultSigner(source.address);
   const spec={unsignedTx,statement,outputMask:outputs.outputMask,state:{resource:NATIVE,revealedInput:null,inputsToSpend:new Map(owned.map(x=>[x.id,{input:x.input,owner:source.address}])),outputs:[change],revealedOutput:{amount:499000000n,receiver}},requiredSigners:[],inputs:owned.map(x=>({input:x.input,owner:source.address}))};
   const authorized=await sdk.WalletStealthAuthorizer.fromSpec(wallet,spec,{crypto,mustSignWithAccountKey:false}).prepare(provider);
   const transaction=authorized.getSpec().unsignedTx;
   for(const signer of [funding,ephemeral])for(const signature of await signer.signTransaction(transaction,authorized.getSealPublicKey()))authorized.addSignature(signature);
   return await authorized.seal();
  };
  const dry=await api('transactions/dry-run',{transaction:await build(1000000n,true)});
  if(!dry.result?.finalize?.result?.Accept){await writeFile('/private/faucet-recycle-preflight.json',JSON.stringify(dry),{mode:0o600});throw new Error('Native recycle preflight rejected');}
  const required=BigInt(dry.result.finalize.total_fees_required),fee=required+(required+4n)/5n+1000n;assert(required>0n&&fee<=1000000n);
  if(process.argv.includes('--dry-run-only')){console.log(JSON.stringify({status:'VALIDATION_RECYCLE_PREFLIGHT_ACCEPTED',requiredFeeMicrotari:String(required),recycledMicrotari:'499000000',operatorContributionMicrotari:'2000000',totalDepositMicrotari:'501000000',validationRetainedMicrotari:'1000000',transactionSubmitted:false}));process.exit(0);}
  const reserved=Object.values(operator.stages).reduce((n,s)=>n+BigInt(s.maxFee??0),0n);assert(reserved+fee+2000000n<=BigInt(operator.budgetMicrotari));
  stage=operator.stages.faucetValidationRecycle={status:'prepared',maxFee:String(fee),envelope:await build(fee,false),depositMicrotari:'501000000'};await save();
 }
 if(!stage.id){assert.equal(stage.status,'prepared','Uncertain dispatch must be reconciled first.');stage.status='dispatching';await save();const sent=await api('transactions',{transaction:stage.envelope});stage.id=sent.transaction_id;await save();}
 const result=await sdk.watchTransaction(provider,stage.id,{timeoutMs:180000});assert.equal(result.result?.Finalized?.final_decision,'Commit');assert(result.result.Finalized.execution_result.finalize.result.Accept);
 stage.status='confirmed';stage.actualFee=String(result.result.Finalized.execution_result.finalize.total_fees_required);await save();
 source.recycled={transactionId:stage.id,retainedMicrotari:'1000000',checkedAt:new Date().toISOString()};await writeFile(sourceFile,JSON.stringify(source),{mode:0o600});
 const faucet=await provider.getSubstate(sdk.XTR_FAUCET_VAULT_ADDRESS);assert.equal(faucet.verified,true);
 const report={status:'PUBLIC_FAUCET_IMMEDIATE_RECYCLE_CONFIRMED',transactionId:stage.id,depositMicrotari:'501000000',verifiedBalanceMicrotari:faucet.substate.Vault.resource_container.Stealth.revealed_amount,requiredFeeMicrotari:stage.actualFee,checkedAt:new Date().toISOString(),scope:'499 unused validation test TARI returned plus 2 operator test TARI; validation retains 1 test TARI and its recovery. No participant keys used and no public posts.'};
 await writeFile('hauntboard/evidence/esmeralda-faucet-immediate-recycle.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}catch(error){await writeFile('/private/faucet-recycle-error.txt',String(error.stack??error),{mode:0o600});throw new Error(`Faucet recycle failed (${error.name}); details preserved privately.`);}
