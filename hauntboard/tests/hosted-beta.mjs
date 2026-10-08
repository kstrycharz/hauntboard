import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const origin='https://payroll-levels-sensitivity-bit.trycloudflare.com';
const board='component_ff8fd992a498d7c9b32e96fb8cb557029d2f96dbb033ae61932b45cbf9187a4b';
const ready=await fetch(`${origin}/health/ready`);assert.equal(ready.status,200,await ready.text());
const config=await (await fetch(`${origin}/api/config`)).json();
assert.equal(config.board,board);assert.equal(config.testnetBeta,true);assert.equal(config.posterPrivacyVerified,false);assert.equal(config.faucetEnabled,true);assert.equal(config.preview,undefined);
assert.equal(config.account,undefined);assert.equal(config.receiveAddress,undefined);
assert.equal((await fetch(`${origin}/api/board`)).status,200);
assert.equal((await fetch(`${origin}/api/wallet`)).status,404);
assert.equal((await fetch(`${origin}/api/browser-submit`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.goto(origin,{waitUntil:'networkidle'});
 await expect(page.locator('#provider-label')).toContainText('Esmeralda');
 await expect(page.locator('#browser-wallet-button')).toBeEnabled();
 await page.locator('#browser-wallet-button').click();
 await expect(page.locator('#browser-wallet-dialog')).toBeVisible();
 await expect(page.locator('#wallet-create-choice')).toBeVisible();
 await expect(page.locator('#wallet-create-choice')).toBeEnabled();
 await page.locator('#wallet-recover-choice').click();
 await expect(page.locator('#wallet-recovery-input')).toBeVisible();
 await expect(page.locator('#wallet-restore')).toBeEnabled();
 assert.equal(await page.locator('.deployment-preview').count(),0);
 await page.goto(`${origin}/about`,{waitUntil:'networkidle'});
 await expect(page.locator('#about-board')).toHaveText(board);
 await expect(page.locator('#about-deployment-tag')).toHaveText('ESMERALDA TESTNET BETA');
 const result={checkedAt:new Date().toISOString(),status:'PASSED',origin,board,image:'sha256:83b4a7705bafcd7f5dc562ca6719d675e6f1cdd45e6282bd71133976e3c52443',checks:['live Esmeralda witness and readable deployed board','mobile frontend wallet create/recover controls enabled','existing tunnel URL preserved','read-only preview banner removed','faucet feature enabled','backend wallet routes absent','CSRF rejects unauthorized transaction requests','public privacy verification flag remains false'],scope:'Read-only HTTP and browser UI checks. No wallet created, funds transferred, or public test content published.'};
 await writeFile('hauntboard/evidence/esmeralda-hosted-beta.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser.close();}

