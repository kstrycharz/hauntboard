import {mkdir,readdir,readFile,writeFile,copyFile,cp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
const root=process.cwd();
const name='hauntboard-0.2.0-local';
const parent=join(root,'.cache',`release-${Date.now()}`),stage=join(parent,name);
await mkdir(stage,{recursive:true});
const selected=['hauntboard','compose.yaml','compose.localnet.yaml','compose.hauntboard.yaml','package.json','pnpm-lock.yaml','pnpm-workspace.yaml','.dockerignore','LICENSE','THIRD_PARTY_NOTICES.md','infra/docker/node.Dockerfile','infra/docker/localnet.Dockerfile','infra/docker/local-tests.Dockerfile','infra/docker/rust-spike.Dockerfile','apps/web/package.json','scripts/lib','scripts/probe-localnet.mjs','.github/workflows/hauntboard.yml','docs/licenses'];
const omitted=new Set(['node_modules','target','dist','.git','artifacts']);
for(const path of selected){await mkdir(join(stage,path,'..'),{recursive:true});await cp(join(root,path),join(stage,path),{recursive:true,filter:source=>!source.split(/[\\/]/).some(part=>omitted.has(part))&&!source.split(/[\\/]/).at(-1).startsWith('failure')&&source.split(/[\\/]/).at(-1)!=='release-package.json'});}
await copyFile(join(root,'hauntboard/RELEASE.md'),join(stage,'README.md'));
async function files(dir,prefix=''){const list=[];for(const entry of await readdir(dir,{withFileTypes:true})){const p=join(dir,entry.name),relative=prefix+entry.name;if(entry.isDirectory())list.push(...await files(p,relative+'/'));else if(entry.isFile())list.push(relative);}return list.sort();}
const hashes={};for(const file of await files(stage))hashes[file]=createHash('sha256').update(await readFile(join(stage,file))).digest('hex');
const manifest={version:'0.2.0-local',schema:3,scope:'isolated Tari localnet proof of concept',builtAt:new Date().toISOString(),runtime:'0.43.0',browserSdk:'0.7.0',sourceAndAssetHashes:hashes,excludes:['wallet data','credentials','invitation fixtures','Git metadata','node_modules','Rust targets']};
await writeFile(join(stage,'release-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const artifacts=join(root,'hauntboard','artifacts');await mkdir(artifacts,{recursive:true});
const archive=join(artifacts,`${name}.tar.gz`);execFileSync('tar',['-czf',archive,'-C',parent,name]);
const sha256=createHash('sha256').update(await readFile(archive)).digest('hex');await writeFile(join(artifacts,'SHA256SUMS.txt'),`${sha256}  ${name}.tar.gz\n`);
await writeFile(join(artifacts,'release-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({status:'RELEASE_PACKAGED',archive:`hauntboard/artifacts/${name}.tar.gz`,sha256,files:Object.keys(hashes).length,bytes:(await readFile(archive)).length}));
