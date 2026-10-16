import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {request as httpRequest} from 'node:http';
const server=spawn(process.execPath,['/app/hauntboard/server.mjs'],{env:{...process.env,HAUNTBOARD_PROFILE:'public',HAUNTBOARD_FAUCET_ENABLED:'true',ORIGIN:'https://board.example',INDEXER_URL:'https://ootle-indexer-a.tari.com',APPROVED_PROVIDER_ORIGINS:'https://ootle-indexer-a.tari.com',PORT:'8280'},stdio:['ignore','pipe','pipe']});
let startup='';server.stdout.on('data',chunk=>startup+=chunk);server.stderr.on('data',chunk=>startup+=chunk);
const request=(path,options={})=>new Promise((resolve,reject)=>{const req=httpRequest(`http://127.0.0.1:8280${path}`,{...options,headers:{Host:'board.example',...options.headers}},res=>{res.resume();res.on('end',()=>resolve({status:res.statusCode,headers:new Headers(res.headers)}));});req.on('error',reject);req.end();});
try{
 for(let i=0;i<50&&!startup.includes('listening');i++)await new Promise(r=>setTimeout(r,100));
 assert(startup.includes('public listening'),startup);
 assert.equal((await request('/health/live')).status,200);
 assert.equal((await request('/sealed-posts.mjs')).status,200,'The sealed envelope module must ship in the runtime image.');
 assert.equal((await request('/api/faucet-submit',{method:'POST'})).status,404,'Removed faucet route stays unavailable even with the legacy flag enabled.');
 assert.equal((await request('/health/ready')).status,503);
 assert.equal((await request('/',{headers:{Host:'attacker.example'}})).status,403);
 const html=await request('/');assert.equal(html.status,200);assert.equal(html.headers.get('clear-site-data'),null);assert(html.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
 for(const path of ['/api/wallet','/api/quote','/api/submit','/api/transaction'])assert.equal((await request(path)).status,404,path);
 const manifest={network:'esmeralda',networkByte:38,resetIdentity:'synthetic-smoke-reset',instance:'synthetic-smoke',sdkVersion:'0.7.0',wasmVersion:'0.43.0',providerRuntimeVersion:'0.45.0',compatibilityVerified:true,board:`component_${'ab'.repeat(32)}`,template:'cd'.repeat(32),schema:3,posterPrivacy:'stealth-fee-v1',posterPrivacyVerified:true};
 await writeFile('/companion/config.json',JSON.stringify(manifest));assert.equal((await request('/api/config')).status,503,'Legacy schema must fail closed.');
 await writeFile('/companion/config.json',JSON.stringify({...manifest,schema:4,posterPrivacyVerified:false}));assert.equal((await request('/api/config')).status,503,'Unverified privacy must fail closed.');
 const result={checkedAt:new Date().toISOString(),status:'PASSED',checks:['non-root read-only image starts without demo credentials','liveness distinct from unavailable readiness','canonical Host enforced','public demo routes absent','public navigation has no storage reset','CSP present','legacy author-retaining manifest rejected','unverified poster-privacy manifest rejected'],scope:'Local container profile smoke test; no public HTTPS or compatibility claim.'};
 if(process.env.EVIDENCE_FILE)await writeFile(process.env.EVIDENCE_FILE,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{server.kill('SIGTERM');}
