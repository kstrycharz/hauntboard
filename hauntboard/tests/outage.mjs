import {chromium,expect} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const fixture=JSON.parse(await readFile('/private/hauntboard-outage-invite.json','utf8'));
const report={network:'localnet',checkedAt:new Date().toISOString(),checks:{}};
const browser=await chromium.launch();
const context=await browser.newContext();
await context.route('http://localhost:8281/**',async route=>{
  const headers=await route.request().allHeaders();headers.host='localhost:8281';
  await route.fulfill({response:await route.fetch({url:route.request().url().replace('http://localhost:8281','http://board-local:8281'),headers})});
});
const page=await context.newPage();
try{
  for(const endpoint of ['http://board-web:8280/','http://indexer:18300/network','http://sender:5100/json_rpc']){
    let unavailable=false;try{await fetch(endpoint,{signal:AbortSignal.timeout(3000)});}catch{unavailable=true;}
    assert(unavailable,`${endpoint} must actually be offline`);
  }
  report.checks.primaryWebsiteIndexerAndWalletOffline=true;
  await page.goto(`http://localhost:8281/?thread=${fixture.publicThread}`);
  await expect(page.locator('#thread-heading h2')).toHaveText(fixture.publicTitle,{timeout:30000});
  await expect(page.locator('.post-body')).toHaveCount(2);report.checks.coldPublicHistoryRecovered=true;
  await page.goto(fixture.invitation);
  await expect(page.locator('#thread-heading h2')).toHaveText(fixture.secretTitle,{timeout:30000});
  await expect(page.locator('.post-body')).toHaveCount(3);
  report.checks.coldEncryptedHistoryRecoveredAndDecrypted=true;
  await page.locator('#reply-body').fill('The original doorway is offline. The conversation is still here.');
  await page.getByRole('button',{name:'Review reply'}).click();await expect(page.locator('#review-dialog')).toBeVisible({timeout:30000});
  await page.getByRole('button',{name:'Confirm & sign'}).click();
  await expect(page.locator('#flash')).toContainText('Confirmed on Tari',{timeout:90000});
  await expect(page.locator('.post-body')).toHaveCount(4);
  report.checks.newIndependentEncryptedReplyConfirmed=true;
  await page.reload();await expect(page.locator('.post-body')).toHaveCount(4,{timeout:30000});report.checks.recoveredReplySurvivesReload=true;
  await page.screenshot({path:'hauntboard/evidence/outage-recovery.png',fullPage:true});
  const paged=JSON.parse(await readFile('/private/hauntboard-paged-invite.json','utf8'));
  await page.goto(`http://localhost:8281/#${new URLSearchParams({thread:paged.thread,board:paged.board,key:paged.key})}`);
  await expect(page.locator('#thread-heading h2')).toHaveText('Paged secret',{timeout:30000});
  await page.getByRole('button',{name:'Load older replies'}).click();await expect(page.locator('.post-body')).toHaveCount(paged.posts);
  await page.locator('#reply-body').fill('A paged conversation continues while the primary is offline.');
  await page.locator('#reply-form button[type=submit]').click();await expect(page.locator('#review-dialog')).toBeVisible({timeout:30000});await page.locator('#confirm-publish').click();await expect(page.locator('#flash')).toContainText('Confirmed on Tari',{timeout:90000});
  await expect(page.locator('#thread-heading')).toContainText(`${paged.posts+1} / 2048`);await page.reload();await expect(page.locator('#thread-heading')).toContainText(`${paged.posts+1} / 2048`,{timeout:30000});
  report.checks.pagedSealedHistoryAndIndependentReplyWhilePrimaryOffline=true;
  report.status='PASSED';console.log(JSON.stringify(report));
}catch(e){report.status='FAILED';report.error=e.message;report.flash=await page.locator('#flash').textContent().catch(()=>null);console.error(JSON.stringify(report));process.exitCode=1;}
finally{await writeFile('hauntboard/evidence/outage.json',JSON.stringify(report,null,2)+'\n');await browser.close();}

