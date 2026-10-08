import {chromium,firefox,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
const report={checkedAt:new Date().toISOString(),network:'localnet',checks:{}};
const proxies=[];
for(const [port,service] of [[8280,'board-web'],[8281,'board-local']]){
 const proxy=createServer(async(req,res)=>{try{const chunks=[];for await(const chunk of req)chunks.push(chunk);const upstream=await fetch(`http://${service}:${port}${req.url}`,{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks),redirect:'manual'});const headers=Object.fromEntries(upstream.headers);delete headers['content-length'];delete headers['content-encoding'];res.writeHead(upstream.status,headers);res.end(Buffer.from(await upstream.arrayBuffer()));}catch{res.writeHead(503);res.end();}});
 await new Promise(resolve=>proxy.listen(port,'127.0.0.1',resolve));proxies.push(proxy);
}
try{
 for(const [name,engine] of [['chromium',chromium],['firefox',firefox]]){
  const browser=await engine.launch();
  try{
   for(const [port,service] of [[8280,'board-web'],[8281,'board-local']]){
    const context=await browser.newContext();
    const page=await context.newPage();await page.goto(`http://localhost:${port}/`);await expect(page.locator('#thread-count')).toHaveText('0');
    await page.evaluate(async()=>{localStorage.setItem('hauntboard-hidden','["old-thread"]');sessionStorage.setItem('hauntboard-compose-draft','old draft');await new Promise((resolve,reject)=>{const r=indexedDB.open('hauntboard-browser-wallet-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('wallet');r.onsuccess=()=>{const d=r.result;const t=d.transaction('wallet','readwrite');t.objectStore('wallet').put({oldTestWallet:true},'localnet');t.oncomplete=()=>{d.close();resolve();};t.onerror=()=>reject(t.error);};r.onerror=()=>reject(r.error);});});
    await context.clearCookies();await page.goto(`http://localhost:${port}/?board=component_${'00'.repeat(32)}`);
    await expect(page).toHaveURL(`http://localhost:${port}/`);await expect(page.locator('#thread-count')).toHaveText('0');
    const storage=await page.evaluate(async()=>({oldHidden:localStorage.getItem('hauntboard-hidden'),oldDraft:sessionStorage.getItem('hauntboard-compose-draft'),hasWallet:await(await import('/browser-wallet.mjs')).exists()}));
    assert.equal(storage.oldHidden,null);assert.equal(storage.oldDraft,null);assert.equal(storage.hasWallet,false);
    await page.locator('#browser-wallet-button').click();await expect(page.locator('#browser-wallet-status')).toContainText('Create a wallet');await expect(page.locator('#wallet-create-choice')).toBeVisible();
    await page.locator('[data-close="browser-wallet-dialog"]').click();await page.reload();await expect(page.locator('#thread-count')).toHaveText('0');
    await page.screenshot({path:`hauntboard/evidence/fresh-start-${name}-${port}.png`,fullPage:true});
    const c=await page.evaluate(async()=>await(await fetch('/api/config')).json());report.board=c.board;report.template=c.template;
    report.checks[`${name}:${port}`]={emptyBoard:true,staleBoardUrlRemoved:true,localAndSessionStorageCleared:true,oldIndexedDbWalletCleared:true,newWalletCreationVisible:true,reloadReady:true};await context.close();
   }
  }finally{await browser.close();}
 }report.status='PASSED';
}catch(error){report.status='FAILED';report.error=error.message;process.exitCode=1;}
finally{await Promise.all(proxies.map(proxy=>new Promise(resolve=>proxy.close(resolve))));}
await writeFile('hauntboard/evidence/fresh-start.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));


