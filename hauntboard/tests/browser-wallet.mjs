import {enterWalletCredential} from './gui-helpers.mjs';
import {confirmRecoveryWord} from './gui-helpers.mjs';
import {chromium,firefox,expect} from '@playwright/test';
import {writeFile,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const report={network:'localnet',checkedAt:new Date().toISOString(),checks:{}};
const engine=process.env.BROWSER==='firefox'?'firefox':'chromium';report.browser=engine;
const browser=await (engine==='firefox'?firefox:chromium).launch();let debugPage;
const password='604281';
async function contextFor(){const context=await browser.newContext();await context.route('http://localhost:8280/**',async route=>{const headers=await route.request().allHeaders();headers.host='localhost:8280';await route.fulfill({response:await route.fetch({url:route.request().url().replace('http://localhost:8280','http://board-web:8280'),headers})});});return context;}
try{
 const context=await contextFor();const page=await context.newPage();debugPage=page;const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST')requests.push({url:r.url(),body:r.postData()??''});});
 await page.goto('http://localhost:8280/');await expect(page.locator('#provider-label')).toHaveText('Primary local indexer');
 await page.getByRole('button',{name:'Wallet',exact:true}).click();await page.locator('#wallet-create-choice').click();await enterWalletCredential(page, password);await page.locator('#wallet-create').click();await expect(page.locator('#wallet-seed-words li')).toHaveCount(24);await confirmRecoveryWord(page);await page.locator('#wallet-seed-saved').check();await page.locator('#wallet-confirm-seed').click();await expect(page.locator('#wallet-seed-panel')).toBeHidden();await expect(page.locator('#wallet-fund')).toBeVisible();
 const identity=await page.evaluate(async()=> (await import('/browser-wallet.mjs')).active());
 await page.locator('#wallet-fund').click();await enterWalletCredential(page, password);await page.locator('#wallet-fund').click();await expect(page.locator('#browser-wallet-status')).toContainText('Unlocked',{timeout:90000});
 const owned=await page.evaluate(async()=> (await import('/browser-wallet.mjs')).active());
 assert(owned.account);report.checks.browserGeneratedKeysAndOnChainFaucetAccount=true;
 const parsed=await page.evaluate(async password=>(await import('/browser-wallet.mjs')).backup(password),password);const backup=JSON.stringify(parsed);assert.equal(parsed.owner,undefined);assert.equal(parsed.view,undefined);assert(parsed.ct.length>100);report.checks.legacyEncryptedRecordCompatibility=true;
 await page.locator('[data-close="browser-wallet-dialog"]').click();
 const title=`Browser ghost ${Date.now().toString(36)}`;
 await page.locator('#new-thread').click();await page.locator('#thread-title').fill(title);await page.locator('#thread-body').fill('A real browser-owned signer published this synthetic story.');await page.locator('#compose-form button[type=submit]').click();
 await expect.poll(async()=>await page.locator('#review-dialog').isVisible()||await page.locator('#flash.error').isVisible(),{timeout:30000}).toBe(true);if(await page.locator('#flash.error').isVisible())throw new Error(await page.locator('#flash').textContent());await expect(page.locator('#review-wallet')).toHaveText('Your browser wallet');await page.locator('#confirm-publish').click();
 await expect(page.locator('#thread-heading h2')).toHaveText(title,{timeout:90000});
 const thread=new URL(page.url()).searchParams.get('thread');
 const author=await page.evaluate(async address=>(await(await fetch(`/api/thread?address=${address}`)).json()).posts[0].author,thread);
 assert.equal(author,owned.publicKey);report.checks.realBrowserSignerAuthorship=true;
 assert(!requests.some(r=>r.url.endsWith('/api/quote')||r.url.endsWith('/api/submit')));report.checks.noDemoWalletSigning=true;
 await page.reload();await page.locator('#browser-wallet-button').click();await expect(page.locator('#browser-wallet-status')).toContainText('locked');
 await enterWalletCredential(page, '999999');await page.locator('#wallet-unlock').click();await expect(page.locator('#wallet-message')).toContainText('Could not unlock');
 await enterWalletCredential(page, password);await page.locator('#wallet-unlock').click();await expect(page.locator('#browser-wallet-status')).toContainText(owned.account);report.checks.reloadUnlockAndWrongPassword=true;
 await page.screenshot({path:'hauntboard/evidence/browser-wallet.png',fullPage:true});
 const fresh=await contextFor();const restored=await fresh.newPage();debugPage=restored;await restored.goto('http://localhost:8280/');await restored.locator('#browser-wallet-button').click();await restored.evaluate(async({backup,password})=>{const w=await import('/browser-wallet.mjs');await w.restore(JSON.parse(backup),password);},{backup,password});await restored.locator('[data-close="browser-wallet-dialog"]').click();await restored.locator('#browser-wallet-button').click();await expect(restored.locator('#browser-wallet-status')).toContainText(owned.account,{timeout:30000});
 await restored.locator('[data-close="browser-wallet-dialog"]').click();await restored.goto(`http://localhost:8280/?thread=${thread}`);
 await restored.locator('#browser-wallet-button').click();await enterWalletCredential(restored, password);await restored.locator('#wallet-unlock').click();await expect(restored.locator('#browser-wallet-status')).toContainText('Unlocked');await restored.locator('[data-close="browser-wallet-dialog"]').click();
 await restored.locator('#reply-body').fill('Recovered on a clean browser, signed by the same owner.');await restored.locator('#reply-form button[type=submit]').click();await expect(restored.locator('#review-wallet')).toHaveText('Your browser wallet',{timeout:90000});await restored.locator('#confirm-publish').click();await expect(restored.locator('.post-body')).toHaveCount(2,{timeout:90000});report.checks.cleanDeviceRestoreAndSignedReply=true;
 const secretTitle=`Browser sealed ghost ${Date.now().toString(36)}`;
 await restored.locator('#new-thread').click();await restored.locator('input[name=mode][value="1"]').check();await restored.locator('#thread-title').fill(secretTitle);await restored.locator('#thread-body').fill('Synthetic sealed browser-wallet text that must not be stored in plaintext.');await restored.locator('#compose-form button[type=submit]').click();await expect(restored.locator('#review-wallet')).toHaveText('Your browser wallet',{timeout:30000});
 let dropped=false;await fresh.route('http://localhost:8280/api/browser-submit',async route=>{const headers=await route.request().allHeaders();headers.host='localhost:8280';const response=await route.fetch({url:'http://board-web:8280/api/browser-submit',headers});assert(response.ok());dropped=true;await route.abort('failed');});
 await restored.locator('#confirm-publish').click();await expect.poll(()=>dropped).toBe(true);await fresh.unroute('http://localhost:8280/api/browser-submit');await restored.reload();
 await expect.poll(async()=>{const heading=await restored.locator('#thread-heading h2').textContent().catch(()=>null);if(heading!==secretTitle&&(await restored.locator('#flash').textContent())?.includes('waiting for the board indexer'))await restored.reload();return heading;},{timeout:90000,intervals:[1000,2000,5000]}).toBe(secretTitle);await expect(restored.locator('.post-body')).toHaveCount(1);
 const secretThread=new URL(restored.url()).searchParams.get('thread');
 const secretState=await restored.evaluate(async address=>await(await fetch(`/api/thread?address=${address}`)).json(),secretThread);
 assert.equal(secretState.posts[0].author,owned.publicKey);assert(!JSON.stringify(secretState).includes(secretTitle));const envelope=JSON.parse(new TextDecoder().decode(Uint8Array.from(secretState.posts[0].payload)));assert.equal(envelope.alg,'A256GCM');
 assert.equal(await restored.evaluate(()=>localStorage.getItem('hauntboard-pending')),null);report.checks.sealedBrowserPostAndLostResponseRecovery=true;
 assert(!requests.some(r=>r.body.includes(password)||/"(owner|view|password)"\s*:/.test(r.body)));assert.deepEqual(errors,[]);report.checks.passwordsAndPrivateKeysNeverSent=true;report.checks.noRuntimeErrors=true;
 report.wallet={publicKey:owned.publicKey,account:owned.account,address:identity.address};report.thread=thread;report.status='PASSED';
}catch(e){report.status='FAILED';report.error=e.message;report.visible=await debugPage?.locator('#flash').textContent().catch(()=>'');await debugPage?.evaluate(()=>{document.querySelector('#wallet-seed-words')?.replaceChildren();const input=document.querySelector('#wallet-recovery-input');if(input)input.value='';}).catch(()=>{});await debugPage?.screenshot({path:'hauntboard/evidence/failure-browser-wallet.png',fullPage:true}).catch(()=>{});process.exitCode=1;}
finally{await writeFile(`hauntboard/evidence/browser-wallet${engine==='firefox'?'-firefox':''}.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));await browser.close();}




