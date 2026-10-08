import {enterWalletCredential} from './gui-helpers.mjs';
import {chromium,firefox,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const report={checkedAt:new Date().toISOString(),scope:'Responsive browser simulation against the real local schema-4 board; physical-phone testing remains manual.',browsers:{}};
for(const [name,engine] of [['chromium',chromium],['firefox',firefox]]){
 const browser=await engine.launch();let context;
 try{
  context=await browser.newContext({hasTouch:true});
  await context.route('http://localhost:8283/**',async route=>{const headers=await route.request().allHeaders();headers.host='localhost:8283';await route.fulfill({response:await route.fetch({url:route.request().url().replace('http://localhost:8283','http://board-privacy:8280'),headers})});});
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));const checks=[];
  async function fits(label){assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${name}: ${label} page overflow`);const dialog=page.locator('dialog[open]');if(await dialog.count()){assert(await dialog.evaluate(d=>d.scrollWidth<=d.clientWidth+1),`${label} dialog overflow`);assert(await dialog.evaluate(d=>{const r=d.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight+1;}),`${label} dialog outside viewport`);}}
  for(const [width,height] of [[320,568],[360,640],[390,844],[430,932],[768,1024],[844,390]]){
   await page.setViewportSize({width,height});await page.goto('http://localhost:8283/');await expect(page.locator('#identity')).toHaveText('Browser wallet locked');await fits('board');
   for(const id of ['new-thread','browser-wallet-button','refresh','privacy-button']){const box=await page.locator(`#${id}`).boundingBox();assert(box?.height>=44,`${id} touch height at ${width}`);}
   const title=page.locator('.thread-link').first();if(await title.count()){await title.click();await expect(page.locator('#reply-body')).toBeVisible();await fits('thread');assert.equal(await page.locator('#reply-body').evaluate(e=>getComputedStyle(e).fontSize),'16px');await page.locator('.post-footer button').first().click();await expect(page.locator('#reply-body')).toBeFocused();await page.locator('#back').click();}
   await page.locator('#new-thread').click();await page.locator('#thread-title').fill('A'.repeat(80));await page.locator('#thread-body').fill('A long public message '.repeat(90));await fits('compose');assert.equal(await page.locator('#thread-title').evaluate(e=>getComputedStyle(e).fontSize),'16px');await page.locator('[data-close="compose-dialog"]').click();
   await page.locator('#browser-wallet-button').click();await page.locator('#wallet-recover-choice').click();await enterWalletCredential(page, '604281');await page.locator('#wallet-restore').scrollIntoViewIfNeeded();await fits('wallet');await page.locator('[data-close="browser-wallet-dialog"]').click();
   if(width===390)await page.screenshot({path:`hauntboard/evidence/mobile-board-${name}.png`,fullPage:true});
   await page.goto('http://localhost:8283/about#architecture');await expect(page.locator('.contract-stack')).toContainText('schema 4');await fits('about');if(width<=700){assert(await page.locator('.storage-scroll').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'Storage table must fit without sideways scrolling.');assert.equal(await page.locator('.storage-scroll tbody tr').first().evaluate(e=>getComputedStyle(e).display),'block');}
   if(width===390)await page.locator('.architecture').screenshot({path:`hauntboard/evidence/mobile-architecture-${name}.png`});checks.push({width,height,board:true,thread:true,compose:true,wallet:true,about:true,touchTargets:true});
  }
  await page.setViewportSize({width:1440,height:1000});await page.goto('http://localhost:8283/');assert.equal(await page.locator('.shell').evaluate(e=>getComputedStyle(e).display),'grid');await fits('desktop');assert.deepEqual(errors,[]);report.browsers[name]={checks,desktopPreserved:true,runtimeErrors:errors};
 }catch(error){console.error(error);throw error;}finally{await context?.unrouteAll({behavior:'ignoreErrors'});await browser.close();}
}
report.status='MOBILE_LAYOUT_PASSED';await writeFile('hauntboard/evidence/mobile-layout.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));

