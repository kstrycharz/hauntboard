import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
test('encrypted backup restores exact uncertain journal; wrong password and overwrite fail',async()=>{
 const base=await mkdtemp(join(tmpdir(),'hauntboard-backup-'));
 try{
  const source=join(base,'source'),target=join(base,'target'),password=join(base,'password'),backup=join(base,'encrypted.json');await mkdir(join(source,'browser-operations','esmeralda_generation'),{recursive:true});await mkdir(target);await writeFile(password,'synthetic-operational-backup-password');
  const path=`browser-operations/esmeralda_generation/${'a'.repeat(64)}.json`,record=JSON.stringify({status:'submitting',fingerprint:'b'.repeat(64)});await writeFile(join(source,path),record);
  const run=(mode,root)=>execFileSync(process.execPath,['hauntboard/scripts/operations-backup.mjs',mode],{env:{...process.env,JOURNAL_ROOT:root,BACKUP_FILE:backup,BACKUP_PASSWORD_FILE:password},stdio:'pipe'});
  run('backup',source);assert(!(await readFile(backup,'utf8')).includes('submitting'));
  await writeFile(password,'synthetic-wrong-operational-password');assert.throws(()=>run('restore',target));assert.deepEqual(await readdir(target),[]);
  await writeFile(password,'synthetic-operational-backup-password');run('restore',target);assert.equal(await readFile(join(target,path),'utf8'),record);assert.throws(()=>run('restore',target));
 }finally{await rm(base,{recursive:true,force:true});}
});
