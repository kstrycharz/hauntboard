// Public HTTPS verification. Blocks every transaction/faucet submission.
import {chromium,firefox,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const origin=process.env.GUI_ORIGIN??'https://hauntboard.taritracker.com';
const evidence=JSON.parse(await readFile('hauntboard/evidence/room-key-esmeralda.json'));
const report={status:'PASSED',origin,checkedAt:new Date().toISOString(),chainWrites:0,browsers:{}};
for(const[name,engine]of[['chromium',chromium],['firefox',firefox]]){
  const browser=await engine.launch();try{
    const page=await browser.newPage({viewport:{width:1280,height:950}}),errors=[],blocked=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route(/\/api\/(browser-submit|faucet-claim|faucet-submit|submit)(\?|$)/,route=>{blocked.push(route.request().url());return route.abort();});
    const ready=await page.request.get(origin+'/health/ready');assert.equal(ready.status(),200);
    const config=await(await page.request.get(origin+'/api/config')).json();assert.equal(config.keyRegistryTemplate,evidence.template);
    const registry=await(await page.request.get(origin+'/api/key-registry?address='+evidence.registry)).json();assert.equal(registry.generation,1);assert.equal(registry.revision,2);
    await page.goto(origin+'/?board='+evidence.board+'&thread='+evidence.thread);await page.waitForFunction(()=>document.body.dataset.ready==='true');
    await expect(page.getByRole('button',{name:'Room access',exact:true})).toBeVisible();await page.getByRole('button',{name:'Room access',exact:true}).click();
    await page.getByRole('button',{name:'Create room vault',exact:true}).click();await expect(page.locator('#room-output')).toBeVisible();
    const secret=await page.locator('#room-output').inputValue();assert.match(secret,/^[A-Za-z0-9_-]{43}$/);
    await page.getByRole('button',{name:'Create my recipient request',exact:true}).click();const request=JSON.parse(await page.locator('#room-output').inputValue());assert.equal(request.format,'hauntboard-recipient');
    await page.getByRole('button',{name:'Lock room vault',exact:true}).click();await expect(page.getByRole('button',{name:'Unlock or restore room vault',exact:true})).toBeVisible();
    await page.getByLabel('Room recovery secret',{exact:true}).fill(secret);await page.getByRole('button',{name:'Unlock or restore room vault',exact:true}).click();await expect(page.getByRole('button',{name:'Create my recipient request',exact:true})).toBeVisible();
    await page.goto(origin+'/privacy-demo');
    for(const id of ['demo-start','demo-invite','demo-recover','demo-remove','demo-next']){await expect(page.locator('#'+id)).toBeEnabled();await page.locator('#'+id).click();}
    await expect(page.locator('#demo-status')).toContainText('Complete:');await expect(page.locator('#demo-bob')).toContainText('rejected');
    await expect(page.locator('#demo-receipts li')).toHaveCount(8);
    await page.screenshot({path:`hauntboard/evidence/room-demo-live-${name}.png`,fullPage:true});
    for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Demo overflow at '+width);}
    for(const file of ['room-manager.mjs','room-keys.mjs','room-vault.mjs','key-registry.mjs','provider-state.mjs','room-demo.mjs','vendor/hpke.mjs']){
      const r=await page.request.get(origin+'/'+file);assert(r.ok(),file);assert.equal(createHash('sha256').update(await r.body()).digest('hex'),createHash('sha256').update(await readFile('hauntboard/web/'+file)).digest('hex'),file);
    }
    assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);report.browsers[name]={ready:true,pinnedRegistry:true,currentRegistryReadable:true,mainUiVaultRequestAndUnlock:true,interactiveDemoCompleted:true,receiptLinks:8,mobileOverflow:false,pageErrors:0,assetHashesMatch:true};
    console.log(name+': live room UI, demo and assets passed');
  }finally{await browser.close();}
}
await writeFile('hauntboard/evidence/room-live.json',JSON.stringify(report,null,2)+'\n');
