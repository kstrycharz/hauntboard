import {enterWalletCredential} from './gui-helpers.mjs';
import {confirmRecoveryWord} from './gui-helpers.mjs';
import {spawn} from 'node:child_process';
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const server=spawn(process.execPath,['hauntboard/server.mjs'],{env:{...process.env,PORT:'8290',LOCAL_BROWSER_PORT:'8290',CONFIG_FILE:'/privacy-companion/config.json',INDEXER_URL:'http://indexer:18300',HAUNTBOARD_FAUCET_ENABLED:'false'},stdio:['ignore','pipe','pipe']});let startup='';server.stdout.on('data',s=>startup+=s);server.stderr.on('data',s=>startup+=s);const browser=await chromium.launch();
try{
 for(let i=0;i<50&&!startup.includes('listening');i++)await new Promise(r=>setTimeout(r,100));assert(startup.includes('listening'),startup);
 const page=await browser.newPage();await page.goto('http://localhost:8290/');await page.locator('#browser-wallet-button').click();await page.locator('#wallet-create-choice').click();await enterWalletCredential(page, '604281');await page.locator('#wallet-create').click();await expect(page.locator('#wallet-seed-words li')).toHaveCount(24);await confirmRecoveryWord(page);await page.locator('#wallet-seed-saved').check();await page.locator('#wallet-confirm-seed').click();await expect(page.locator('#wallet-seed-panel')).toBeHidden();await expect(page.locator('#wallet-faucet')).toBeHidden();
 const result=await page.evaluate(async()=>{const c=await(await fetch('/api/config')).json(),w=await import('/browser-wallet.mjs');let blocked=false;try{await w.requestTestFunds();}catch(e){blocked=e.message.includes('disabled');}const response=await fetch('/api/faucet-submit',{method:'POST',headers:{'Content-Type':'application/json','X-Hauntboard-CSRF':c.csrf},body:'{}'});return {enabled:c.faucetEnabled,blocked,status:response.status,wallet:Boolean(w.active())};});assert.deepEqual(result,{enabled:false,blocked:true,status:404,wallet:true});console.log(JSON.stringify({status:'FAUCET_DISABLED_PASSED',checks:result}));await writeFile('hauntboard/evidence/faucet-disabled.json',JSON.stringify({checkedAt:new Date().toISOString(),status:'FAUCET_DISABLED_PASSED',checks:result},null,2)+'\n');
}finally{server.kill('SIGTERM');await browser.close();}

