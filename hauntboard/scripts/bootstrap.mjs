// Real localnet only. Never points at a public network or uses an existing Hauntbox wallet.
import {chromium} from '@playwright/test';
import {readFile,writeFile,mkdir,open,unlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {openLocalWallet} from './local-wallet.mjs';
import {localNetworkWitness} from '../../scripts/lib/local-network-witness.mjs';
import {rpc,verifyWallet,atomicJson,waitTransaction,requireAccepted,quoteCall,submitCall,createdComponents,quoteTip,getSubstate,NATIVE} from '../lib/chain.mjs';
process.umask(0o077);
const browser=await chromium.launch();
const wallets=[];
const journalPath='/private/hauntboard-bootstrap-v3.json';
let lock,journal;
const evidence={network:'localnet',walletVersion:'0.43.0',checks:{},transactions:[]};
async function save(){await atomicJson(journalPath,journal);}
async function stage(name,submit){
  let step=journal.stages[name];
  if(!step){
    step=journal.stages[name]={status:'submitting'};await save();
    const sent=await submit();step.tx=sent.transaction_id;await save();
  }
  if(!step.tx)throw new Error(`Uncertain ${name}: reconcile wallet history before repeating.`);
  const result=requireAccepted(await waitTransaction(journal.wallets.sender,step.tx));
  step.status='confirmed';await save();
  evidence.transactions.push({name,id:step.tx,fee:result.result.fee_receipt.total_fees_paid});
  return result;
}
try{
  await mkdir('/private',{recursive:true});
  lock=await open('/private/hauntboard-bootstrap.lock','wx');
  let witness;
  for(let attempt=0;attempt<30;attempt++){
    try{witness=await localNetworkWitness();break;}catch(e){if(attempt===29||!['NETWORK_UNAVAILABLE','fetch failed','LOCAL_INSTANCE_MISMATCH'].includes(e.code??e.message))throw e;await new Promise(resolve=>setTimeout(resolve,1000));}
  }
  try{journal=JSON.parse(await readFile(journalPath,'utf8'));assert.equal(journal.instance,witness.instance);}catch(e){if(e.code!=='ENOENT')throw e;journal={instance:witness.instance,stages:{},wallets:{}};}
  if(!journal.legacyBoards){
    journal.legacyBoards=[];journal.legacyTemplates=[];
    try{const previous=JSON.parse(await readFile('/private/hauntboard-bootstrap-v2.json','utf8'));if(previous.instance===witness.instance&&previous.board&&previous.template){journal.legacyBoards.push(previous.board);journal.legacyTemplates.push(previous.template);}}catch(e){if(e.code!=='ENOENT')throw e;}
    await save();
  }
  for(const role of ['sender','receiver']){
    const w=await openLocalWallet(browser,role,'/private');wallets.push(w);
    const config={rpcUrl:`http://${role}:5100/json_rpc`,tokenFile:w.tokenFile,account:w.account.component_address,address:w.address,owner:w.account.owner_public_key};
    await verifyWallet(config);
    const balance=await rpc(config,'accounts.get_balances',{account:config.account,refresh:w.account.is_confirmed_on_chain});
    if(!balance.balances.some(b=>b.resource_address===NATIVE&&(BigInt(b.balance)>0n||BigInt(b.confidential_balance)>0n))){
      if(w.account.is_confirmed_on_chain)throw new Error('Funded PoC wallet unexpectedly empty. Inspect its history.');
      const claim=await rpc(config,'accounts.create_free_test_coins',{account:{ComponentAddress:config.account},max_fee:'1000000'});
      requireAccepted(await waitTransaction(config,claim.transaction_id));
    }
    // Local demo companions each get their own token and only their own wallet configuration.
    journal.wallets[role]={...config,tokenFile:undefined,token:(await readFile(w.tokenFile,'utf8')).trim()};
    await save();
  }
  assert.notEqual(journal.wallets.sender.owner,journal.wallets.receiver.owner);
  evidence.checks.independentLocalWallets=true;
  const binary=await readFile('hauntboard/template/hauntboard.wasm');
  const wasmHash=createHash('sha256').update(binary).digest('hex');
  if(journal.wasmHash&&journal.wasmHash!==wasmHash)throw new Error('Contract changed after publication. Start a new explicitly versioned board, preserving old state.');
  journal.wasmHash=wasmHash;await save();
  const sender=journal.wallets.sender;
  if(!journal.template){
    const request={binary:binary.toString('base64'),fee_account:{ComponentAddress:sender.account},max_fee:'5000000',detect_inputs:true,dry_run:true};
    const estimate=await rpc(sender,'transactions.publish_template',request);
    const maxFee=(BigInt(estimate.dry_run_fee)+10000n).toString();assert(BigInt(maxFee)<=5000000n);
    const result=await stage('publication',()=>rpc(sender,'transactions.publish_template',{...request,max_fee:maxFee,dry_run:false}));
    const templateId=result.result.result.Accept.up_substates.find(([id])=>id.startsWith('template_'))?.[0];
    if(templateId)journal.template=templateId.replace(/^template_/,'');
    else{
      const list=await rpc(sender,'templates.list_authored',{author_public_key:sender.owner,page:0,page_size:100});
      journal.template=list.templates.find(t=>t.name==='Hauntboard')?.address.replace(/^template_/,'');
    }
    assert(/^[a-f0-9]{64}$/.test(journal.template));await save();
  }
  evidence.checks.originalWasmPublished=true;
  if(!journal.board){
    const quoted=await quoteCall(sender,'let board=Board::new("The Crypt");',{},`use template_${journal.template} as Board;`);
    const result=await stage('board',()=>submitCall(sender,quoted));
    journal.board=createdComponents(result).find(id=>id!==sender.account);assert(journal.board);await save();
  }
  evidence.checks.boardCreated=true;
  for(const role of ['sender','receiver']){
    const config=journal.wallets[role];
    const balances=await rpc(config,'accounts.get_balances',{account:config.account,refresh:true});
    const native=balances.balances.find(b=>b.resource_address===NATIVE);
    if(BigInt(native?.confidential_balance??'0')<100000000n){
      const quoted=await quoteTip(config,config.address,'500000000','RevealedOnly','Hauntboard local private reserve');
      // This step uses its own signing wallet, not the sender.
      const name=`reserve-${role}`;
      let step=journal.stages[name];
      if(!step){step=journal.stages[name]={status:'submitting'};await save();const sent=await rpc(config,'accounts.stealth_transfer',quoted);step.tx=sent.transaction_id;await save();}
      assert(step.tx,'Uncertain reserve transfer requires reconciliation');
      requireAccepted(await waitTransaction(config,step.tx));step.status='confirmed';await save();
    }
    const path=`/${role}-companion`;
    await mkdir(path,{recursive:true});
    await atomicJson(`${path}/config.json`,{...config,network:'localnet',template:journal.template,board:journal.board,legacyTemplates:journal.legacyTemplates,legacyBoards:journal.legacyBoards,instance:journal.instance,expiresAt:Math.floor(Date.now()/1000)+86400});
  }
  evidence.checks.privateTipReservesFunded=true;
  let row;
  for(let attempt=0;attempt<30;attempt++){
    try{row=await getSubstate('http://indexer:18300',journal.board,journal.template);break;}catch(e){if(attempt===29||!(e.message==='UNVERIFIED_BOARD_COMPONENT'||e.message.startsWith('Indexer unavailable')||e.message==='fetch failed'))throw e;await new Promise(resolve=>setTimeout(resolve,1000));}
  }
  evidence.checks.realIndexerBoardRead=row.verified;
  // Shape only: public state payload is not a private wallet/config export.
  console.log(JSON.stringify({status:'BOARD_STATE_SHAPE',state:row.substate.Component.body?.state??row.substate.Component.state}));
  await mkdir('hauntboard/evidence',{recursive:true});
  await atomicJson('hauntboard/evidence/bootstrap.json',{...evidence,status:'PASSED',checkedAt:new Date().toISOString(),template:journal.template,board:journal.board,wasmHash,wasmBytes:binary.length});
  console.log(JSON.stringify({status:'HAUNTBOARD_LOCAL_READY',board:journal.board,template:journal.template}));
}catch(e){console.error(JSON.stringify({status:'BOOTSTRAP_FAILED',message:e.message,diagnostic:e.diagnostic}));process.exitCode=1;}
finally{
  for(const w of wallets)await w.close().catch(()=>{});
  await browser.close();
  if(lock){await lock.close();await unlink('/private/hauntboard-bootstrap.lock');}
}
