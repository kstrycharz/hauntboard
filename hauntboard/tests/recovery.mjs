import {chromium,firefox,expect} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const report={network:'localnet',checkedAt:new Date().toISOString(),checks:{}};
async function contextFor(browser){
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  await context.route('http://localhost:8280/**',async route=>{
    const headers=await route.request().allHeaders();headers.host='localhost:8280';
    await route.fulfill({response:await route.fetch({url:route.request().url().replace('http://localhost:8280','http://board-web:8280'),headers})});
  });return context;
}
const browser=await chromium.launch();let ff;
try{
  const context=await contextFor(browser);const page=await context.newPage();await page.goto('http://localhost:8280/');await expect(page.locator('#provider-label')).toHaveText('Primary local indexer');
  const title=`A lost receipt, a remembered story · ${Date.now().toString(36)}`;
  await page.getByRole('button',{name:'Start a thread'}).click();await page.locator('#thread-title').fill(title);await page.locator('#thread-body').fill('A synthetic transaction recovery test. The response disappears, but the chain remembers.');
  await page.getByRole('button',{name:'Review post'}).click();await expect(page.locator('#review-dialog')).toBeVisible({timeout:30000});
  let dropped=false;
  await context.route('http://localhost:8280/api/submit',async route=>{
    const headers=await route.request().allHeaders();headers.host='localhost:8280';
    const response=await route.fetch({url:'http://board-web:8280/api/submit',headers});assert(response.ok());dropped=true;await route.abort('failed');
  });
  await page.getByRole('button',{name:'Confirm & sign'}).click();await expect.poll(()=>dropped).toBe(true);
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('hauntboard-pending')??'null')?.operation)).toMatch(/^[a-f0-9]{64}$/);
  await context.unroute('http://localhost:8280/api/submit');await page.reload();
  await expect(page.locator('#thread-heading h2')).toHaveText(title,{timeout:90000});await expect(page.locator('.post-body')).toHaveCount(1);
  const thread=new URL(page.url()).searchParams.get('thread');await page.reload();await expect(page.locator('#thread-heading h2')).toHaveText(title,{timeout:30000});
  assert.equal(await page.evaluate(()=>localStorage.getItem('hauntboard-pending')),null);
  report.checks.lostSubmitResponseRecoveredThroughDurableOperation=true;report.checks.reloadCreatesNoDuplicatePost=true;
  ff=await firefox.launch();const fcontext=await contextFor(ff);const fpage=await fcontext.newPage();const fixture=JSON.parse(await readFile('/private/hauntboard-outage-invite.json','utf8'));
  const invite=fixture.invitation.replace('http://localhost:8281','http://localhost:8280');
  await fpage.goto(invite);await expect(fpage.locator('#thread-heading h2')).toHaveText(fixture.secretTitle,{timeout:30000});await expect(fpage.locator('.post-body')).toHaveCount(4);
  await fpage.reload();await expect(fpage.locator('#thread-heading h2')).toHaveText(fixture.secretTitle,{timeout:30000});report.checks.firefoxSecretInvitationAndKeyReload=true;
  await fpage.getByRole('button',{name:'◇ My demo wallet'}).click();await expect(fpage.locator('#wallet-details')).toContainText('Private balance',{timeout:30000});report.checks.firefoxNativeWalletScan=true;
  await fpage.screenshot({path:'hauntboard/evidence/firefox-wallet.png',fullPage:true});report.status='PASSED';console.log(JSON.stringify(report));
}catch(e){report.status='FAILED';report.error=e.message;console.error(JSON.stringify(report));process.exitCode=1;}
finally{await writeFile('hauntboard/evidence/recovery.json',JSON.stringify(report,null,2)+'\n');await browser.close();if(ff)await ff.close();}

