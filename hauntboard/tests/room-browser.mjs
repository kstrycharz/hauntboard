// Real Chromium/Firefox WebCrypto and storage; registry transport is simulated.
import {chromium,firefox} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin='http://localhost:8793';
const server=createServer(async(req,res)=>{try{
  if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Room cryptography test</title><dialog id="room-dialog"><h1>Room access</h1><p id="room-status"></p><div id="room-controls"></div></dialog>');return;}
  if(req.url==='/browser-wallet.mjs'){res.setHeader('Content-Type','text/javascript');res.end(`export function active(){return {address:'synthetic-wallet'};}export function newRoomAdmin(){return {owner:'${'11'.repeat(32)}',view:'${'22'.repeat(32)}',publicKey:'${'33'.repeat(32)}'};}`);return;}
  if(!/^\/(vendor\/[A-Za-z0-9_.-]+|[a-z-]+\.mjs)$/.test(req.url))throw Error('Path');
  res.setHeader('Content-Type','text/javascript');res.end(await readFile('hauntboard/web'+req.url));
}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(8793,r));
const report={checkedAt:new Date().toISOString(),scope:'Real browser cryptography, encrypted recovery and Web Locks; no network spends.',browsers:{}};
try{for(const[name,engine]of[['chromium',chromium],['firefox',firefox]]){
  const browser=await engine.launch();
  try{
    const aliceContext=await browser.newContext(),bobContext=await browser.newContext(),eveContext=await browser.newContext();
    const alice=await aliceContext.newPage(),bob=await bobContext.newPage(),eve=await eveContext.newPage();
    await Promise.all([alice,bob,eve].map(p=>p.goto(origin)));
    const setup=async page=>page.evaluate(async()=>{
      window.p={network:'esmeralda',networkByte:38,resetIdentity:'browser-test'};window.board=`component_${'a'.repeat(64)}`;window.thread=`component_${'b'.repeat(64)}`;
      window.rooms=await import('/room-keys.mjs');window.vault=await import('/room-vault.mjs');window.secret=await vault.createRoomVault(p);
      window.scope=rooms.roomScope(p,board,thread);window.identity=await rooms.recipientIdentity(scope);
      await vault.setRoomRecord(p,thread,{scope,identity,keys:[],members:[]});return rooms.recipientRequest(identity);
    });
    const [ar,br,er]=await Promise.all([setup(alice),setup(bob),setup(eve)]);
    const envelope=await alice.evaluate(async request=>{window.keys=[{generation:0,key:rooms.newRecoverySecret()}];return rooms.wrapRoomKeys(request,scope,0,keys);},br);
    assert(await bob.evaluate(async envelope=>{window.keys=await rooms.unwrapRoomKeys(envelope,identity,scope,0);await vault.setRoomRecord(p,thread,{scope,identity,keys,members:[]});return keys.length===1;},envelope));
    assert(await eve.evaluate(async envelope=>{try{await rooms.unwrapRoomKeys(envelope,identity,scope,0);return false;}catch{return true;}},envelope));
    const backup=await bob.evaluate(()=>({encrypted:vault.exportRoomVault(p),secret}));
    const cleanContext=await browser.newContext(),clean=await cleanContext.newPage();await clean.goto(origin);
    assert(await clean.evaluate(async backup=>{const vault=await import('/room-vault.mjs');const p={network:'esmeralda',networkByte:38,resetIdentity:'browser-test'};await vault.unlockRoomVault(p,backup.secret,backup.encrypted);return Boolean(vault.roomRecord(p,`component_${'b'.repeat(64)}`).identity.privateKey.d);},backup));
    const rotations=await alice.evaluate(async request=>{window.next=rooms.nextGeneration(keys);return rooms.rotationEnvelopes([request],scope,next);},ar);
    assert(await bob.evaluate(async envelope=>{try{await rooms.unwrapRoomKeys(envelope,identity,scope,1);return false;}catch{return true;}},rotations[0]));
    const tab=await bobContext.newPage();await tab.goto(origin);await tab.evaluate(async secret=>{const v=await import('/room-vault.mjs');window.v=v;window.p={network:'esmeralda',networkByte:38,resetIdentity:'browser-test'};await v.unlockRoomVault(p,secret);},backup.secret);
    await bob.evaluate(()=>vault.lockRoomVault());await tab.waitForFunction(()=>!v.roomVaultActive());
    // Simultaneous creation in an empty origin: exactly one write may succeed.
    const raceContext=await browser.newContext(),r1=await raceContext.newPage(),r2=await raceContext.newPage();await Promise.all([r1.goto(origin),r2.goto(origin)]);
    const result=await Promise.all([r1,r2].map(page=>page.evaluate(async()=>{const v=await import('/room-vault.mjs');try{await v.createRoomVault({network:'esmeralda',resetIdentity:'race'});return true;}catch{return false;}})));
    assert.equal(result.filter(Boolean).length,1);
    // Exercise the actual management controls and durable staged-action promotion.
    await alice.evaluate(async()=>{
      const {createRoomManager}=await import('/room-manager.mjs');
      p.keyRegistryTemplate='f'.repeat(64);window.state=null;window.reviewed=null;window.registryAddress=`component_${'c'.repeat(64)}`;
      window.manager=createRoomManager({api:async()=>state,review:async(body,context)=>{reviewed={body,context};},legacyKey:async()=>keys[0].key,refresh:async()=>{},openDialog:id=>document.getElementById(id).showModal(),pending:()=>false});
      window.threadView={address:thread,board,title:'Synthetic room',posts:[]};await manager.open(threadView,p);
    });
    await alice.getByRole('button',{name:'Enable managed access for future messages',exact:true}).click();
    await alice.waitForFunction(()=>reviewed?.body.action==='new');
    assert(await alice.evaluate(async()=>{
      state={address:registryAddress,scope:reviewed.body.scope,board,thread,admin:reviewed.body.admin,generation:0,revision:0,generations:[reviewed.body.envelopes]};
      await manager.finish(p,reviewed.context.roomAction,{components:[registryAddress]});
      return vault.roomRecord(p,thread).registry===registryAddress&&!vault.roomRecord(p,thread).pending;
    }));
    await alice.evaluate(async()=>{document.getElementById('room-dialog').close();await manager.open(threadView,p);});
    await alice.getByLabel('Recipient request JSON').fill(JSON.stringify(br));
    await alice.getByRole('button',{name:'Review invitation for this recipient',exact:true}).click();
    await alice.waitForFunction(()=>reviewed?.body.action==='grant');
    await alice.evaluate(async()=>{
      state.generations[0].push(...reviewed.body.envelopes);state.revision=1;await manager.finish(p,reviewed.context.roomAction,{});
      document.getElementById('room-dialog').close();await manager.open(threadView,p);
    });
    await alice.getByLabel(br.id,{exact:true}).uncheck();
    await alice.getByRole('button',{name:'Review removal and key rotation',exact:true}).click();
    await alice.waitForFunction(()=>reviewed?.body.action==='rotate');
    assert(await alice.evaluate(async bobId=>{
      state.generations.push(reviewed.body.envelopes);state.generation=1;state.revision=2;await manager.finish(p,reviewed.context.roomAction,{});
      const r=vault.roomRecord(p,thread);return r.generation===1&&!r.members.some(m=>m.id===bobId);
    },br.id));
    report.browsers[name]={recipientDelivery:true,outsiderDenied:true,cleanBrowserRecovery:true,removedRecipientDenied:true,crossTabLock:true,concurrentCreationSafe:true,managementUiCreateGrantAndRotate:true};
    console.log(name+': room recovery and recipient isolation passed');
  }finally{await browser.close();}
}report.status='PASSED';await writeFile('hauntboard/evidence/room-browser.json',JSON.stringify(report,null,2)+'\n');}finally{server.close();}
