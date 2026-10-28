import {chromium,firefox} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const evidence=JSON.parse(await readFile('hauntboard/evidence/room-key-esmeralda.json','utf8'));
assert.deepEqual(JSON.parse(await readFile('hauntboard/web/proof-evidence.json','utf8')),evidence,'Served evidence must match the recorded execution');
let unavailable=false;
const mime={html:'text/html',mjs:'text/javascript',css:'text/css',json:'application/json'};
const files=new Set(['proof.html','proof.mjs','proof.css','proof-evidence.json','about.css','style.css']);
const server=createServer(async(req,res)=>{
  try{
    if(req.url.startsWith('/api/key-registry?')){
      if(unavailable){res.writeHead(503);res.end();return;}
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify({address:evidence.registry,board:evidence.board,thread:evidence.thread,generation:1,revision:2}));return;
    }
    const file=req.url==='/proof'?'proof.html':req.url.slice(1);if(!files.has(file))throw Error('Path');
    res.setHeader('Content-Type',mime[file.split('.').at(-1)]);res.end(await readFile('hauntboard/web/'+file));
  }catch{res.writeHead(404);res.end();}
});await new Promise(resolve=>server.listen(8795,'127.0.0.1',resolve));
const report={checkedAt:new Date().toISOString(),scope:'Evidence page browser behavior and accessibility with explicitly simulated registry lookup; no chain writes.',browsers:{}};
try{for(const [name,engine] of [['chromium',chromium],['firefox',firefox]]){
  const browser=await engine.launch();
  try{
    const context=await browser.newContext(),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto('http://127.0.0.1:8795/proof');await page.waitForFunction(()=>document.querySelectorAll('#recorded-stages a').length===8);
    assert((await page.locator('#record-status').innerText()).includes('not rechecked their finality'));
    await page.getByRole('button',{name:'Removed reader',exact:true}).click();assert((await page.locator('#past-access').innerText()).includes('retained old keys'));assert((await page.locator('#future-access').innerText()).includes('new generation'));
    await page.getByRole('button',{name:'Invited reader',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Invited reader',exact:true}).getAttribute('aria-pressed'),'true');
    unavailable=false;await page.getByRole('button',{name:'Check current registry availability',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#registry-status').textContent.includes('generation 1, revision 2'));
    unavailable=true;await page.getByRole('button',{name:'Check current registry availability',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#registry-status').textContent.includes('does not establish current finality'));
    assert.deepEqual((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations,[]);
    for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Overflow at '+width);}
    await page.screenshot({path:`hauntboard/evidence/proof-${name}.png`,fullPage:true});assert.deepEqual(errors,[]);
    report.browsers[name]={recordMatchesSource:true,eightTransactionLinks:true,perspectiveControls:true,availabilitySuccessAndFailure:true,accessibilityViolations:0,responsiveWidths:[320,390,768,1280],pageErrors:0};
    console.log(`${name}: evidence navigation, availability, accessibility and responsive layout passed`);
  }finally{await browser.close();}
}report.status='PASSED';await writeFile('hauntboard/evidence/proof-browser.json',JSON.stringify(report,null,2)+'\n');}finally{server.close();}
