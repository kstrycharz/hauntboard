import {chromium,expect} from '@playwright/test';
import {randomInt} from 'node:crypto';
import {readFile,writeFile,rename} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {enterWalletCredential,confirmRecoveryWord} from './gui-helpers.mjs';
process.umask(0o077);
const origin=process.env.FLOW_ORIGIN;
assert.equal(origin,'https://hauntboard.taritracker.com');
const privateFile='/private/fresh-wallet-flow.json';
try {
  await readFile(privateFile);
  throw new Error('Existing validation wallet retained. Use a new private volume for a fresh run; reconcile the saved wallet separately.');
} catch(error) {
  if(error.code!=='ENOENT') throw error;
}
const report={origin,checkedAt:new Date().toISOString(),checks:{},submittedClaims:0,submittedPosts:0};
const backup={pin:String(randomInt(1000000)).padStart(6,'0')};
const save=async()=>{await writeFile(privateFile+'.tmp',JSON.stringify(backup),{mode:0o600});await rename(privateFile+'.tmp',privateFile);};
const browser=await chromium.launch();
let stage='startup';
try {
  const context=await browser.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage();
  await page.goto(origin);
  await expect(page.locator('body')).toHaveAttribute('data-ready','true',{timeout:60000});
  const config=await page.evaluate(async()=>await(await fetch('/api/config',{cache:'no-store'})).json());
  assert.equal(config.network,'esmeralda');
  assert.equal(config.faucetEnabled,true);
  report.checks.liveConfiguration=true;
  stage='create-wallet';
  await page.locator('#browser-wallet-button').click();
  await page.locator('#wallet-create-choice').click();
  await enterWalletCredential(page,backup.pin);
  await expect(page.locator('#wallet-seed-words li')).toHaveCount(24,{timeout:60000});
  backup.phrase=(await page.locator('#wallet-seed-words li').allTextContents()).join(' ');
  backup.address=await page.evaluate(async()=>(await import('/browser-wallet.mjs')).active().address);
  assert.match(backup.address,/^otl_esm_1/);
  await confirmRecoveryWord(page);
  await page.locator('#wallet-seed-saved').check();
  await page.locator('#wallet-confirm-seed').click();
  await expect(page.locator('#wallet-seed-panel')).toBeHidden({timeout:60000});
  backup.storage=await context.storageState({indexedDB:true});
  await save();
  report.checks.newWalletAndRecoveryConfirmation=true;
  stage='faucet-claim';
  let submitted=false;
  await page.route('**/api/faucet-submit',async route=>{
    if(submitted){await route.abort();return;}
    submitted=true;
    backup.storage=await context.storageState({indexedDB:true});
    backup.pending=route.request().postDataJSON();
    await save();
    report.submittedClaims++;
    await route.continue();
  });
  await expect(page.locator('#wallet-faucet')).toBeEnabled();
  await page.locator('#wallet-faucet').click();
  await expect(page.locator('#wallet-message')).toContainText(/refill|confirmed on Tari|rejected|reconciliation|expired|unavailable|failed/,{timeout:180000});
  const message=await page.locator('#wallet-message').textContent();
  backup.storage=await context.storageState({indexedDB:true});
  await save();
  report.checks.faucetAttempt=true;
  report.faucetStatus=message.includes('refill')?'CLIENT_PREFLIGHT_BLOCKED':message.includes('confirmed on Tari')?'CONFIRMED':'UNRESOLVED';
  if(report.faucetStatus==='UNRESOLVED')throw new Error('Claim requires investigation or reconciliation');
  if(report.faucetStatus==='CONFIRMED') {
    // A clearly labelled validation post, using the app's bounded fee review.
    stage='publish-validation-post';
    await page.locator('[data-close="browser-wallet-dialog"]').click();
    await page.locator('#new-thread').click();
    await page.locator('#thread-title').fill('Hauntboard new-wallet validation');
    await page.locator('#thread-body').fill('Operator validation: a fresh browser wallet completed setup, faucet funding and a reviewed public post. This test message is intentionally public.');
    await page.locator('#compose-form button[type="submit"]').click();
    await expect(page.locator('#confirm-publish')).toBeEnabled({timeout:60000});
    const fee=Number.parseFloat((await page.locator('#review-fee').textContent()).replaceAll(',',''));
    assert(fee>0 && fee<=1,'Validation posting fee must be at most one test TARI.');
    await page.route('**/api/browser-submit',async route=>{
      if(backup.postPending){await route.abort();return;}
      backup.storage=await context.storageState({indexedDB:true});
      backup.postPending=route.request().postDataJSON();
      await save();
      report.submittedPosts++;
      await route.continue();
    });
    await page.locator('#confirm-publish').click();
    await expect(page.locator('.post-chain-link')).toBeVisible({timeout:180000});
    report.checks.publicPostAndChainLink=true;
  }
  stage='reload-and-unlock';
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-ready','true',{timeout:60000});
  await page.locator('#browser-wallet-button').click();
  await enterWalletCredential(page,backup.pin);
  await expect(page.locator('#wallet-lock')).toBeVisible({timeout:60000});
  assert.equal(await page.evaluate(async()=>(await import('/browser-wallet.mjs')).active().address),backup.address);
  report.checks.reloadPinUnlockPreservesIdentity=true;
  backup.storage=await context.storageState({indexedDB:true});
  await save();
  stage='recover-in-fresh-browser';
  const restored=await browser.newContext({viewport:{width:390,height:844}}),recovery=await restored.newPage();
  await recovery.goto(origin);
  await expect(recovery.locator('body')).toHaveAttribute('data-ready','true',{timeout:60000});
  await recovery.locator('#browser-wallet-button').click();
  await recovery.locator('#wallet-recover-choice').click();
  await recovery.locator('#wallet-recovery-input').fill(backup.phrase);
  const recoveryPin=String(randomInt(1000000)).padStart(6,'0');
  await enterWalletCredential(recovery,recoveryPin);
  await expect(recovery.locator('#wallet-recovery-review')).toBeVisible({timeout:60000});
  await recovery.locator('#wallet-restore').click();
  await expect(recovery.locator('#wallet-lock')).toBeVisible({timeout:60000});
  assert.equal(await recovery.evaluate(async()=>(await import('/browser-wallet.mjs')).active().address),backup.address);
  report.checks.freshBrowserRecoveryPreservesIdentity=true;
  await restored.close();
  if(report.faucetStatus==='CLIENT_PREFLIGHT_BLOCKED') {
    stage='read-only-claim-simulation';
    const source=await readFile('hauntboard/web/browser-wallet.mjs','utf8');
    const guard='if (BigInt(available) < 1000000000n)';
    assert(source.includes(guard));
    const diagnostic=await browser.newContext({storageState:backup.storage,viewport:{width:390,height:844}});
    const diagnosticPage=await diagnostic.newPage();
    await diagnosticPage.route('**/browser-wallet.mjs',route=>route.fulfill({contentType:'text/javascript',body:source.replace(guard,'if (false && BigInt(available) < 1000000000n)')}));
    let dryRun=null,blockedSubmissions=0;
    await diagnosticPage.route('**/api/faucet-submit',async route=>{blockedSubmissions++;await route.abort();});
    diagnosticPage.on('response',async response=>{
      if(response.url().endsWith('/api/indexer') && response.request().postDataJSON()?.path==='transactions/dry-run') {
        try{dryRun=await response.json();await writeFile('/private/claim-dry-run.json',JSON.stringify(dryRun),{mode:0o600});}catch{}
      }
    });
    await diagnosticPage.goto(origin);
    await expect(diagnosticPage.locator('body')).toHaveAttribute('data-ready','true',{timeout:60000});
    await diagnosticPage.locator('#browser-wallet-button').click();
    await enterWalletCredential(diagnosticPage,backup.pin);
    await expect(diagnosticPage.locator('#wallet-faucet')).toBeEnabled({timeout:60000});
    await diagnosticPage.locator('#wallet-faucet').click();
    await expect.poll(()=>dryRun!==null,{timeout:120000}).toBe(true);
    report.diagnostic={scope:'Frontend balance guard bypassed only in isolated test browser; real network dry-run; every claim submission blocked',accepted:Boolean(dryRun.result?.finalize?.result?.Accept),blockedSubmissions};
    const result=dryRun.result?.finalize?.result;
    backup.diagnosticResult=result;
    await save();
    await diagnostic.close();
  }
  report.status=report.faucetStatus==='CONFIRMED'?'FULL_FLOW_PASSED':'WALLET_FLOW_PASSED_FUNDING_BLOCKED';
  report.checks.posting=report.faucetStatus==='CONFIRMED'?'PASSED':'Not attempted: fresh wallet could not obtain posting funds';
  await writeFile('hauntboard/evidence/fresh-wallet-flow.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
} catch(error) {
  await writeFile('/private/flow-error.txt',String(error.stack??error),{mode:0o600});
  console.log(JSON.stringify({...report,status:'FAILED',stage,errorType:error.name}));
  process.exitCode=1;
} finally {await browser.close();}
