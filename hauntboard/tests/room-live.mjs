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
    await expect(page.getByRole('link',{name:'Try the privacy demonstration'})).toHaveCount(0);
    await page.getByRole('button',{name:'Set up room access',exact:true}).click();await expect(page.locator('#room-recovery-code')).toBeVisible();
    const secret=await page.locator('#room-recovery-code').inputValue();assert.match(secret,/^[A-Za-z0-9_-]{43}$/);
    await expect(page.getByRole('button',{name:'Continue to room access',exact:true})).toBeDisabled();
    const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Download access backup',exact:true}).click();await downloaded;
    await page.getByLabel('I saved my recovery code separately from the backup file.').check();await page.getByRole('button',{name:'Continue to room access',exact:true}).click();
    await page.getByRole('button',{name:'Get an invitation',exact:true}).click();await page.getByLabel('Name to show your contact').fill('Live browser check');await page.getByRole('button',{name:'Create access request',exact:true}).click();await expect(page.getByRole('button',{name:'Copy access request',exact:true})).toBeVisible();
    assert((await page.locator('#room-output').inputValue()).startsWith('hauntboard-access-v1.'));
    await page.screenshot({path:`hauntboard/evidence/room-access-live-${name}.png`,fullPage:true});
    for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Room access overflow at '+width);}
    await page.getByRole('button',{name:'Lock room access',exact:true}).click();await expect(page.getByRole('button',{name:'Unlock room access',exact:true})).toBeVisible();
    await page.getByLabel('Recovery code',{exact:true}).fill(secret);await page.getByRole('button',{name:'Unlock room access',exact:true}).click();await expect(page.getByRole('button',{name:'Get an invitation',exact:true})).toBeVisible();
    for(const path of ['/privacy-demo','/room-demo.mjs','/room-demo.css','/room-demo-evidence.json'])assert.equal((await page.request.get(origin+path)).status(),404,path);
    for(const file of ['room-manager.mjs','room-access-request.mjs','room-keys.mjs','room-vault.mjs','key-registry.mjs','provider-state.mjs','vendor/hpke.mjs']){
      const r=await page.request.get(origin+'/'+file);assert(r.ok(),file);assert.equal(createHash('sha256').update(await r.body()).digest('hex'),createHash('sha256').update(await readFile('hauntboard/web/'+file)).digest('hex'),file);
    }
    assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);report.browsers[name]={ready:true,pinnedRegistry:true,currentRegistryReadable:true,guidedRecoverySetup:true,mainUiRequestAndUnlock:true,demoRemoved:true,mobileOverflow:false,pageErrors:0,assetHashesMatch:true};
    console.log(name+': live guided room access, demo removal and assets passed');
  }finally{await browser.close();}
}
await writeFile(process.env.ROOM_EVIDENCE_FILE??'hauntboard/evidence/room-live.json',JSON.stringify(report,null,2)+'\n');
