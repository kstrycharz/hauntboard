// Public HTTPS acceptance. Every transaction and faucet write is blocked.
import {chromium,firefox,expect} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin='https://hauntboard.taritracker.com',record=JSON.parse(await readFile('hauntboard/evidence/room-key-esmeralda.json','utf8'));
const report={checkedAt:new Date().toISOString(),origin,chainWrites:0,browsers:{}};
for(const [name,engine]of [['chromium',chromium],['firefox',firefox]]){
 const browser=await engine.launch();try{
  const page=await browser.newPage({viewport:{width:1280,height:950}}),errors=[],blocked=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route(/\/api\/(browser-submit|faucet-claim|faucet-submit|submit)(\?|$)/,route=>{blocked.push(route.request().url());return route.abort();});
  assert.equal((await page.request.get(origin+'/health/ready')).status(),200);
  assert.deepEqual(await(await page.request.get(origin+'/proof-evidence.json')).json(),record);
  await page.goto(origin+'/proof');await expect(page.locator('#recorded-stages a')).toHaveCount(8);
  await expect(page.locator('#record-status')).toContainText('2026-11-04');
  await page.getByRole('button',{name:'Check current registry availability',exact:true}).click();
  await expect(page.locator('#registry-status')).toContainText('generation 1, revision 2');
  await page.screenshot({path:`hauntboard/evidence/reset-proofs-${name}.png`,fullPage:true});
  const publicState=await(await page.request.get(origin+'/api/thread?address='+record.publicThread)).json();assert.equal(publicState.posts.length,2);
  await page.goto(origin+'/?thread='+record.publicThread);await page.waitForFunction(()=>document.body.dataset.ready==='true');
  for(const post of publicState.posts){const content=JSON.parse(new TextDecoder().decode(new Uint8Array(post.payload)));await expect(page.getByText(content.body,{exact:true})).toBeVisible();}
  await page.goto(origin+'/?thread='+record.thread);await page.waitForFunction(()=>document.body.dataset.ready==='true');
  await expect(page.getByRole('button',{name:'Room access',exact:true})).toBeVisible();
  const sealedState=await(await page.request.get(origin+'/api/thread?address='+record.thread)).json();assert.equal(sealedState.posts.length,3);
  assert(!(await page.locator('body').innerText()).includes('Synthetic managed-room message'));
  for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
  report.browsers[name]={readiness:true,evidenceMatchesSource:true,eightUpdatedTransactionLinks:true,registryGeneration:1,registryRevision:2,publicPostsReadable:2,sealedPostsPresent:3,sealedBodiesHiddenFromOutsider:true,responsiveWidths:[320,390,768,1280],pageErrors:0};
  console.log(name+': live reset evidence, public conversation, sealed outsider view and registry passed');
 }finally{await browser.close();}
}
report.status='PASSED';await writeFile('hauntboard/evidence/reset-proofs-live-2026-11-04.json',JSON.stringify(report,null,2)+'\n');
