import { chromium, firefox } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const server=createServer(async(req,res)=>{
  try {
    if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Vault persistence regression</title>');return;}
    if(!/^\/(vendor\/[A-Za-z0-9_.-]+|[a-z-]+\.mjs)$/.test(req.url))throw Error('Path');
    res.setHeader('Content-Type','text/javascript');res.end(await readFile('hauntboard/web'+req.url));
  }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(8794,'127.0.0.1',resolve));
const report={checkedAt:new Date().toISOString(),scope:'Real browser storage, Web Locks and WebCrypto; no chain writes.',browsers:{}};
try {
  for(const [name,engine] of [['chromium',chromium],['firefox',firefox]]){
    const browser=await engine.launch();
    try {
      const page=await browser.newPage();await page.goto('http://127.0.0.1:8794');
      const checks=await page.evaluate(async()=>{
        const v=await import('/room-vault.mjs'),p={network:'esmeralda',resetIdentity:'vault-regression'};
        const a=`component_${'a'.repeat(64)}`,b=`component_${'b'.repeat(64)}`;
        const storageKey=`hauntboard-room-vault:${v.vaultScope(p)}`;
        const expect=(condition,message)=>{if(!condition)throw Error(message);};
        const rejects=async fn=>{let failed=false;try{await fn();}catch{failed=true;}expect(failed,'Expected rejection');};
        const secret=await v.createRoomVault(p);
        await v.setRoomRecord(p,a,{keys:['original']});
        const detached=v.roomRecord(p,a);detached.keys.push('unsaved');
        expect(v.roomRecord(p,a).keys.length===1,'Reads must not mutate saved records');
        const originalSet=Storage.prototype.setItem;
        Storage.prototype.setItem=function(key,value){if(key===storageKey)throw new DOMException('Synthetic storage full','QuotaExceededError');return originalSet.call(this,key,value);};
        try{await rejects(()=>v.setRoomRecord(p,a,{keys:['not saved']}));}finally{Storage.prototype.setItem=originalSet;}
        expect(v.roomRecord(p,a).keys[0]==='original','Failed writes must preserve active keys');
        await Promise.all([v.setRoomRecord(p,a,{keys:['saved A']}),v.setRoomRecord(p,b,{keys:['saved B']})]);
        expect(v.roomRecord(p,a).keys[0]==='saved A'&&v.roomRecord(p,b).keys[0]==='saved B','Concurrent saves must preserve both rooms');
        const saved=localStorage.getItem(storageKey),backup=v.exportRoomVault(p);
        const originalEncrypt=crypto.subtle.encrypt;
        crypto.subtle.encrypt=async function(...args){const result=await originalEncrypt.apply(this,args);v.lockRoomVault(false);return result;};
        try{await rejects(()=>v.setRoomRecord(p,a,{keys:['after lock']}));}finally{crypto.subtle.encrypt=originalEncrypt;}
        expect(!v.roomVaultActive()&&localStorage.getItem(storageKey)===saved,'In-flight encryption must respect locking');
        const originalDecrypt=crypto.subtle.decrypt;
        crypto.subtle.decrypt=async function(...args){const result=await originalDecrypt.apply(this,args);v.lockRoomVault(false);return result;};
        try{await rejects(()=>v.unlockRoomVault(p,secret));}finally{crypto.subtle.decrypt=originalDecrypt;}
        expect(!v.roomVaultActive(),'An in-flight unlock must not undo locking');
        await v.unlockRoomVault(p,secret);
        Storage.prototype.setItem=function(key,value){if(key===storageKey)throw Error('Synthetic failed restore');return originalSet.call(this,key,value);};
        try{await rejects(()=>v.unlockRoomVault(p,secret,backup));}finally{Storage.prototype.setItem=originalSet;}
        expect(v.roomRecord(p,a).keys[0]==='saved A'&&localStorage.getItem(storageKey)===saved,'Failed restore must retain the old session and backup');
        localStorage.setItem(storageKey,JSON.stringify({...backup,changed:true}));
        let exportRejected=false;try{v.exportRoomVault(p);}catch{exportRejected=true;}
        expect(exportRejected,'Do not export another tab\'s unseen changes');
        localStorage.setItem(storageKey,saved);v.lockRoomVault(false);
        const q={...p,resetIdentity:'creation-failure'},qKey=`hauntboard-room-vault:${v.vaultScope(q)}`;
        Storage.prototype.setItem=function(key,value){if(key===qKey)throw Error('Synthetic create failure');return originalSet.call(this,key,value);};
        try{await rejects(()=>v.createRoomVault(q));}finally{Storage.prototype.setItem=originalSet;}
        expect(!v.roomVaultActive()&&!localStorage.getItem(qKey),'Failed creation must not activate an unsaved vault');
        return {detachedRecords:true,failedWriteRollback:true,serializedWrites:true,lockDuringSave:true,lockDuringUnlock:true,failedRestoreRollback:true,staleExportRejected:true,failedCreationRollback:true};
      });
      assert.equal(Object.keys(checks).length,8);report.browsers[name]=checks;console.log(`${name}: 8 vault persistence regressions passed`);
    }finally{await browser.close();}
  }
  report.status='PASSED';await writeFile('hauntboard/evidence/vault-browser.json',JSON.stringify(report,null,2)+'\n');
}finally{server.close();}
