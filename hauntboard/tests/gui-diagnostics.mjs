// Public UI diagnostics only; do not use this while recovery words are displayed.
import {chromium} from '@playwright/test';
const browser=await chromium.launch();
try{
  const page=await browser.newPage();const errors=[];
  page.on('pageerror',error=>errors.push(error.stack));
  await page.goto(process.env.GUI_ORIGIN??'http://localhost:8286',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.body.dataset.ready==='true',{timeout:20000}).catch(()=>{});
  console.log(JSON.stringify({errors,ready:await page.locator('body').getAttribute('data-ready'),identity:await page.locator('#identity').textContent(),flash:await page.locator('#flash').textContent()}));
}finally{await browser.close();}
