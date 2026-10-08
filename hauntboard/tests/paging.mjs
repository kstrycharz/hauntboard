import {enterWalletCredential} from './gui-helpers.mjs';
import {confirmRecoveryWord} from './gui-helpers.mjs';
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch(),report={network:'localnet',checkedAt:new Date().toISOString(),checks:{},transactions:[]};
async function contextFor(port,service){const c=await browser.newContext();await c.route(`http://localhost:${port}/**`,async route=>{const headers=await route.request().allHeaders();headers.host=`localhost:${port}`;await route.fulfill({response:await route.fetch({url:route.request().url().replace(`http://localhost:${port}`,`http://${service}:${port}`),headers})});});return c;}
const a=await contextFor(8280,'board-web'),b=await contextFor(8281,'board-local'),page=await a.newPage(),other=await b.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));other.on('pageerror',e=>errors.push(e.message));
async function call(page,path,body){return page.evaluate(async({path,body})=>{const config=await (await fetch('/api/config')).json();const r=await fetch(path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json','X-Hauntboard-CSRF':config.csrf}:{},body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw new Error(data.error);return data;},{path,body});}
async function publish(page,body,useBrowser=false){let sent;
 if(useBrowser)sent=await page.evaluate(async body=>{const wallet=await import('/browser-wallet.mjs');return wallet.submit(await wallet.review(body));},body);
 else {const q=await call(page,'/api/quote',body);sent=await call(page,'/api/submit',{quoteId:q.id});}
 for(let n=0;n<90;n++){const tx=useBrowser?await page.evaluate(async id=>(await import('/browser-wallet.mjs')).transaction(id),sent.transactionId):await call(page,`/api/transaction?id=${sent.transactionId}`);if(tx.status==='Accepted'){report.transactions.push(sent.transactionId);return;}if(!['Pending','New'].includes(tx.status))throw new Error(`Transaction ${tx.status}`);await new Promise(r=>setTimeout(r,1000));}throw new Error('Transaction timeout');
}
async function bodyFor(thread,i,secret){return page.evaluate(async({thread,i,secret})=>{const crypto=await import('/crypto.mjs'),nonce=crypto.randomId();const prefix=[i/16&255,(i/16>>>8)&255,0,0];nonce.splice(0,4,...prefix);const content={v:1,title:secret?'Paged secret':'Paged public',name:'Paging tester',body:`Reply ${i}: beyond the old limit`,recipient:null};const parent=i===32?15:0;return {kind:'reply',thread:thread.address,nonce,parent,payload:await crypto.encodePost(content,secret?1:0,secret?await crypto.loadKey(thread.address):null,[thread.board,thread.uid,nonce,parent])};},{thread,i,secret});}
try{
 await page.goto('http://localhost:8280/');await other.goto('http://localhost:8281/');await expect(page.locator('#provider-label')).toHaveText('Primary local indexer');
 const config=await call(page,'/api/config');report.board=config.board;report.template=config.template;
 for(const address of config.legacyBoards){const legacy=await call(page,`/api/board?address=${address}`);assert(legacy.isBoard);}
 report.checks.previousBoardsRemainReadable=true;
 await page.getByRole('button',{name:'Wallet',exact:true}).click();await page.locator('#wallet-create-choice').click();await enterWalletCredential(page, '604281');await page.locator('#wallet-create').click();await expect(page.locator('#wallet-seed-words li')).toHaveCount(24);await confirmRecoveryWord(page);await page.locator('#wallet-seed-saved').check();await page.locator('#wallet-confirm-seed').click();await expect(page.locator('#wallet-fund')).toBeVisible();await page.locator('#wallet-fund').click();await enterWalletCredential(page, '604281');await page.locator('#wallet-fund').click();await expect(page.locator('#browser-wallet-status')).toContainText('Unlocked',{timeout:90000});await page.locator('[data-close="browser-wallet-dialog"]').click();
 for(const secret of [false,true]){
  const opening=await page.evaluate(async({secret,board})=>{const c=await import('/crypto.mjs'),uid=c.randomId(),key=secret?c.newThreadKey():null;const content={v:1,title:secret?'Paged secret':'Paged public',name:'Paging tester',body:'Opening survives every page',recipient:null};return {key,body:{kind:'thread',board,title:secret?'Sealed thread':'Paged public',mode:secret?1:0,uid,payload:await c.encodePost(content,secret?1:0,key,[board,uid,uid,null])}};},{secret,board:config.board});
  await publish(page,opening.body,true);const board=await call(page,`/api/board?address=${config.board}`),ref=board.threads.find(t=>JSON.stringify(t.uid)===JSON.stringify(opening.body.uid));assert(ref);const thread=await call(page,`/api/thread?address=${ref.address}`);
  if(secret){await page.evaluate(async({address,key})=>(await import('/crypto.mjs')).saveKey(address,key),{address:ref.address,key:opening.key});await other.evaluate(async({address,key})=>(await import('/crypto.mjs')).saveKey(address,key),{address:ref.address,key:opening.key});}
  let saved;
  for(let i=1;i<=35;i++){const body=await bodyFor(thread,i,secret);if(i===15)saved=body;await publish(i%2?other:page,body,i===16||i===32);}
  const metadata=await call(other,`/api/thread?address=${ref.address}`);assert.equal(metadata.postCount,36);assert.equal(metadata.pages.length,3);assert.equal(metadata.nextBefore,16);assert.equal(metadata.posts.find(p=>p.index===32).parent,15);
  const raw=await call(other,`/api/raw?address=${ref.address}`);assert.equal(raw.substate.Component.body.state[7].length,0);
  for(let i=0;i<3;i++){const rawPage=await call(other,`/api/raw?address=${metadata.pages[i]}`);assert(rawPage.verified);assert.equal(rawPage.substate.Component.body.state[10],ref.address);assert.equal(rawPage.substate.Component.body.state[7].length,i===2?4:16);}
  // Saved operation returns its original receipt, then a new contract dry run proves old-page retry.
  await publish(other,saved);assert.equal((await call(other,`/api/thread?address=${ref.address}`)).postCount,36);
  const conflict={...saved,parent:1};await assert.rejects(()=>call(other,'/api/quote',conflict));
  const stale=await bodyFor(thread,36,secret);stale.nonce.splice(0,4,0,0,0,0);await assert.rejects(()=>call(other,'/api/quote',stale));
  await other.goto(`http://localhost:8281/?board=${config.board}&thread=${ref.address}`);await expect(other.locator('#thread-heading')).toContainText('36 / 2048');await expect(other.locator('.post')).toHaveCount(21);await other.getByRole('button',{name:'Load older replies'}).click();await expect(other.locator('.post')).toHaveCount(36);await expect(other.locator('.post-body')).toHaveCount(36);await expect(other.locator('#load-older')).toHaveCount(0);
  const indices=await other.locator('.post').evaluateAll(nodes=>nodes.map(n=>Number(n.dataset.post)));assert.deepEqual(indices,[0,...Array.from({length:35},(_,i)=>35-i)]);
  await other.reload();await expect(other.locator('.post')).toHaveCount(21);await expect(other.locator('.post-body')).toHaveCount(21);
  report.checks[secret?'sealedPaging':'publicPaging']={posts:36,pages:3,browserSignedRollover:true,independentWalletReplies:true,oldPageRetry:true,conflictingRetryRejected:true,stalePageRejected:true,globalParent:true,loadOlder:true,freshReload:true,threadStateContainsNoPayloads:true};
  if(secret)await writeFile('/private/hauntboard-paged-invite.json',JSON.stringify({thread:ref.address,board:config.board,key:opening.key,posts:36}),{mode:0o600});
 }
 assert.deepEqual(errors,[]);report.status='PASSED';
}catch(error){report.status='FAILED';report.error=error.message;console.error(error.stack);process.exitCode=1;}
finally{await browser.close();await writeFile('hauntboard/evidence/paging.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}


