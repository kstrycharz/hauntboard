const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
export const randomId=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)));
export const base64=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
export function unbase64(text){if(typeof text!=='string'||!(/^[A-Za-z0-9_-]+$/).test(text))throw new Error('Invalid secret key or envelope.');return Uint8Array.from(atob(text.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));}
export const newThreadKey=()=>base64(crypto.getRandomValues(new Uint8Array(32)));
const contextBytes=(board,uid,nonce,parent)=>encoder.encode(JSON.stringify(['hauntboard',1,'localnet',board,uid,nonce,parent]));
export function postSpace(content,mode){
  const used=encoder.encode(JSON.stringify({v:1,...content})).length;
  const limit=mode===1?2558:4096;
  return {used,limit,remaining:limit-used};
}
export async function encodePost(content,mode,key,context){
  const data=encoder.encode(JSON.stringify({v:1,...content}));
  if(mode===0){if(data.length>4096)throw new Error('This post is too large. Shorten it before publishing.');return Array.from(data);}
  if(data.length>2558)throw new Error('This secret is too long. Shorten it to fit the encrypted envelope.');
  const raw=unbase64(key);if(raw.length!==32)throw new Error('An invitation key is required.');
  const aes=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt']);
  const padded=crypto.getRandomValues(new Uint8Array(2560));new DataView(padded.buffer).setUint16(0,data.length);padded.set(data,2);
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:contextBytes(...context)},aes,padded);
  return Array.from(encoder.encode(JSON.stringify({v:1,alg:'A256GCM',iv:base64(iv),ct:base64(new Uint8Array(ct))})));
}
export async function decodePost(payload,mode,key,context){
  const envelope=JSON.parse(decoder.decode(new Uint8Array(payload)));
  let content=envelope;
  if(mode===1){
    if(!key)throw new Error('This thread is sealed. Open an invitation to read it.');
    if(envelope.v!==1||envelope.alg!=='A256GCM')throw new Error('Invalid encrypted envelope.');
    const raw=unbase64(key);if(raw.length!==32)throw new Error('Invalid invitation key.');
    const aes=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['decrypt']);
    let decrypted;try{decrypted=await crypto.subtle.decrypt({name:'AES-GCM',iv:unbase64(envelope.iv),additionalData:contextBytes(...context)},aes,unbase64(envelope.ct));}catch{throw new Error('The key does not open this post, or the encrypted data was altered.');}
    const padded=new Uint8Array(decrypted);if(padded.length!==2560)throw new Error('Invalid secret padding.');
    const length=new DataView(padded.buffer).getUint16(0);if(length>2558)throw new Error('Invalid secret length.');
    content=JSON.parse(decoder.decode(padded.slice(2,2+length)));
  }
  if(content.v!==1||typeof content.body!=='string'||typeof content.name!=='string'||typeof content.title!=='string')throw new Error('This post has an unsupported format.');
  return content;
}

function database(){return new Promise((resolve,reject)=>{const r=indexedDB.open('hauntboard-keys-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('vault');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function get(key){const db=await database();try{return await new Promise((resolve,reject)=>{const r=db.transaction('vault').objectStore('vault').get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}finally{db.close();}}
async function put(key,value){const db=await database();try{await new Promise((resolve,reject)=>{const tx=db.transaction('vault','readwrite');tx.objectStore('vault').put(value,key);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
async function deviceKey(){
  if(!navigator.locks)throw new Error('This browser does not support the locks needed for safe local key storage.');
  return navigator.locks.request('hauntboard-device-key-v1',async()=>{let key=await get('device');if(!key){key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);await put('device',key);}return key;});
}
export async function saveKey(thread,secret){const iv=crypto.getRandomValues(new Uint8Array(12));const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(thread)},await deviceKey(),encoder.encode(secret));await put(thread,{iv:Array.from(iv),cipher:Array.from(new Uint8Array(cipher))});}
export async function loadKey(thread){const entry=await get(thread);if(!entry)return null;return decoder.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(entry.iv),additionalData:encoder.encode(thread)},await deviceKey(),new Uint8Array(entry.cipher)));}
export async function deleteKey(thread){const db=await database();try{await new Promise((resolve,reject)=>{const tx=db.transaction('vault','readwrite');tx.objectStore('vault').delete(thread);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
async function backupKey(password,salt){if(password.length<12)throw new Error('Use a backup password of at least 12 characters.');const base=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations:600000},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
export async function exportKeys(entries,password){const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));const key=await backupKey(password,salt);const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode('hauntboard-key-backup-v1')},key,encoder.encode(JSON.stringify(entries)));return {format:'hauntboard-key-backup',version:1,kdf:'PBKDF2-SHA256',iterations:600000,salt:base64(salt),iv:base64(iv),ciphertext:base64(new Uint8Array(ct))};}
export async function importKeys(backup,password){if(backup.format!=='hauntboard-key-backup'||backup.version!==1||backup.kdf!=='PBKDF2-SHA256'||backup.iterations!==600000||typeof backup.ciphertext!=='string'||backup.ciphertext.length>100000)throw new Error('Unsupported backup file.');const salt=unbase64(backup.salt),iv=unbase64(backup.iv);if(salt.length!==16||iv.length!==12)throw new Error('Invalid backup.');let data;try{data=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:encoder.encode('hauntboard-key-backup-v1')},await backupKey(password,salt),unbase64(backup.ciphertext));}catch{throw new Error('Wrong backup password or damaged file.');}const entries=JSON.parse(decoder.decode(data));if(!Array.isArray(entries)||entries.length>128||entries.some(e=>!(/^component_[a-f0-9]{64}$/).test(e.thread)||unbase64(e.key).length!==32))throw new Error('Invalid keys in backup.');return entries;}
