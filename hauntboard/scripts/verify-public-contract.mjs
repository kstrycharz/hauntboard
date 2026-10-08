import {readFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
const hash=b=>createHash('sha256').update(b).digest('hex'),name='hauntboard-public-contract-0.2.0-schema4',archive=`hauntboard/artifacts/${name}.tar.gz`,root=join('.cache',`verify-public-${Date.now()}`);
if(hash(await readFile(archive))!==(await readFile('hauntboard/artifacts/PUBLIC_CONTRACT_SHA256SUMS.txt','utf8')).split(/\s/)[0])throw new Error('Public contract archive checksum mismatch.');
const paths=execFileSync('tar',['-tzf',archive],{encoding:'utf8'}).trim().split('\n');if(paths.some(p=>!p.startsWith(name+'/')||p.split('/').includes('..')))throw new Error('Invalid archive path.');await mkdir(root,{recursive:true});execFileSync('tar',['-xzf',archive,'-C',root]);
const manifest=JSON.parse(await readFile(join(root,name,'contract-manifest.json'),'utf8')),wasm=await readFile(join(root,name,'hauntboard_public.wasm'));
if(manifest.schema!==4||manifest.authorFields!==false||manifest.publicOnly!==true||!WebAssembly.validate(wasm)||hash(wasm)!==manifest.wasm.sha256||manifest.target.publicCompatibilityVerified!==false||manifest.target.publishedTemplate!==null)throw new Error('Invalid public candidate identity.');for(const [path,expected] of Object.entries(manifest.sourceHashes)){if(path.startsWith('/')||path.split('/').includes('..')||hash(await readFile(join(root,name,path)))!==expected)throw new Error('Public source checksum mismatch.');}console.log(JSON.stringify({status:'PUBLIC_CONTRACT_CANDIDATE_VERIFIED',schema:4,wasmSha256:manifest.wasm.sha256,sourceFiles:Object.keys(manifest.sourceHashes).length,publicDeployment:false}));
