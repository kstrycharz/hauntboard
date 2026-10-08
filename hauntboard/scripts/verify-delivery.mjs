import {readFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
const name='hauntboard-0.4.0-delivery-preparation',archive=join('hauntboard/artifacts',`${name}.tar.gz`),root=join('.cache',`verify-delivery-${Date.now()}`);
const expected=(await readFile('hauntboard/artifacts/DELIVERY_SHA256SUMS.txt','utf8')).split(/\s/)[0],actual=createHash('sha256').update(await readFile(archive)).digest('hex');if(expected!==actual)throw new Error('Archive checksum mismatch.');
const paths=execFileSync('tar',['-tzf',archive],{encoding:'utf8'}).trim().split('\n');if(paths.some(path=>!path.startsWith(name+'/')||path.split('/').includes('..')))throw new Error('Invalid archive path.');
await mkdir(root,{recursive:true});execFileSync('tar',['-xzf',archive,'-C',root]);const manifest=JSON.parse(await readFile(join(root,name,'delivery-manifest.json'),'utf8'));
if(manifest.releaseAccepted!==false)throw new Error('Preparation package must not claim release acceptance.');
for(const [path,hash] of Object.entries(manifest.sourceAndAssetHashes)){if(path.split('/').includes('..')||path.startsWith('/'))throw new Error('Invalid manifest path.');if(createHash('sha256').update(await readFile(join(root,name,path))).digest('hex')!==hash)throw new Error(`File checksum mismatch: ${path}`);}
console.log(JSON.stringify({status:'PREPARATION_VERIFIED',sha256:actual,files:Object.keys(manifest.sourceAndAssetHashes).length}));

