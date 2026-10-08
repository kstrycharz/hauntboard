import {chromium,firefox,expect} from '@playwright/test';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {rpc,NATIVE,waitTransaction,requireAccepted,quoteTip,getSubstate} from '../lib/chain.mjs';
const out='hauntboard/evidence';await mkdir(out,{recursive:true});
const report={network:'localnet',checkedAt:new Date().toISOString(),checks:{},transactions:[]};
const run=Date.now().toString(36);
let phase='launch';
const browser=await chromium.launch();
async function contextFor(browser,port,service){
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.route(`http://localhost:${port}/**`,async route=>{
    const req=route.request();const headers=await req.allHeaders();headers.host=`localhost:${port}`;
    const response=await route.fetch({url:req.url().replace(`http://localhost:${port}`,`http://${service}:${port}`),headers});
    await route.fulfill({response});
  });
  return context;
}
const a=await contextFor(browser,8280,'board-web'),b=await contextFor(browser,8281,'board-local');
const page=await a.newPage(),other=await b.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));other.on('pageerror',e=>errors.push(e.message));
let lastSubmittedB;
other.on('response',async r=>{if(r.url().endsWith('/api/submit')&&r.ok()){const j=await r.json();lastSubmittedB=j.transactionId;}});
async function confirmed(page){await page.locator('#confirm-publish').click();await expect(page.locator('#review-dialog')).not.toBeVisible({timeout:30000});await expect(page.locator('#flash')).toContainText(/confirmed|Confirmed/,{timeout:90000});}
async function create(page,{title,body,secret=false,recipient=false}){
  await page.getByRole('button',{name:'Start a thread',exact:true}).click();
  if(secret)await page.locator('input[name=mode][value="1"]').check();else await page.locator('input[name=mode][value="0"]').check();
  await page.locator('#thread-title').fill(title);await page.locator('#post-name').fill('Ghost');await page.locator('#thread-body').fill(body);
  await page.locator('#include-address').setChecked(recipient);
  await page.getByRole('button',{name:'Review post',exact:true}).click();
  await expect(page.locator('#review-dialog')).toBeVisible({timeout:30000});await expect(page.locator('#review-fee')).toContainText('test TARI');
  await confirmed(page);await expect(page.locator('#thread-heading h2')).toHaveText(title);
  return new URL(page.url()).searchParams.get('thread');
}
async function raw(page,address){return page.evaluate(async address=>{const r=await fetch(`/api/raw?address=${address}`);const j=await r.json();if(!r.ok)throw new Error(j.error);return j;},address);}
try{
  phase='initial';await page.goto('http://localhost:8280/');await other.goto('http://localhost:8281/');
  await expect(page.locator('#provider-label')).toHaveText('Primary local indexer');await expect(other.locator('#provider-label')).toHaveText('Independent local indexer');
  await expect(page.locator('#thread-list')).not.toContainText('Connecting',{timeout:30000});
  report.checks.twoIndependentClients=true;
  phase='public create';
  const publicTitle=`The footsteps above an empty room · ${run}`;
  const publicBody='The building has been empty for forty years. Last night, someone upstairs asked me to turn the radio down.\n\nThis is a synthetic story for the working local-chain demo.';
  const publicThread=await create(page,{title:publicTitle,body:publicBody,recipient:true});
  const publicRaw=await raw(page,publicThread);assert(publicRaw.verified);
  assert(JSON.stringify(publicRaw).includes(publicTitle));
  const rawState=(await raw(page,publicRaw.substate.Component.body.state[8][0])).substate.Component.body.state;
  const firstBytes=rawState[7][0][3];assert.equal(JSON.parse(Buffer.from(firstBytes).toString()).body,publicBody);
  report.checks.fullPublicContentStoredOnChain=true;
  phase='independent reply';await other.goto(`http://localhost:8281/?thread=${publicThread}`);
  await expect(other.locator('#thread-heading h2')).toHaveText(publicTitle,{timeout:30000});
  await other.locator('#reply-body').fill('I heard it too. There is no radio in this building.');await other.getByRole('button',{name:'Review reply'}).click();await expect(other.locator('#review-dialog')).toBeVisible({timeout:30000});await confirmed(other);
  await expect(other.locator('.post-body')).toHaveCount(2);
  const replyRaw=await raw(other,publicThread);const replyPage=await raw(other,replyRaw.substate.Component.body.state[8][0]);assert.notEqual(replyPage.substate.Component.body.state[7][0][1],replyPage.substate.Component.body.state[7][1][1]);
  report.checks.independentSignerReply=true;
  phase='secret create';await page.getByRole('button',{name:'← All threads'}).click();
  const secretTitle=`A letter from Platform 13 · ${run}`,secretBody=`The last train left in 1923. Tonight its conductor handed me a ticket with tomorrow's date. Secret test marker ${run}.`;
  const secretThread=await create(page,{title:secretTitle,body:secretBody,secret:true,recipient:true});
  const secretRaw=await raw(page,secretThread);const secretPage=await raw(page,secretRaw.substate.Component.body.state[8][0]);const stored=Buffer.from(secretPage.substate.Component.body.state[7][0][3]).toString();
  assert(!stored.includes(secretBody)&&!stored.includes(secretTitle));const cipher=JSON.parse(stored);assert.equal(cipher.alg,'A256GCM');
  report.checks.encryptedFullEnvelopeOnChain=true;
  await page.screenshot({path:`${out}/secret-thread.png`,fullPage:true});
  phase='wrong key';const stranger=await contextFor(browser,8281,'board-local');const locked=await stranger.newPage();await locked.goto(`http://localhost:8281/?thread=${secretThread}`);
  await expect(locked.locator('.locked-copy')).toContainText('sealed',{timeout:30000});await expect(locked.locator('#reply-form')).not.toBeVisible();
  report.checks.freshBrowserCannotReadSecret=true;
  phase='invite';const invitation=await page.locator('#other-client').getAttribute('href');assert(invitation.includes('#')&&invitation.includes('key='));
  await writeFile('/private/hauntboard-outage-invite.json',JSON.stringify({invitation,publicThread,secretThread,publicTitle,secretTitle}),{mode:0o600});
  await other.goto(invitation);await expect(other.locator('#thread-heading h2')).toHaveText(secretTitle,{timeout:30000});assert(!other.url().includes('key='));
  await other.locator('#reply-body').fill('I have the invitation. The conductor knows my name.');await other.getByRole('button',{name:'Review reply'}).click();await expect(other.locator('#review-dialog')).toBeVisible({timeout:30000});await confirmed(other);
  report.checks.inviteDecryptionAndEncryptedReply=true;report.checks.inviteKeyRemovedFromUrl=true;
  phase='reload';await other.reload();await expect(other.locator('#thread-heading h2')).toHaveText(secretTitle,{timeout:30000});await expect(other.locator('.post-body')).toHaveCount(2);report.checks.encryptedBrowserKeySurvivesReload=true;
  phase='crypto negative cases';
  const checks=await page.evaluate(async()=>{
    const c=await import('/crypto.mjs');const key=c.newThreadKey(),wrong=c.newThreadKey();const uid=c.randomId(),nonce=c.randomId();const ctx=['component_'+'1'.repeat(64),uid,nonce,0];
    const content={title:'Test',name:'Ghost',body:'Synthetic crypto verification'};
    const data=await c.encodePost(content,1,key,ctx);let wrongKey=false,tamper=false,binding=false;
    try{await c.decodePost(data,1,wrong,ctx);}catch{wrongKey=true;}
    const e=JSON.parse(new TextDecoder().decode(new Uint8Array(data)));e.ct=(e.ct[0]==='A'?'B':'A')+e.ct.slice(1);const altered=Array.from(new TextEncoder().encode(JSON.stringify(e)));
    try{await c.decodePost(altered,1,key,ctx);}catch{tamper=true;}
    try{await c.decodePost(data,1,key,[ctx[0],uid,nonce,1]);}catch{binding=true;}
    const backup=await c.exportKeys([{thread:ctx[0],key}],'synthetic long backup password');let badPassword=false;try{await c.importKeys(backup,'another long password');}catch{badPassword=true;}
    const restored=await c.importKeys(backup,'synthetic long backup password');
    return {wrongKey,tamper,binding,badPassword,backupRoundTrip:restored[0].key===key,paddedBytes:JSON.stringify(e).length};
  });assert(checks.wrongKey&&checks.tamper&&checks.binding&&checks.badPassword&&checks.backupRoundTrip);Object.assign(report.checks,checks);
  phase='native private tip';
  await other.locator('.post').first().getByRole('button',{name:'◇ Leave a private tip'}).click();await other.locator('#tip-amount').fill('1');await other.getByRole('button',{name:'Review private tip →'}).click();await expect(other.locator('#review-dialog')).toBeVisible({timeout:30000});await confirmed(other);
  const sender=JSON.parse(await readFile('/sender-companion/config.json','utf8')),receiver=JSON.parse(await readFile('/receiver-companion/config.json','utf8'));
  let received=[];for(let i=0;i<20;i++){await rpc(sender,'accounts.get_balances',{account:sender.account,refresh:true});received=(await rpc(sender,'stealth_utxos.list',{resource_address:NATIVE,account_address:sender.account,filter_by_status:null})).utxos.filter(o=>o.is_on_chain&&o.memo?.Message==='A candle from Hauntboard'&&o.value==='1000000');if(received.length)break;await new Promise(r=>setTimeout(r,1000));}assert(received.length);
  report.checks.realNativeStealthTipReceived=true;
  assert(lastSubmittedB);const transfer=await rpc(receiver,'transactions.get',{transaction_id:lastSubmittedB});
  const body=transfer.transaction.V1.body.transaction;const statements=[...body.instructions,...body.fee_instructions].filter(i=>i.StealthTransfer).map(i=>i.StealthTransfer.statement);
  assert(statements.length&&statements.every(s=>s.inputs_statement.revealed_amount==='0'));
  assert(!JSON.stringify(transfer.transaction).includes(sender.address));assert(!JSON.stringify(transfer.transaction).includes('A candle from Hauntboard'));
  report.checks.privateTransferMetadataInspected=true;report.transactions.push({purpose:'private-tip',id:lastSubmittedB,fee:transfer.result.fee_receipt.total_fees_paid});
  phase='privacy UI wallet';await page.getByRole('button',{name:'◇ My demo wallet'}).click();await expect(page.locator('#received-tips')).toContainText('1 test TARI',{timeout:30000});await page.screenshot({path:`${out}/wallet.png`,fullPage:true});await page.locator('[data-close=wallet-dialog]').click();
  phase='xss';
  await other.locator('#reply-body').fill('<img src=x onerror="window.pwned=true"> literal text, not HTML.');await other.getByRole('button',{name:'Review reply'}).click();await expect(other.locator('#review-dialog')).toBeVisible({timeout:30000});await confirmed(other);assert.equal(await other.evaluate(()=>window.pwned),undefined);assert.equal(await other.locator('.post-body img').count(),0);report.checks.postHtmlRenderedAsText=true;
  phase='board and screenshot';await page.getByRole('button',{name:'← All threads'}).click();await expect(page.locator('.thread-row')).toHaveCount((await page.evaluate(async()=>(await(await fetch('/api/board')).json()).threads.length)));await page.screenshot({path:`${out}/board-desktop.png`,fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:`${out}/board-mobile.png`,fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));report.checks.mobileNoHorizontalOverflow=true;
  phase='csrf';const denied=await page.evaluate(async()=>{const r=await fetch('/api/quote',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});return r.status;});assert.equal(denied,403);report.checks.unsignedCrossOriginMutationRejected=true;
  phase='chain evidence';report.board=sender.board;report.publicThread=publicThread;report.secretThread=secretThread;report.checks.browserRuntimeErrorsAbsent=errors.length===0;assert.deepEqual(errors,[]);
  await stranger.close();report.status='PASSED';
  console.log(JSON.stringify({status:report.status,checks:report.checks,publicThread,secretThread}));
}catch(e){report.status='FAILED';report.phase=phase;report.error=e.message;await page.screenshot({path:`${out}/failure.png`,fullPage:true}).catch(()=>{});await other.screenshot({path:`${out}/failure-other.png`,fullPage:true}).catch(()=>{});console.error(JSON.stringify({status:'FAILED',phase,error:e.message,flashA:await page.locator('#flash').textContent().catch(()=>''),flashB:await other.locator('#flash').textContent().catch(()=>''),stack:e.stack?.split('\n').slice(0,4)}));process.exitCode=1;}
finally{await writeFile(`${out}/browser.json`,JSON.stringify(report,null,2)+'\n');await browser.close();}

