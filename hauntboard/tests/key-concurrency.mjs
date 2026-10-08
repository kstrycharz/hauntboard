import {chromium,firefox} from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const report={checkedAt:new Date().toISOString(),checks:{}};
for(const [name,engine] of [['Chromium',chromium],['Firefox',firefox]]){
  const browser=await engine.launch();
  try{
    const context=await browser.newContext();
    await context.route('http://localhost:8280/**',async route=>{const headers=await route.request().allHeaders();headers.host='localhost:8280';await route.fulfill({response:await route.fetch({url:route.request().url().replace('http://localhost:8280','http://board-web:8280'),headers})});});
    const page=await context.newPage();await page.goto('http://localhost:8280/');
    const ok=await page.evaluate(async()=>{
      const c=await import('/crypto.mjs');const entries=Array.from({length:20},(_,i)=>({thread:`component_${i.toString(16).padStart(64,'0')}`,key:c.newThreadKey()}));
      await Promise.all(entries.map(e=>c.saveKey(e.thread,e.key)));
      const keys=await Promise.all(entries.map(e=>c.loadKey(e.thread)));return keys.every((key,i)=>key===entries[i].key);
    });assert(ok);report.checks[`${name}ConcurrentFirstKeyWritesRecover`]=true;
  }finally{await browser.close();}
}
report.status='PASSED';await writeFile('hauntboard/evidence/key-concurrency.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
