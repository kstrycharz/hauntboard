import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {request as httpRequest} from 'node:http';

const root=await mkdtemp('/companion/availability-');
const manifest={network:'esmeralda',networkByte:38,resetIdentity:'synthetic-availability',instance:'synthetic',sdkVersion:'0.7.0',wasmVersion:'0.43.0',providerRuntimeVersion:'0.45.0',compatibilityVerified:false,posterPrivacyVerified:false,schema:4,posterPrivacy:'stealth-fee-v1',board:`component_${'ab'.repeat(32)}`,template:'cd'.repeat(32)};
const configPath=join(root,'config.json'),modePath=join(root,'mode');
await writeFile(configPath,JSON.stringify(manifest));
const request=(path,{body,headers,...options}={})=>new Promise((resolve,reject)=>{
  const req=httpRequest(`http://127.0.0.1:8280${path}`,{...options,headers:{Host:'localhost:8280',...headers}},res=>{
    let text='';res.on('data',chunk=>text+=chunk);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(text)}));
  });req.on('error',reject);req.end(body===undefined?undefined:JSON.stringify(body));
});
try{
  for(const profile of ['public','client']){
    await writeFile(modePath,'healthy');
    const setup=`import {readFile} from 'node:fs/promises';
      const manifest=JSON.parse(await readFile(process.env.CONFIG_FILE,'utf8'));
      globalThis.fetch=async url=>{
        const mode=await readFile(process.env.AVAILABILITY_MODE,'utf8');
        const path=new URL(url).pathname;
        if(path==='/network')return Response.json({network:'esmeralda',network_byte:38});
        if(!path.startsWith('/substates/'))throw new Error('Diagnostic endpoint unavailable after indexer upgrade');
        if(mode==='unavailable'||(mode==='fallback'&&new URL(url).hostname==='ootle-indexer-a.tari.com'))return Response.json({}, {status:503});
        return Response.json({verified:mode!=='unverified',version:0,substate:{Component:{header:{template_address:mode==='wrong-template'?'ef'.repeat(32):manifest.template},body:{state:[mode==='legacy-schema'?3:4,true,'','Synthetic board',0,[],[],[],[],0,'',0]}}}});
      };
      await import('/app/hauntboard/server.mjs');`;
    const server=spawn(process.execPath,['--input-type=module','--eval',setup],{env:{...process.env,HAUNTBOARD_PROFILE:profile,HAUNTBOARD_TESTNET_BETA:'true',ORIGIN:profile==='public'?'https://localhost:8280':'http://localhost:8280',INDEXER_URL:'https://ootle-indexer-a.tari.com',APPROVED_PROVIDER_ORIGINS:'https://ootle-indexer-a.tari.com,https://ootle-indexer-b.tari.com',PORT:'8280',CONFIG_FILE:configPath,AVAILABILITY_MODE:modePath},stdio:['ignore','pipe','pipe']});
    let startup='';server.stdout.on('data',chunk=>startup+=chunk);server.stderr.on('data',chunk=>startup+=chunk);
    try{
      for(let i=0;i<50&&!startup.includes('listening');i++)await new Promise(r=>setTimeout(r,100));
      assert(startup.includes('listening'),startup);
      assert.equal((await request('/health/ready')).status,200,'Old runtime pin and unavailable diagnostics cannot block readable board state.');
      assert.equal((await request('/api/board')).status,200);
      await writeFile(modePath,'fallback');assert.equal((await request('/health/ready')).status,200,'Approved fallback serves readiness.');
      for(const [mode,status] of [['unavailable',503],['unverified',503],['wrong-template',409],['legacy-schema',503]]){
        await writeFile(modePath,mode);
        assert.equal((await request('/health/ready')).status,status,mode);
        assert.equal((await request('/api/board')).status,status,mode);
        const config=await request('/api/config');assert.equal(config.status,200,'Session config survives board/indexer failures.');
        assert.equal(config.body.compatibilityVerified,false);assert.equal(config.body.posterPrivacyVerified,false);
        const headers={Origin:profile==='public'?'https://localhost:8280':'http://localhost:8280','Content-Type':'application/json','X-Hauntboard-CSRF':config.body.csrf};
        assert.equal((await request('/api/indexer',{method:'POST',headers,body:{method:'GET',path:'network'}})).status,200,'Independent indexer calls do not require a board preflight.');
        assert.equal((await request('/api/indexer',{method:'POST',headers:{...headers,'X-Hauntboard-CSRF':'invalid'},body:{method:'GET',path:'network'}})).status,403,'CSRF remains enforced during upstream failures.');
      }
    }finally{
      const stopped=new Promise(resolve=>server.once('exit',resolve));server.kill('SIGTERM');await stopped;
    }
  }
  console.log('Public and client availability passed: diagnostics do not gate requests; verified state, template, schema, and CSRF checks remain enforced.');
}finally{await rm(root,{recursive:true,force:true});}
