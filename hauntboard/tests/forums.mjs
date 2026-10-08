import {chromium,firefox,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin=process.env.FORUM_ORIGIN??'http://localhost:8283';
for(const [engine,type]of Object.entries({chromium,firefox})){
 const browser=await type.launch();
 try{
  for(const width of [390,1280]){
   const context=await browser.newContext({viewport:{width,height:900}}),p=await context.newPage();
   if(origin==='http://localhost:8283')await context.route('http://localhost:8283/**',async r=>{const headers=await r.request().allHeaders();headers.host='localhost:8283';await r.fulfill({response:await r.fetch({url:r.request().url().replace('http://localhost:8283','http://board-privacy:8280'),headers})});});
   await p.goto(origin);await expect(p.locator('body')).toHaveAttribute('data-ready','true',{timeout:30000});await expect(p.locator('#board-title')).toHaveText('/general/ · General');await expect(p.locator('[data-category="crypt"]')).toHaveCount(0);await expect(p.locator('#thread-category option')).toHaveCount(3);
   await p.goto(`${origin}/?category=crypt`);await expect(p.locator('body')).toHaveAttribute('data-ready','true',{timeout:30000});await expect(p.locator('#board-title')).toHaveText('/general/ · General');
   await p.goto(`${origin}/?category=tari`);await expect(p.locator('body')).toHaveAttribute('data-ready','true',{timeout:30000});await expect(p.locator('#board-title')).toHaveText('/tari/ · Tari');
   if(width===390)await p.locator('#menu-button').click();await p.locator('[data-category="general"]').click();await expect(p.locator('#board-title')).toHaveText('/general/ · General');await expect(p).toHaveURL(/category=general/);await expect(p.locator('#new-thread')).toBeEnabled({timeout:30000});
   await p.locator('#new-thread').click();await expect(p.locator('#thread-category')).toHaveValue('general');await p.locator('#thread-title').fill('Unpublished category validation');await p.locator('#thread-body').fill('This draft is never submitted.');await p.locator('#thread-category').selectOption('pol');
   const saved=await p.evaluate(()=>JSON.parse(sessionStorage.getItem('hauntboard-compose-draft')));assert.equal(saved.category,'pol');await p.locator('[data-close="compose-dialog"]').click();await p.reload();await expect(p.locator('body')).toHaveAttribute('data-ready','true',{timeout:30000});await p.locator('#new-thread').click();await expect(p.locator('#thread-category')).toHaveValue('pol');await p.locator('[data-close="compose-dialog"]').click();
   const decoded=await p.evaluate(async()=>{const c=await import('/crypto.mjs'),payload=await c.encodePost({title:'Unpublished check',name:'Ghost',body:'Not submitted',category:'tari'},0,null,[]);return(await c.decodePost(payload,0,null,[])).category;});assert.equal(decoded,'tari');
   await p.goto(`${origin}/forums`);await expect(p.locator('h1')).toContainText('Each thread');await expect(p.locator('main')).toContainText('128 threads per board');await expect(p.locator('main')).toContainText('2,048 posts per thread');assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.screenshot({path:`hauntboard/evidence/forums-${engine}-${width}.png`});await context.close();
  }
  const report={origin,engine,status:'FORUMS_UI_PASSED',checkedAt:new Date().toISOString(),checks:{generalDefault:true,cryptRemoved:true,retiredCategoryFallback:true,threeCategories:true,categoryDeepLink:true,navigation:true,composeDefault:true,draftRecovery:true,categoryPayloadRoundTrip:true,capacityPage:true,mobileAndDesktop:true},chainWrites:0};await writeFile(`hauntboard/evidence/forums-${engine}.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
 }catch(error){throw new Error(`Forum checks failed (${error.name}); no wallet diagnostics logged.`);}finally{await browser.close();}
}
