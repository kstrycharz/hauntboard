import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const origin='https://payroll-levels-sensitivity-bit.trycloudflare.com';
const manifest=JSON.parse(await readFile('network.json','utf8'));
const get=async path=>{const r=await fetch(origin+path,{signal:AbortSignal.timeout(30000)});assert(r.ok,`${path}: ${r.status}`);return r;};
const config=await(await get('/api/config')).json();
assert.equal(config.board,manifest.board);assert.equal(config.resetIdentity,manifest.resetIdentity);assert.deepEqual(config.legacyBoards,manifest.legacyBoards);assert.equal(config.faucetEnabled,true);assert.equal(config.testnetBeta,true);
await get('/health/ready');
const assets=[];
for(const [path,file]of Object.entries({'/':'index.html','/app.mjs':'app.mjs','/forums':'forums.html','/about':'about.html','/browser-wallet.mjs':'browser-wallet.mjs','/output-ledger.mjs':'output-ledger.mjs','/wallet-recovery.wasm':'wallet-recovery.wasm','/transaction-identity.wasm':'transaction-identity.wasm'})){
 const local=await readFile(`hauntboard/web/${file}`),live=Buffer.from(await(await get(path)).arrayBuffer());
 assert(local.equals(live),`Served asset differs: ${file}`);assets.push({file,sha256:createHash('sha256').update(live).digest('hex')});
}
const old=await(await get(`/api/board?address=${manifest.legacyBoards[0]}`)).json();assert(old);
const report={status:'FORUMS_RELEASE_VERIFIED',checkedAt:new Date().toISOString(),origin,board:config.board,legacyBoards:config.legacyBoards,resetIdentity:config.resetIdentity,ready:true,faucetEnabled:config.faucetEnabled,assets,chainWrites:0};
await writeFile('hauntboard/evidence/forums-release.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
