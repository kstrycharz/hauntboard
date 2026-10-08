import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
const wasmPath='hauntboard/template/hauntboard.wasm',wasm=await readFile(wasmPath);
if(!WebAssembly.validate(wasm))throw new Error('Invalid compiled WebAssembly.');
// Inspect custom-section names; a raw publication must not carry unrelated compiler metadata.
let offset=8;const customSections=[];
function uleb(){let value=0,shift=0;for(let n=0;n<5;n++){const byte=wasm[offset++];if(byte===undefined)throw new Error('Truncated WASM.');value+=(byte&127)*2**shift;if(!(byte&128))return value;shift+=7;}throw new Error('Invalid WASM section length.');}
while(offset<wasm.length){const id=wasm[offset++],size=uleb(),end=offset+size;if(end>wasm.length)throw new Error('Invalid WASM section.');if(id===0){const length=uleb();customSections.push(wasm.subarray(offset,offset+length).toString('utf8'));}offset=end;}
if(customSections.length!==1||customSections[0]!=='tari_tdef')throw new Error(`Unexpected WASM metadata: ${customSections.join(',')}`);
const engine=JSON.parse(await readFile('hauntboard/evidence/engine.json','utf8'));if(engine.status!=='PASSED'||engine.schema!==3||engine.passed!==5)throw new Error('Required contract engine evidence is missing.');
const sourceFiles=['hauntboard/template/Cargo.toml','hauntboard/template/Cargo.lock','hauntboard/template/src/lib.rs','hauntboard/template/tests/board.rs','hauntboard/template/test-engine.sh','hauntboard/schema3.md','hauntboard/template/RELEASE_CONTRACT.md'];
const hashes={};for(const path of sourceFiles)hashes[path]=createHash('sha256').update(await readFile(path)).digest('hex');
const manifest={artifactVersion:'0.1.0',schema:3,templateName:'Hauntboard',builtAt:new Date().toISOString(),wasm:{file:'hauntboard.wasm',bytes:wasm.length,sha256:createHash('sha256').update(wasm).digest('hex'),validWebAssembly:true,customSections},build:{templateLib:'0.33.0',testedEngine:'0.43.0'},target:{network:'esmeralda',networkByte:38,observedProviderRuntime:'0.45.0',publicCompatibilityVerified:false,publishedTemplate:null,boardComponent:null,publicationTransaction:null},constructor:{function:'new',arguments:[{name:'title',type:'String',maxUtf8Bytes:80}]},capacity:{threadsPerBoard:128,postsPerThread:2048,pagesPerThread:128,postsPerPage:16,envelopeBytes:4096},storage:{board:'Registry of thread addresses and public metadata',thread:'Thread context, page addresses and count',page:'Full public bytes or sealed ciphertext; author, nonce, parent and epoch',excluded:['Wallet secrets','Thread decryption keys','Private tips and amounts','Browser preferences']},engineEvidence:engine,sourceHashes:hashes};
const name='hauntboard-contract-0.1.0-schema3',parent=join('.cache',`contract-release-${Date.now()}`),stage=join(parent,name);await mkdir(stage,{recursive:true});await cp(wasmPath,join(stage,'hauntboard.wasm'));
for(const path of sourceFiles){await mkdir(join(stage,path,'..'),{recursive:true});await cp(path,join(stage,path));}
manifest.releaseBlockers=['Public runtime compatibility remains unverified.','Schema-3 records signer identity and does not satisfy the owner requirement for public content with private posters.'];
await writeFile(join(stage,'contract-manifest.json'),JSON.stringify(manifest,null,2)+'\n');await mkdir('hauntboard/artifacts',{recursive:true});
await writeFile('hauntboard/artifacts/contract-manifest.json',JSON.stringify(manifest,null,2)+'\n');await writeFile('hauntboard/evidence/contract-release.json',JSON.stringify(manifest,null,2)+'\n');
const archive=join('hauntboard/artifacts',`${name}.tar.gz`);execFileSync('tar',['-czf',archive,'-C',parent,name]);const checksum=createHash('sha256').update(await readFile(archive)).digest('hex');await writeFile('hauntboard/artifacts/CONTRACT_SHA256SUMS.txt',`${checksum}  ${name}.tar.gz\n`);console.log(JSON.stringify({status:'CONTRACT_PREPARED',archive,wasmBytes:wasm.length,wasmSha256:manifest.wasm.sha256,archiveSha256:checksum,publicDeployment:false}));
