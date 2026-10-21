// Actual HTTP routes and durable storage; the upstream faucet is simulated.
import {spawn} from 'node:child_process';
import {request as httpRequest} from 'node:http';
import {mkdtemp, writeFile, readFile, rm} from 'node:fs/promises';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const root = await mkdtemp('/companion/faucet-routes-');
const configFile = join(root, 'config.json'), modeFile = join(root, 'mode'), callsFile = join(root, 'calls');
const receipt = '6cf1df90-7645-44d2-8ed5-a00121aa8001';
const payload = {receipt, address: 'otl_esm_synthetic', amountTokens: 100};
await writeFile(configFile, JSON.stringify({network:'esmeralda', networkByte:38, resetIdentity:'synthetic-faucet-routes', instance:'synthetic', sdkVersion:'0.7.0', wasmVersion:'0.43.0', schema:4, posterPrivacy:'stealth-fee-v1', compatibilityVerified:false, posterPrivacyVerified:false, board:`component_${'ab'.repeat(32)}`, template:'cd'.repeat(32)}));
await writeFile(modeFile, 'queued');
await writeFile(callsFile, '');
const request = (path, {body, headers = {}, ...options} = {}) => new Promise((resolve, reject) => {
  const req = httpRequest(`http://127.0.0.1:8280${path}`, {...options, headers: {Host:'localhost:8280', ...headers}}, res => {
    let text = '';
    res.on('data', chunk => text += chunk);
    res.on('end', () => resolve({status:res.statusCode, headers:res.headers, body:JSON.parse(text)}));
  });
  req.on('error', reject);
  req.end(body === undefined ? undefined : JSON.stringify(body));
});
let server;
async function start() {
  const setup = `import {readFile,appendFile} from 'node:fs/promises';
    globalThis.fetch=async(url,init)=>{
      if(!url.startsWith('https://testnet-faucet.taritracker.com/api/v1/claims'))throw new Error('Unexpected upstream');
      if(init.headers.Authorization!=='Bearer synthetic-key')throw new Error('Missing backend key');
      const status=await readFile(process.env.FAUCET_MODE,'utf8');
      if(init.method==='POST')await appendFile(process.env.FAUCET_CALLS,'POST\\n');
      return Response.json({receipt:'${receipt}',status,transactionId:null,amountMicrotari:'100000000'},{status:init.method==='POST'?202:200});
    }; await import('/app/hauntboard/server.mjs');`;
  server = spawn(process.execPath, ['--input-type=module', '--eval', setup], {env:{...process.env, HAUNTBOARD_PROFILE:'client', HAUNTBOARD_TESTNET_BETA:'true', HAUNTBOARD_FAUCET_ENABLED:'true', FAUCET_API_KEY:'synthetic-key', ORIGIN:'http://localhost:8280', INDEXER_URL:'https://ootle-indexer-a.tari.com', APPROVED_PROVIDER_ORIGINS:'https://ootle-indexer-a.tari.com', CONFIG_FILE:configFile, FAUCET_MODE:modeFile, FAUCET_CALLS:callsFile, PORT:'8280'}, stdio:['ignore','pipe','pipe']});
  let output = '';
  server.stdout.on('data', chunk => output += chunk);
  server.stderr.on('data', chunk => output += chunk);
  for (let n = 0; n < 50 && !output.includes('listening'); n++) await new Promise(r => setTimeout(r, 100));
  assert(output.includes('listening'), output);
}
async function stop() { if (!server) return; const exited = new Promise(r => server.once('exit', r)); server.kill('SIGTERM'); await exited; server = null; }
try {
  await start();
  const config = await request('/api/config');
  assert.equal(config.body.faucetEnabled, true);
  assert.equal(config.body.faucetAmountTokens, 100);
  assert(!JSON.stringify(config).includes('synthetic-key'));
  const cookie = config.headers['set-cookie'][0].split(';')[0];
  const headers = {Origin:'http://localhost:8280', 'Content-Type':'application/json', 'X-Hauntboard-CSRF':config.body.csrf, Cookie:cookie};
  const post = (path, body, extra = {}) => request(path, {method:'POST', body, headers:{...headers, ...extra}});
  assert.equal((await post('/api/faucet-claim', payload, {Origin:'http://attacker.example'})).status, 403);
  assert.equal((await post('/api/faucet-claim', payload, {'X-Hauntboard-CSRF':'invalid'})).status, 403);
  assert.equal((await post('/api/faucet-claim', payload, {Cookie:''})).status, 401);
  assert.equal((await post('/api/faucet-claim', {...payload, amountTokens:1000})).status, 400);
  assert.equal((await post('/api/faucet-claim', payload)).body.status, 'queued');
  assert.equal((await post('/api/faucet-claim', {...payload, address:'otl_esm_changed'})).status, 409);
  const stranger = await request('/api/config');
  assert.equal((await post('/api/faucet-status', {receipt}, {Cookie:stranger.headers['set-cookie'][0].split(';')[0]})).status, 404);
  await stop(); await start();
  headers['X-Hauntboard-CSRF'] = (await request('/api/config', {headers:{Cookie:cookie}})).body.csrf;
  assert.equal((await post('/api/faucet-claim', payload)).body.status, 'queued');
  assert.equal(await readFile(callsFile, 'utf8'), 'POST\n', 'Restart must not create another payment.');
  await writeFile(modeFile, 'uncertain');
  await new Promise(r => setTimeout(r, 3100));
  assert.equal((await post('/api/faucet-status', {receipt})).body.status, 'uncertain');
  await writeFile(modeFile, 'confirmed');
  await new Promise(r => setTimeout(r, 3100));
  assert.equal((await post('/api/faucet-status', {receipt})).body.status, 'confirmed');
  assert.equal(await readFile(callsFile, 'utf8'), 'POST\n');
  console.log('Faucet HTTP integration passed: origin, CSRF, signed sessions, fixed amount, immutable receipts, restart, uncertain status and confirmation. Simulated upstream; no funds sent.');
} finally { await stop(); await rm(root, {recursive:true, force:true}); }
