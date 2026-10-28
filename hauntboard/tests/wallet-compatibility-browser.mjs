import {chromium,firefox} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const server=createServer(async(req,res)=>{
  try{
    if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Native wallet recovery compatibility</title>');return;}
    if(!/^\/(vendor\/[a-zA-Z0-9_.-]+|[a-z-]+\.(mjs|wasm))$/.test(req.url))throw Error('Path');
    res.setHeader('Content-Type',req.url.endsWith('.wasm')?'application/wasm':'text/javascript');res.end(await readFile('hauntboard/web'+req.url));
  }catch{res.writeHead(404);res.end();}
});await new Promise(resolve=>server.listen(8797,'127.0.0.1',resolve));
const report={checkedAt:new Date().toISOString(),scope:'Unfunded, browser-local creation and recovery using bundled native WASM and released SDK. Provider transport unavailable by design. No secrets exported and no chain writes.',browsers:{}};
try{for(const [name,engine] of [['chromium',chromium],['firefox',firefox]]){
  const browser=await engine.launch();
  try{
    const page=await browser.newPage();await page.goto('http://127.0.0.1:8797');
    const checks=await page.evaluate(async()=>{
      const wallet=await import('/browser-wallet.mjs');
      wallet.configure({network:'esmeralda',networkByte:38,resetIdentity:'wallet-compatibility-test',posterPrivacy:'stealth-fee-v1'},async()=>{throw Error('Synthetic provider unavailable');});
      const created=await wallet.create('604281');
      if(created.phrase.split(' ').length!==24||!wallet.needsPhraseConfirmation())throw Error('Native phrase setup failed');
      await wallet.confirmPhrase();
      const preview=await wallet.inspectRecovery(created.phrase,{format:'native'});if(preview.address!==created.address)throw Error('Preview changed address');
      wallet.lock();let rejected=false;try{await wallet.unlock('999999');}catch{rejected=true;}if(!rejected||wallet.active())throw Error('Incorrect PIN accepted');
      await wallet.unlock('604281');if(wallet.active().address!==created.address)throw Error('Unlock changed address');
      wallet.lock();const recovered=await wallet.recover(created.phrase,'604281',{format:'native'});
      if(recovered.address!==created.address)throw Error('Recovery changed address');wallet.lock();
      return {nativePhraseCreation:true,phraseConfirmation:true,recoveryPreview:true,wrongPinRejected:true,pinUnlockSameAddress:true,recoverySameAddress:true};
    });
    assert(Object.values(checks).every(Boolean));report.browsers[name]=checks;console.log(`${name}: native wallet creation, PIN and recovery compatibility passed`);
  }finally{await browser.close();}
}report.status='PASSED';await writeFile('hauntboard/evidence/wallet-compatibility-browser.json',JSON.stringify(report,null,2)+'\n');}finally{server.close();}
