import {validateMnemonic,mnemonicToEntropy,recoveryWordlist} from './vendor/wallet-sdk.mjs';
import initNative from './vendor/wallet-recovery-glue.mjs';
let nativePromise;
async function recoveryNative(){
 // Buffer operations below are synchronous after initialization, so another
 // browser task cannot interleave while secret buffers are populated.
 nativePromise??=initNative({module_or_path:'/wallet-recovery.wasm'}).catch(error=>{nativePromise=null;throw error;});
 return nativePromise;
}
export const RECOVERY_FORMAT='hauntboard-bip39-tari-v1';
export const NATIVE_RECOVERY_FORMAT='tari-cipher-seed-v2';
export async function newPhrase(){
 const native=await recoveryNative();
 try{
  const birthday=Math.floor((Date.now()-Date.UTC(2022,0,1))/86400000);
  const length=native.generate_cipher_seed(birthday);
  if(!length)throw new Error('Could not create a Tari recovery phrase.');
  return new TextDecoder().decode(new Uint8Array(native.memory.buffer,native.phrase_buffer(),length));
 }finally{native.clear_buffers();}
}
export async function accountFromPublicKey(publicKey){
 const native=await recoveryNative();
 try{new Uint8Array(native.memory.buffer,native.seed_buffer(),32).set(publicKey);native.derive_account_address();return `component_${Array.from(new Uint8Array(native.memory.buffer,native.account_buffer(),32),x=>x.toString(16).padStart(2,'0')).join('')}`;}finally{native.clear_buffers();}
}
export function normalizePhrase(phrase){const normalized=String(phrase).normalize('NFKD').trim().toLowerCase().split(/\s+/).join(' ');if(normalized.split(' ').length!==24)throw new Error('Enter all 24 recovery words in order.');return normalized;}
export async function keysFromPhrase(phrase,{format='auto',seedPassphrase='',accountIndex=0}={}){
 const normalized=normalizePhrase(phrase);if(!['auto','native',RECOVERY_FORMAT].includes(format))throw new Error('Choose a supported wallet recovery format.');
 if(!Number.isInteger(accountIndex)||accountIndex<0||accountIndex>4294967295)throw new Error('Enter a valid account index, starting at 0.');
 let native,entropy,phraseBytes,passwordBytes;
 try{
  native=await recoveryNative();
  let recoveryFormat=RECOVERY_FORMAT;
  if(format!==RECOVERY_FORMAT){
   phraseBytes=new TextEncoder().encode(normalized);passwordBytes=new TextEncoder().encode(seedPassphrase);
   if(phraseBytes.length>2048||passwordBytes.length>1024)throw new Error('Recovery words or seed passphrase are too long.');
   new Uint8Array(native.memory.buffer,native.phrase_buffer(),phraseBytes.length).set(phraseBytes);
   new Uint8Array(native.memory.buffer,native.password_buffer(),passwordBytes.length).set(passwordBytes);
   const code=native.derive_cipher_seed(phraseBytes.length,passwordBytes.length,accountIndex);
   if(code===2)throw new Error('The Tari seed passphrase is incorrect. This is separate from your new device password.');
   if(code===3)throw new Error('This Tari CipherSeed version is unsupported. Use the wallet that created it to export its L2 keys.');
   if(code===0)recoveryFormat=NATIVE_RECOVERY_FORMAT;
   else if(format==='native')throw new Error('Invalid Tari CipherSeed phrase. Check all 24 words and their order.');
  }
  if(recoveryFormat===RECOVERY_FORMAT){
   if(!validateMnemonic(normalized,recoveryWordlist))throw new Error('Invalid recovery phrase. Check all 24 words and their order.');
   if(seedPassphrase||accountIndex!==0)throw new Error('Existing Hauntboard phrases use account 0 without a seed passphrase. Select Tari CipherSeed for a native wallet.');
   entropy=mnemonicToEntropy(normalized,recoveryWordlist);new Uint8Array(native.memory.buffer,native.seed_buffer(),32).set(entropy);native.derive_keys();
  }
  const keys=new Uint8Array(native.memory.buffer,native.key_buffer(),64);return {phrase:normalized,owner:new Uint8Array(keys.subarray(0,32)),view:new Uint8Array(keys.subarray(32)),recoveryFormat,accountIndex};
 }finally{entropy?.fill(0);phraseBytes?.fill(0);passwordBytes?.fill(0);native?.clear_buffers();}
}
