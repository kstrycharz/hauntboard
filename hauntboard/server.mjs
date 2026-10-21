// Loopback-only local wallet companion. Full post content comes from Tari, with no content DB.
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {rpc,verifyWallet,quoteCall,submitCall,getSubstate,bytesVar,textVar,quoteTip,atomicJson,COMPONENT,NATIVE} from './lib/chain.mjs';
import {decodeState} from './lib/state.mjs';
import {serverProfile,TARI_TESTNET_PROVIDERS} from './lib/server-profile.mjs';
import {networkProfile} from './web/network-profile.mjs';
import {Relay} from './lib/relay.mjs';
import {testnetBeta,validatePublicManifest} from './lib/release-mode.mjs';
import {transactionIdentity} from './web/transaction-identity.mjs';
import {Faucet} from './lib/faucet.mjs';
import {decodeRegistry} from './web/key-registry.mjs';

const runtime=serverProfile(process.env),publicMode=runtime.profile!=='local';
const beta=testnetBeta(process.env);
const faucet=process.env.FAUCET_API_KEY && process.env.HAUNTBOARD_FAUCET_ENABLED!=='false' ? new Faucet({key:process.env.FAUCET_API_KEY}) : null;
const relay=new Relay('/companion/browser-operations');
const role=process.env.ROLE??'sender';
if(!['sender','receiver'].includes(role))throw new Error('INVALID_LOCAL_ROLE');
const port=runtime.port;
const configPath=process.env.CONFIG_FILE??'/companion/config.json';
const indexer=runtime.indexer;
const faucetDiscoveryOrigin=process.env.FAUCET_DISCOVERY_ORIGIN??'https://testnet-faucet.taritracker.com';
if(!['https://testnet-faucet.taritracker.com','http://testnet-faucet:8290'].includes(faucetDiscoveryOrigin))throw new Error('UNAPPROVED_FAUCET_DISCOVERY_ORIGIN');
const boardReadFallbacks=publicMode?TARI_TESTNET_PROVIDERS.filter(p=>p!==indexer&&(process.env.APPROVED_PROVIDER_ORIGINS??'').split(',').includes(p)):[];
const siteRoot=fileURLToPath(new URL('./web/',import.meta.url));
const csrf=randomBytes(32).toString('hex');
const quotes=new Map();
const inflight=new Map();
let signing=false;
let activeRequests=0,requestWindow=Date.now(),requestCount=0;
await mkdir('/companion/operations',{recursive:true});
const allowedHosts=runtime.hosts;
const knownFiles=new Map([['/','index.html'],['/index.html','index.html'],['/forums','forums.html'],['/about','about.html'],['/about.mjs','about.mjs'],['/about.css','about.css'],['/app.mjs','app.mjs'],['/crypto.mjs','crypto.mjs'],['/style.css','style.css']]);
knownFiles.set('/vendor/wallet-sdk.mjs','vendor/wallet-sdk.mjs');
knownFiles.set('/vendor/wallet-recovery-glue.mjs','vendor/wallet-recovery-glue.mjs');
knownFiles.set('/browser-wallet.mjs','browser-wallet.mjs');
knownFiles.set('/pin-entry.mjs','pin-entry.mjs');
knownFiles.set('/api-client.mjs','api-client.mjs');
knownFiles.set('/post-proof.mjs','post-proof.mjs');
knownFiles.set('/sealed-posts.mjs','sealed-posts.mjs');
knownFiles.set('/mobile.css','mobile.css');
knownFiles.set('/network-profile.mjs','network-profile.mjs');
knownFiles.set('/stealth-fee.mjs','stealth-fee.mjs');
knownFiles.set('/wallet-recovery.mjs','wallet-recovery.mjs');
knownFiles.set('/wallet-recovery.wasm','wallet-recovery.wasm');
knownFiles.set('/transaction-identity.mjs','transaction-identity.mjs');
knownFiles.set('/transaction-identity.wasm','transaction-identity.wasm');
knownFiles.set('/output-ledger.mjs','output-ledger.mjs');
knownFiles.set('/faucet-discovery.mjs','faucet-discovery.mjs');
knownFiles.set('/faucet-client.mjs','faucet-client.mjs');
for(const name of ['room-keys.mjs','room-vault.mjs','room-manager.mjs','key-registry.mjs','vendor/hpke.mjs'])knownFiles.set('/'+name,name);
knownFiles.set('/provider-state.mjs','provider-state.mjs');
for(const [route,name]of [['/privacy-demo','room-demo.html'],['/room-demo.mjs','room-demo.mjs'],['/room-demo.css','room-demo.css'],['/room-demo-evidence.json','room-demo-evidence.json']])knownFiles.set(route,name);
knownFiles.set('/vendor/hpke-LICENSE.txt','vendor/hpke-LICENSE.txt');
const mime={json:'application/json; charset=utf-8',html:'text/html; charset=utf-8',mjs:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',wasm:'application/wasm'};
const error=(message,status=400)=>Object.assign(new Error(message),{status});
async function config(){
  const c=JSON.parse(await readFile(configPath,'utf8'));
  const p=networkProfile(publicMode?c:{network:c.network,networkByte:16,resetIdentity:c.instance});
  if(!COMPONENT.test(c.board)||!/^[a-f0-9]{64}$/.test(c.template??''))throw error('Network manifest is incomplete.',503);
  if(publicMode)try{validatePublicManifest(c,beta);}catch(e){throw error(e.message,503);}
  return {...c,...p};
}
// Readiness follows usable board state, not indexer release/diagnostic metadata.
async function ready(){const c=await config();if(!publicMode){const r=await fetch(`${indexer}/network`,{redirect:'error',signal:AbortSignal.timeout(5000)});const n=await r.json();if(!r.ok||n.network!==c.network||n.network_byte!==c.networkByte)throw error('Provider network mismatch.',503);}await readState(c,c.board);return c;}
const templates=c=>[c.template,...(c.legacyTemplates??[])];
async function readState(c,address){const state=decodeState(await getSubstate(indexer,address,templates(c),boardReadFallbacks),address);if(publicMode&&state.schema!==4)throw error('This public profile requires the no-author schema-4 contract.',503);return state;}
async function readThread(c,address,before){
  const thread=await readState(c,address);
  if(thread.isBoard||thread.pageOwner)throw error('This address is not a thread.');
  if(thread.schema===2)return {...thread,nextBefore:null};
  const end=before===null?thread.postCount:Math.min(Number(before),thread.postCount);
  if(!Number.isInteger(end)||end<1)throw error('Invalid history cursor.');
  const last=Math.floor((end-1)/16),first=Math.max(0,last-1);
  const selected=[...new Set([0,first,last])];
  const pages=await Promise.all(selected.map(async i=>{
    const page=await readState(c,thread.pages[i]);
    if(page.schema!==thread.schema||page.pageOwner!==address||page.pageStart!==i*16||page.board!==thread.board||page.mode!==thread.mode||JSON.stringify(page.uid)!==JSON.stringify(thread.uid))throw error('Invalid on-chain post page.');
    return page;
  }));
  const posts=pages.flatMap(page=>page.posts.filter(p=>p.index===0||(p.index>=first*16&&p.index<end)));
  return {...thread,posts:posts.sort((a,b)=>a.index-b.index),nextBefore:first>0?first*16:null};
}
function json(res,body,status=200){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));}
async function input(req){
  let size=0;const chunks=[];
  for await(const chunk of req){size+=chunk.length;if(size>200000)throw error('Request is too large.',413);chunks.push(chunk);}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw error('Invalid request.');}
}
function byteInput(value,length){if(!Array.isArray(value)||value.length!==length||!value.every(x=>Number.isInteger(x)&&x>=0&&x<=255))throw error('Invalid post identity.');return value;}
function payloadInput(value){if(!Array.isArray(value)||value.length<1||value.length>4096||!value.every(x=>Number.isInteger(x)&&x>=0&&x<=255))throw error('Post envelope must be between 1 and 4096 bytes.');return value;}
function checkPublic(payload,title){
  let p;try{p=JSON.parse(Buffer.from(payload).toString('utf8'));}catch{throw error('Public post is malformed.');}
  if(p.v!==1||typeof p.body!=='string'||!p.body.trim()||p.body.length>3000||typeof p.name!=='string'||p.name.length>40||typeof p.title!=='string'||p.title.length>80)throw error('Invalid public post.');
  if(title!==undefined&&title!==p.title)throw error('Public thread title does not match.');
  if(p.category!==undefined&&!['tari','general','pol'].includes(p.category))throw error('Choose a supported forum category.');
}
function checkSecret(payload){let p;try{p=JSON.parse(Buffer.from(payload).toString('utf8'));}catch{throw error('Secret envelope is malformed.');}if(p.v!==1||p.alg!=='A256GCM'||typeof p.iv!=='string'||typeof p.ct!=='string'||p.iv.length!==16||!(/^[A-Za-z0-9_-]+$/).test(p.ct))throw error('Encrypt the secret before submitting.');}
async function makeQuote(c,body){
  const kind=body.kind;
  let prepared,target,payloadMode,identity;
  if(kind==='thread'){
    const uid=byteInput(body.uid,16);const payload=payloadInput(body.payload);
    if(!COMPONENT.test(body.board))throw error('Invalid board address.');
    const board=await readState(c,body.board);if(!board.isBoard)throw error('This address is not a board.');
    if(![0,1].includes(body.mode)||typeof body.title!=='string'||Buffer.byteLength(body.title)>80||!body.title.trim())throw error('Invalid title or mode.');
    if(body.mode===1){if(body.title!=='Sealed thread')throw error('Secret titles must be encrypted.');checkSecret(payload);}else checkPublic(payload,body.title);
    const dependencies=[],existing=board.threads.find(t=>JSON.stringify(t.uid)===JSON.stringify(uid));
    if(existing){dependencies.push(existing.address);const thread=await readState(c,existing.address);if(thread.pages[0])dependencies.push(thread.pages[0]);}
    prepared=await quoteCall(c,'let board=var!["board"];board.create_thread(var!["title"],var!["mode"],var!["uid"],var!["payload"]);',{board:body.board,title:textVar(body.title),mode:`${body.mode}u8`,uid:bytesVar(uid),payload:bytesVar(payload)},'',dependencies);
    target=body.board;payloadMode=body.mode;identity=Buffer.from(uid).toString('hex');
  }else if(kind==='reply'){
    if(!COMPONENT.test(body.thread))throw error('Invalid thread address.');
    const thread=await readState(c,body.thread);if(thread.isBoard||thread.pageOwner)throw error('Replies belong in a thread.');
    const nonce=byteInput(body.nonce,16);const payload=payloadInput(body.payload);
    const parent=body.parent;
    if(parent!==null&&(!Number.isInteger(parent)||parent<0||parent>=thread.postCount))throw error('Invalid reply target.');
    thread.mode===1?checkSecret(payload):checkPublic(payload);
    const hint=JSON.stringify(nonce)===JSON.stringify(thread.uid)?0:Buffer.from(nonce).readUInt32LE(0);
    const dependencies=thread.schema===3&&thread.pages[hint]?[thread.pages[hint]]:[];
    prepared=await quoteCall(c,'let thread=var!["thread"];thread.append(var!["nonce"],var!["parent"],var!["payload"]);',{thread:body.thread,nonce:bytesVar(nonce),parent:`${parent===null?-1:parent}i32`,payload:bytesVar(payload)},'',dependencies);
    target=body.thread;payloadMode=thread.mode;identity=Buffer.from(nonce).toString('hex');
  }else if(kind==='tip'){
    if(typeof body.destination!=='string'||!body.destination.startsWith('otl_loc_1')||body.destination.length>140)throw error('Use a valid localnet receive address.');
    if(typeof body.amount!=='string'||!(/^[1-9][0-9]{0,8}$/).test(body.amount)||BigInt(body.amount)>10000000n)throw error('The PoC tip limit is 10 test TARI.');
    if(typeof body.operation!=='string'||!(/^[a-f0-9]{32}$/).test(body.operation))throw error('Invalid tip operation.');
    prepared=await quoteTip(c,body.destination,body.amount);
    target='private transfer';identity=body.operation;
  }else throw error('Unknown action.');
  for(const [id,q] of quotes)if(q.expiresAt<Date.now())quotes.delete(id);
  if(quotes.size>=50)throw error('Too many pending fee reviews. Try again shortly.',429);
  const id=randomUUID();
  // Preserve nonce-level retry protection across reloads/restarts. No content or tip recipient in this journal.
  const operation=createHash('sha256').update(`${kind}|${target}|${identity}`).digest('hex');
  const fingerprint=createHash('sha256').update(JSON.stringify(body)).digest('hex');
  quotes.set(id,{kind,prepared,target,payloadMode,operation,fingerprint,expiresAt:Date.now()+120000});
  return {id,kind,target,maxFee:prepared.maxFee??prepared.max_fee,mode:payloadMode,operation,expiresAt:Date.now()+120000};
}
async function sendQuote(c,id){
  const q=quotes.get(id);if(!q||q.expiresAt<Date.now())throw error('Fee review expired. Review the fee again.',409);
  if(inflight.has(q.operation)){
    const existing=inflight.get(q.operation);
    if(existing.fingerprint!==q.fingerprint)throw error('An operation with this identity is already submitting different content.',409);
    return existing.promise;
  }
  const path=`/companion/operations/${q.operation}.json`;
  let prior;try{prior=JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(prior){
    if(prior.fingerprint!==q.fingerprint)throw error('This operation identity was already used with different content.',409);
    if(prior.tx)return {transactionId:prior.tx,operation:q.operation,reused:true};
    throw error('A previous submission has an unknown outcome. Inspect wallet history before another attempt.',409);
  }
  if(signing)throw error('Another wallet operation is submitting. Wait for its response.',409);
  signing=true;
  const work=(async()=>{
    await atomicJson(path,{kind:q.kind,fingerprint:q.fingerprint,status:'submitting'});
    const sent=q.kind==='tip'?await rpc(c,'accounts.stealth_transfer',q.prepared):await submitCall(c,q.prepared);
    await atomicJson(path,{kind:q.kind,fingerprint:q.fingerprint,status:'submitted',tx:sent.transaction_id});
    return {transactionId:sent.transaction_id,operation:q.operation};
  })();
  inflight.set(q.operation,{promise:work,fingerprint:q.fingerprint});
  try{return await work;}finally{signing=false;inflight.delete(q.operation);quotes.delete(id);}
}

const server=createServer(async(req,res)=>{
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data:; connect-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
  try{
    if(!allowedHosts.has(req.headers.host))throw error('Unsupported local host.',403);
    const url=new URL(req.url,`http://${req.headers.host}`);
    if(req.method==='GET'&&url.pathname==='/health/live'){json(res,{status:'live'});return;}
    if(publicMode){
      if(Date.now()-requestWindow>=60000){requestWindow=Date.now();requestCount=0;}
      if(activeRequests>=32||++requestCount>600){res.setHeader('Retry-After','10');throw error('Service is busy. Try again shortly.',429);}
      activeRequests++;let released=false;const release=()=>{if(!released){released=true;activeRequests--;}};res.once('finish',release);res.once('close',release);
    }
    if(req.method==='GET'&&url.pathname==='/health/ready'){await ready();json(res,{status:'ready'});return;}
    if(req.method==='GET'&&knownFiles.has(url.pathname)){
      if(!publicMode&&['/', '/index.html', '/about'].includes(url.pathname)){
        let reset;try{reset=JSON.parse(await readFile('/companion/browser-reset.json','utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
        const cookieName=`hauntboard-reset-${role}`;
        if(reset&&/^[a-f0-9]{32}$/.test(reset.generation)&&!(req.headers.cookie??'').split(';').some(part=>part.trim()===`${cookieName}=${reset.generation}`)){
          // An explicitly requested local factory reset clears this origin's storage on its next full navigation.
          // Keep the cookie outside Clear-Site-Data so this runs once per browser and companion.
          res.setHeader('Clear-Site-Data','"storage"');
          res.setHeader('Set-Cookie',`${cookieName}=${reset.generation}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000`);
          if(url.search){res.writeHead(302,{Location:url.pathname,'Cache-Control':'no-store'});res.end();return;}
        }
      }
      const name=knownFiles.get(url.pathname);res.writeHead(200,{'Content-Type':mime[name.split('.').at(-1)],'Cache-Control':'no-cache'});res.end(await readFile(join(siteRoot,name)));return;
    }
    if(!url.pathname.startsWith('/api/'))throw error('Not found.',404);
    if(url.pathname==='/api/faucet-submit')throw error('Not found.',404);
    if(publicMode&&['/api/wallet','/api/quote','/api/submit','/api/transaction'].includes(url.pathname))throw error('Not found.',404);
    const c=await config();
    // Each route checks the data it needs; indexer preflights must not gate all APIs.
    if(req.method==='POST'){
      if(!allowedHosts.has(new URL(req.headers.origin??'http://invalid').host)||req.headers.origin!==(runtime.origin??`http://${req.headers.host}`)||!(req.headers['content-type']??'').startsWith('application/json'))throw error('Request origin rejected. Open this client at its configured address.',403);
      if(req.headers['x-hauntboard-csrf']!==csrf)throw Object.assign(error('This client session expired. Refresh the session before continuing.',403),{clientCode:'SESSION_EXPIRED'});
    }
    if(req.method==='GET'&&url.pathname==='/api/config'){
      if(faucet&&c.network==='esmeralda')faucet.session(req,res,runtime.origin?.startsWith('https:'));
      json(res,{keyRegistryTemplate:c.keyRegistryTemplate??null,network:c.network,networkByte:c.networkByte,resetIdentity:c.resetIdentity,profile:runtime.profile,testnetBeta:publicMode&&beta,compatibilityVerified:c.compatibilityVerified===true,posterPrivacyVerified:c.posterPrivacyVerified===true,providerRuntimeVersion:c.providerRuntimeVersion,posterPrivacy:c.posterPrivacy,schema:c.schema,version:'0.43.0',board:c.board,template:c.template,legacyBoards:c.legacyBoards??[],instance:c.instance,role,label:publicMode?'Browser wallet':role==='sender'?'Ghost A':'Ghost B',account:publicMode?undefined:c.account,receiveAddress:publicMode?undefined:c.address,provider:publicMode?'Tari Esmeralda provider · '+new URL(indexer).host:role==='sender'?'Primary local indexer':'Independent local indexer',providerUrl:publicMode?indexer:undefined,faucetEnabled:Boolean(faucet&&c.network==='esmeralda'),faucetAmountTokens:100,csrf,limits:{posts:2048,pageSize:16,pages:128,threads:128,envelopeBytes:4096},walletExpiresAt:publicMode?undefined:c.expiresAt});return;
    }
    if(req.method==='POST'&&['/api/faucet-claim','/api/faucet-status'].includes(url.pathname)){
      if(!faucet||c.network!=='esmeralda')throw error('In-app faucet funding is unavailable. Use the linked TariTracker faucet.',404);
      const body=await input(req),session=faucet.authenticate(req),scope=`${c.network}:${c.resetIdentity}`;
      if(!body||typeof body!=='object'||Array.isArray(body))throw error('Invalid faucet request.');
      const result=url.pathname==='/api/faucet-claim'?await faucet.claim(scope,session,body):await faucet.status(scope,session,body.receipt);
      json(res,result);return;
    }
    if(req.method==='POST'&&url.pathname==='/api/faucet-outputs'){
      const body=await input(req);
      if(typeof body.address!=='string'||body.address.length>300||!/^otl_esm_[a-z0-9]+$/.test(body.address))throw error('Enter an Esmeralda Ootle receive address.');
      // A fixed read-only discovery endpoint; never accept a browser-supplied URL.
      const upstream=await fetch(`${faucetDiscoveryOrigin}/api/wallet-outputs`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({address:body.address}),signal:AbortSignal.timeout(15000),redirect:'error'});
      json(res,await upstream.json(),upstream.status);return;
    }
    if(req.method==='POST'&&url.pathname==='/api/indexer'){
      // Fixed local provider and a small REST allowlist. No wallet daemon credential crosses this boundary.
      const body=await input(req);
      const allowedGet=/^(network|identity|epoch-manager\/stats|substates\/(component|vault|resource)_[a-f0-9]{64}|substates\/utxo_0101010101010101010101010101010101010101010101010101010101010101_[a-f0-9]{64}|transactions\/[a-f0-9]{64}\/result)$/;
      const allowedScan=/^utxos\?resource_address=resource_0101010101010101010101010101010101010101010101010101010101010101&limit=100(?:&from_id=[a-f0-9]{64})?$/;
      if(!((body.method==='GET'&&(allowedGet.test(body.path)||allowedScan.test(body.path)))||(body.method==='POST'&&['transactions/dry-run',...(!publicMode?['transactions']:[])].includes(body.path))))throw error('Unsupported indexer request.');
      const upstream=await fetch(`${indexer}/${body.path}`,{method:body.method,headers:{'Content-Type':'application/json'},body:body.method==='POST'?JSON.stringify(body.body):undefined,signal:AbortSignal.timeout(30000),redirect:'error'});
      json(res,await upstream.json(),upstream.status);return;
    }
    if(req.method==='POST'&&url.pathname==='/api/browser-submit'){
      const body=await input(req);
      if(!/^[a-f0-9]{64}$/.test(body.operation??'')||typeof body.transaction!=='string'||body.transaction.length>180000)throw error('Invalid signed browser transaction.');
      // Preserve historical local operation records for already-open clients.
      if(!publicMode){let prior;try{prior=JSON.parse(await readFile(`/companion/operations/${body.operation}.json`,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}if(prior){if(prior.fingerprint!==createHash('sha256').update(body.transaction).digest('hex'))throw error('Operation contains different signed bytes.',409);if(prior.tx){json(res,{transaction_id:prior.tx,reused:true});return;}throw error('Submission outcome is uncertain.',409);}}
      const expectedId=await transactionIdentity(body.transaction,()=>readFile(join(siteRoot,'transaction-identity.wasm')));
      json(res,await relay.submit(`${c.network}:${c.resetIdentity}`,body.operation,body.transaction,async()=>{
        const upstream=await fetch(`${indexer}/transactions`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({transaction:body.transaction}),signal:AbortSignal.timeout(30000),redirect:'error'});
        const sent=await upstream.json();
        // A transport error, timeout or HTTP failure does not prove chain rejection.
        if(!upstream.ok)throw error('Provider did not acknowledge submission. Reconcile its outcome.',503);
        return sent;
      },{transactionId:expectedId}));return;
    }
    if(req.method==='GET'&&url.pathname==='/api/key-registry'){
      const address=url.searchParams.get('address');
      if(!COMPONENT.test(address??'')||!/^[a-f0-9]{64}$/.test(c.keyRegistryTemplate??''))throw error('Key registry is not enabled for this network.',404);
      const row=await getSubstate(indexer,address,[c.keyRegistryTemplate],boardReadFallbacks);
      json(res,decodeRegistry(row,address,c.keyRegistryTemplate));return;
    }
    if(req.method==='GET'&&['/api/board','/api/thread','/api/raw'].includes(url.pathname)){
      const address=url.searchParams.get('address')??c.board;
      if(url.pathname==='/api/raw'){json(res,await getSubstate(indexer,address,templates(c),boardReadFallbacks));return;}
      if(url.pathname==='/api/thread'){json(res,await readThread(c,address,url.searchParams.get('before')));return;}
      const state=await readState(c,address);
      if(url.pathname==='/api/board'&&!state.isBoard)throw error('This address is not a board.');
      if(url.pathname==='/api/thread'&&state.isBoard)throw error('This address is not a thread.');
      json(res,state);return;
    }
    if(req.method==='GET'&&url.pathname==='/api/wallet'){
      await verifyWallet(c);
      const row=await rpc(c,'accounts.get_balances',{account:c.account,refresh:true});
      const b=row.balances.find(b=>b.resource_address===NATIVE);
      const outputs=await rpc(c,'stealth_utxos.list',{resource_address:NATIVE,account_address:c.account,filter_by_status:null});
      json(res,{revealed:b?.balance??'0',concealed:b?.confidential_balance??'0',receiveAddress:c.address,outputs:outputs.utxos.filter(o=>o.is_on_chain&&o.memo?.Message==='A candle from Hauntboard').map(o=>({value:o.value,status:o.status}))});return;
    }
    if(req.method==='GET'&&url.pathname==='/api/transaction'){
      const id=url.searchParams.get('id');if(!(/^[a-f0-9]{64}$/).test(id??''))throw error('Invalid transaction ID.');
      const tx=await rpc(c,'transactions.get',{transaction_id:id});
      json(res,{id,status:tx.status,fee:tx.result?.fee_receipt?.total_fees_paid,execution:tx.result?.execution_results?.map(r=>r.indexed?.value)});return;
    }
    if(req.method==='GET'&&url.pathname==='/api/operation'){
      const operation=url.searchParams.get('id');if(!(/^[a-f0-9]{64}$/).test(operation??''))throw error('Invalid operation ID.');
      let current=await relay.status(`${c.network}:${c.resetIdentity}`,operation);
      if(current.tx&&!['accepted','rejected'].includes(current.status))try{current=await relay.reconcile(`${c.network}:${c.resetIdentity}`,operation,async id=>{const response=await fetch(`${indexer}/transactions/${id}/result`,{redirect:'error',signal:AbortSignal.timeout(5000)});if(!response.ok)throw new Error('Provider unavailable');return response.json();});}catch{}
      if(publicMode||current.status!=='not_submitted'){json(res,{status:current.status,transactionId:current.tx});return;}
      try{const saved=JSON.parse(await readFile(`/companion/operations/${operation}.json`,'utf8'));json(res,{status:saved.status,transactionId:saved.tx});}catch(e){if(e.code!=='ENOENT')throw e;json(res,{status:'not_submitted'});}return;
    }
    if(req.method==='POST'&&url.pathname==='/api/quote'){json(res,await makeQuote(c,await input(req)));return;}
    if(req.method==='POST'&&url.pathname==='/api/submit'){const body=await input(req);json(res,await sendQuote(c,body.quoteId));return;}
    throw error('Not found.',404);
  }catch(e){
    if(e.retryAfter)res.setHeader('Retry-After',String(e.retryAfter));
    if(!publicMode&&e.rpcCode!==undefined)await atomicJson('/companion/last-rpc-error.json',{code:e.rpcCode,message:e.message,diagnostic:e.diagnostic}).catch(()=>{});
    const friendly=e.rpcCode===401?'Local wallet authentication expired. Run the local bootstrap again.':e.diagnostic?.includes('Post page changed')?'New replies opened another page. Sync from chain, then review your reply again. Your draft is preserved.':e.rpcCode!==undefined?`Wallet simulation rejected this operation (${e.rpcCode}). Your draft is preserved.`:e.message;
    json(res,{error:friendly,code:e.clientCode,transactionId:e.transactionId},e.status??503);
  }
});
server.requestTimeout=35000;server.headersTimeout=10000;server.keepAliveTimeout=5000;server.maxRequestsPerSocket=100;
server.listen(port,'0.0.0.0',()=>console.log(`Hauntboard ${runtime.profile} listening on ${port}.`));

// Read-only reconciliation never reconstructs or resends transactions.
let maintaining=false;
const worker=setInterval(async()=>{if(maintaining)return;maintaining=true;try{const c=await config();await relay.maintain(`${c.network}:${c.resetIdentity}`,async id=>{const r=await fetch(`${indexer}/transactions/${id}/result`,{redirect:'error',signal:AbortSignal.timeout(5000)});if(!r.ok)throw new Error('Provider unavailable');return r.json();},{limit:20});}catch{}finally{maintaining=false;}},60000);worker.unref();
