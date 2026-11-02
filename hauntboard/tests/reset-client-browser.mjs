import {chromium,firefox} from '@playwright/test';
import {createServer,request} from 'node:http';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
// Share the candidate's network namespace; preserve its canonical browser origin.
const proxy=createServer((req,res)=>{const upstream=request({hostname:'127.0.0.1',port:8280,path:req.url,method:req.method,headers:req.headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});upstream.on('error',()=>{res.writeHead(502);res.end();});req.pipe(upstream);});
await new Promise(resolve=>proxy.listen(8285,'127.0.0.1',resolve));
const report={checkedAt:new Date().toISOString(),browsers:{},scope:'Live reset board reads, fresh browser wallet/PIN recovery, native private-output stream scan. No chain writes.'};
try{for(const [name,engine] of [['chromium',chromium],['firefox',firefox]]){
 const browser=await engine.launch();try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://localhost:8285/');
  const checks=await page.evaluate(async()=>{
   const config=await(await fetch('/api/config')).json();
   const board=await(await fetch('/api/board')).json();
   if(board.schema!==4||!board.isBoard||config.resetIdentity!=='esmeralda-reset-2026-11-02')throw Error('Wrong board or reset');
   const {createApiClient}=await import('/api-client.mjs'),wallet=await import('/browser-wallet.mjs');wallet.configure(config,createApiClient({getConfig:()=>config}));
   const created=await wallet.create('604281');if(created.phrase.split(' ').length!==24)throw Error('Wallet creation failed');await wallet.confirmPhrase();
   const preview=await wallet.inspectRecovery(created.phrase,{format:'native'});if(preview.address!==created.address)throw Error('Recovery mismatch');wallet.lock();await wallet.unlock('604281');
   const scan=await wallet.syncPrivateFunds();if(!scan.complete)throw Error('Output scan did not finish');wallet.lock();
   return {schema4Board:true,newReset:true,nativeWalletCreated:true,recoveryVerified:true,pinUnlock:true,privateScanComplete:true};
  });assert.equal(errors.length,0,errors.join('\n'));report.browsers[name]=checks;console.log(`${name}: reset board, wallet recovery and native scan passed`);
 }finally{await browser.close();}
}report.status='PASSED';await writeFile('hauntboard/evidence/reset-client-browser-2026-11-02.json',JSON.stringify(report,null,2)+'\n');}finally{await new Promise(resolve=>proxy.close(resolve));}
