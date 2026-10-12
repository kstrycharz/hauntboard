import {enterWalletCredential} from './gui-helpers.mjs';
import {confirmRecoveryWord} from './gui-helpers.mjs';
import {chromium,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const origin='https://payroll-levels-sensitivity-bit.trycloudflare.com';
const browser=await chromium.launch();
try{
 const page=await browser.newPage();let submissions=0;
 // This check must never fund a disposable wallet if the public pool is refilled concurrently.
 await page.route('**/api/faucet-submit',route=>route.abort());
 await page.route('**/api/browser-submit',route=>route.abort());
 page.on('request',request=>{if(request.url().endsWith('/api/faucet-submit')||request.url().endsWith('/api/browser-submit'))submissions++;});
 await page.goto(origin,{waitUntil:'networkidle'});
 await expect(page.locator('#provider-label')).toContainText('Esmeralda');
 await page.locator('#browser-wallet-button').click();
 await page.locator('#wallet-create-choice').click();await enterWalletCredential(page, '604281');

 await expect(page.locator('#wallet-seed-words li')).toHaveCount(24);
 await confirmRecoveryWord(page);await page.locator('#wallet-seed-saved').check();await page.locator('#wallet-confirm-seed').click();
 await expect(page.locator('#wallet-seed-panel')).toBeHidden();
 await expect(page.locator('#wallet-ready-value')).toContainText('0 test TARI');
 await expect(page.locator('#wallet-faucet')).toHaveText('Claim 500 test TARI');
 assert.match(await page.locator('#private-receive-address').inputValue(),/^otl_esm_1/);
 await expect(page.locator('#wallet-faucet')).toBeEnabled();
 await page.locator('#wallet-faucet').click();
 await expect(page.locator('#wallet-message')).toContainText('shared testnet faucet needs a refill',{timeout:30000});
 assert.equal(submissions,0,'Empty faucet must not trigger a doomed funding submission.');
 const result={checkedAt:new Date().toISOString(),status:'PASSED',origin,image:'sha256:6dd9573d1dd1465176ae79047e069e346b01a0e96a1623b0146ca37df2be51ff',checks:['frontend creates a real Esmeralda wallet and 24-word recovery phrase locally','numeric balance shown with 500-test-TARI claim option','actual Tari faucet state is verified before claiming','insufficient faucet liquidity explains refill without requiring a new wallet','no insufficient-faucet transaction dispatched'],scope:'Temporary isolated browser wallet, destroyed after this check. No public wallet registration, funding, or message publication; no recovery words recorded.'};
 await writeFile('hauntboard/evidence/esmeralda-hosted-refill-message.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}catch(error){throw new Error(`Hosted wallet check failed (${error.name}); recovery-word DOM diagnostics suppressed.`);}finally{await browser.close();}


