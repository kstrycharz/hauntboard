import {readFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
const name='hauntboard-contract-0.1.0-schema3',archive=`hauntboard/artifacts/${name}.tar.gz`,root=join('.cache',`verify-contract-${Date.now()}`);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
if(hash(await readFile(archive))!==(await readFile('hauntboard/artifacts/CONTRACT_SHA256SUMS.txt','utf8')).split(/\s/)[0])throw new Error('Contract archive checksum mismatch.');
const paths=execFileSync('tar',['-tzf',archive],{encoding:'utf8'}).trim().split('\n');if(paths.some(p=>!p.startsWith(name+'/')||p.split('/').includes('..')))throw new Error('Invalid contract archive path.');
await mkdir(root,{recursive:true});execFileSync('tar',['-xzf',archive,'-C',root]);const manifest=JSON.parse(await readFile(join(root,name,'contract-manifest.json'),'utf8')),wasm=await readFile(join(root,name,'hauntboard.wasm'));
if(!WebAssembly.validate(wasm)||hash(wasm)!==manifest.wasm.sha256||manifest.schema!==3||manifest.target.publishedTemplate!==null||manifest.target.boardComponent!==null)throw new Error('Invalid contract candidate identity.');
for(const [path,expected] of Object.entries(manifest.sourceHashes)){if(path.split('/').includes('..')||path.startsWith('/')||hash(await readFile(join(root,name,path)))!==expected)throw new Error('Contract source identity mismatch.');}
console.log(JSON.stringify({status:'CONTRACT_PACKAGE_VERIFIED',wasmSha256:manifest.wasm.sha256,sourceFiles:Object.keys(manifest.sourceHashes).length,schema:3,publicDeployment:false}));
