import {chromium,firefox,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const report={checkedAt:new Date().toISOString(),checks:{}};
try{
  for(const [name,engine] of [['chromium',chromium],['firefox',firefox]]){
    const browser=await engine.launch();
    try{
      const context=await browser.newContext();
      await context.route('http://localhost:8280/**',async route=>{
        const headers=await route.request().allHeaders();headers.host='localhost:8280';
        await route.fulfill({response:await route.fetch({url:route.request().url().replace('http://localhost:8280','http://board-web:8280'),headers})});
      });
      const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto('http://localhost:8280/');await page.getByRole('link',{name:'About Hauntboard'}).click();
      await expect(page).toHaveURL('http://localhost:8280/about');
      await expect(page.locator('#about-board')).toHaveText(/^component_[a-f0-9]{64}$/);
      await expect(page.locator('#about-template')).toHaveText(/^[a-f0-9]{64}$/);
      await expect(page.locator('table tbody tr')).toHaveCount(8);
      await expect(page.locator('#architecture h2')).toHaveText('One board. Three places for data.');
      await expect(page.locator('.architecture-block')).toHaveCount(3);
      await expect(page.locator('.contract-stack')).toContainText('Post-page components');
      await expect(page.locator('.device-block')).toContainText('Wallet keys');
      await expect(page.locator('.relay-block')).toContainText('No post-content database');
      if(name==='chromium')await page.locator('#architecture').screenshot({path:'hauntboard/evidence/about-diagram-desktop.png'});
      await page.getByRole('link',{name:'Open board state',exact:true}).click();
      await expect(page.locator('body')).toContainText('verified');await page.goBack();
      await page.setViewportSize({width:390,height:844});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      if(name==='chromium')await page.locator('#architecture').screenshot({path:'hauntboard/evidence/about-diagram-mobile.png'});
      await page.screenshot({path:`hauntboard/evidence/about-${name}.png`,fullPage:true});
      const actualConfig=await page.evaluate(async()=>await (await fetch('/api/config')).json());
      await context.route('**/api/config',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...actualConfig,network:'esmeralda',networkByte:38,providerRuntimeVersion:'0.45.0',profile:'public',provider:'Synthetic public-profile label fixture'})}));
      await page.reload();await expect(page.locator('#architecture-network')).toHaveText('Tari Esmeralda testnet');await expect(page.locator('#about-deployment-tag')).toHaveText('ESMERALDA TESTNET');await expect(page.locator('#about-network')).toContainText('0.45.0');await expect(page.locator('#about-review-copy')).toContainText('Your unlocked browser wallet');
      await context.unroute('**/api/config');
      await context.route('**/api/config',route=>route.fulfill({status:503,contentType:'application/json',body:'{}'}));
      await page.reload();await expect(page.locator('#about-status')).toContainText('currently unavailable');
      await expect(page.locator('#inspect-board')).toBeHidden();await expect(page.locator('#storage h2')).toBeVisible();
      await expect(page.locator('#architecture')).toBeVisible();
      assert.deepEqual(errors,[]);report.checks[name]={navigation:true,liveContractLocator:true,rawState:true,storageDiagram:true,mobileOverflow:false,publicProfileLabelsUsingSyntheticConfig:true,offlineExplanation:true,noRuntimeErrors:true};
    }finally{await browser.close();}
  }report.status='PASSED';
}catch(error){report.status='FAILED';report.error=error.message;process.exitCode=1;}
await writeFile('hauntboard/evidence/about.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
