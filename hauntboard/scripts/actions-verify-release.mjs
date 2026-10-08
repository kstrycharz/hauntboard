import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const origin=process.env.HAUNTBOARD_RELEASE_ORIGIN;
assert.equal(new URL(origin).protocol,'https:');
const manifest=JSON.parse(await readFile('hauntboard/artifacts/actions-network.json','utf8'));
const get=async path=>{const r=await fetch(origin+path,{signal:AbortSignal.timeout(30000)});assert(r.ok,`Read failed: ${path}`);return r;};
const config=await(await get('/api/config')).json();assert.equal(config.board,manifest.board);assert.equal(config.template,manifest.template);assert.equal(config.resetIdentity,manifest.resetIdentity);
await get('/health/ready');
const assets=[];
for(const [path,file]of Object.entries({'/':'index.html','/app.mjs':'app.mjs','/browser-wallet.mjs':'browser-wallet.mjs','/forums':'forums.html','/wallet-recovery.wasm':'wallet-recovery.wasm','/transaction-identity.wasm':'transaction-identity.wasm'})){
 const local=await readFile(`hauntboard/web/${file}`),live=Buffer.from(await(await get(path)).arrayBuffer());assert(local.equals(live));assets.push({file,sha256:createHash('sha256').update(live).digest('hex')});
}
const report={status:'ACTIONS_RELEASE_VERIFIED',sourceRevision:process.env.GITHUB_SHA,origin,board:config.board,template:config.template,ready:true,assets,chainWrites:0};
await writeFile('hauntboard/evidence/actions-release.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
