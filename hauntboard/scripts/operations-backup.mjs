// Run in the application image against a stopped production journal. No wallet keys are present.
import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
import {scryptSync,randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {join} from 'node:path';
const mode=process.argv[2],root=process.env.JOURNAL_ROOT??'/companion',file=process.env.BACKUP_FILE??'/backup/operations.encrypted.json';
const password=(await readFile(process.env.BACKUP_PASSWORD_FILE??'/run/secrets/backup-password','utf8')).trim();
if(password.length<20)throw new Error('Use an operational backup password of at least 20 characters.');
const context=Buffer.from('hauntboard-operational-backup-v1');
const valid=path=>/^browser-operations\/[A-Za-z0-9._-]{1,160}\/[a-f0-9]{64}\.json$/.test(path);
if(mode==='backup'){
 const records={};let total=0;
 async function walk(dir,prefix=''){for(const row of await readdir(dir,{withFileTypes:true})){if(row.isSymbolicLink())throw new Error('Symlinks are not supported.');const path=prefix+row.name;if(row.isDirectory())await walk(join(dir,row.name),path+'/');else if(row.isFile()&&valid(path)){const content=await readFile(join(root,path),'utf8');total+=Buffer.byteLength(content);if(total>16000000||Object.keys(records).length>=10000)throw new Error('Backup size limit exceeded.');JSON.parse(content);records[path]=content;}}}
 await walk(root);
 const salt=randomBytes(32),iv=randomBytes(12),key=scryptSync(password,salt,32),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(context);
 const plaintext=Buffer.from(JSON.stringify({v:1,createdAt:new Date().toISOString(),records}));
 try{const ct=Buffer.concat([cipher.update(plaintext),cipher.final()]);await writeFile(file,JSON.stringify({v:1,salt:salt.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ct:ct.toString('base64')}),{mode:0o600});}finally{key.fill(0);plaintext.fill(0);}
 console.log(JSON.stringify({status:'BACKUP_CREATED',records:Object.keys(records).length}));
}else if(mode==='restore'){
 if((await readdir(root)).length)throw new Error('Restore requires an empty journal volume.');
 const bytes=await readFile(file);if(bytes.length>24000000)throw new Error('Backup size limit exceeded.');const backup=JSON.parse(bytes);
 if(backup.v!==1)throw new Error('Unsupported backup version.');
 const salt=Buffer.from(backup.salt,'base64'),iv=Buffer.from(backup.iv,'base64'),tag=Buffer.from(backup.tag,'base64');if(salt.length!==32||iv.length!==12||tag.length!==16)throw new Error('Invalid encrypted backup.');
 const key=scryptSync(password,salt,32),decipher=createDecipheriv('aes-256-gcm',key,iv);decipher.setAAD(context);decipher.setAuthTag(tag);
 let plaintext;try{plaintext=Buffer.concat([decipher.update(Buffer.from(backup.ct,'base64')),decipher.final()]);const data=JSON.parse(plaintext);if(data.v!==1||!data.records||Object.keys(data.records).length>10000)throw new Error('Invalid backup contents.');for(const [path,content] of Object.entries(data.records)){if(!valid(path)||typeof content!=='string'||content.length>4096)throw new Error('Invalid journal record.');JSON.parse(content);}for(const [path,content] of Object.entries(data.records)){await mkdir(join(root,path,'..'),{recursive:true});await writeFile(join(root,path),content,{flag:'wx',mode:0o600});}console.log(JSON.stringify({status:'RESTORED',records:Object.keys(data.records).length}));}finally{key.fill(0);plaintext?.fill(0);}
}else throw new Error('Choose backup or restore.');
