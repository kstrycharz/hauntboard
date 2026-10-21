// Recipient key delivery. All private material stays in the browser.
import { base64, unbase64, newThreadKey } from './crypto.mjs';
import { CipherSuite, DhkemP256HkdfSha256, HkdfSha256, Aes256Gcm } from './vendor/hpke.mjs';
const enc = new TextEncoder(), dec = new TextDecoder('utf-8', { fatal: true });
const suite = () => new CipherSuite({ kem: new DhkemP256HkdfSha256(), kdf: new HkdfSha256(), aead: new Aes256Gcm() });
const component = /^component_[a-f0-9]{64}$/;
export const MAX_MEMBERS = 16, MAX_GENERATIONS = 16;
export function roomScope(profile, board, thread) {
  if (!['localnet','esmeralda'].includes(profile.network) || typeof profile.resetIdentity !== 'string' || !profile.resetIdentity || !component.test(board) || !component.test(thread)) throw Error('Invalid room context.');
  return JSON.stringify(['hauntboard-room', 1, profile.network, profile.resetIdentity, board, thread]);
}
const info = (scope, generation, recipient) => enc.encode(JSON.stringify(['hauntboard-room-envelope', 1, scope, generation, recipient]));
export async function digest(value) { return base64(new Uint8Array(await crypto.subtle.digest('SHA-256', typeof value === 'string' ? enc.encode(value) : value))); }
export async function recipientIdentity(scope) {
  const s = suite(), pair = await s.kem.generateKeyPair();
  const publicKey = base64(new Uint8Array(await s.kem.serializePublicKey(pair.publicKey)));
  return { scope, publicKey, privateKey: await crypto.subtle.exportKey('jwk', pair.privateKey), id: await digest(unbase64(publicKey)) };
}
export async function recipientRequest(identity) {
  return { format:'hauntboard-recipient', v:1, scope:identity.scope, publicKey:identity.publicKey, id: await digest(unbase64(identity.publicKey)) };
}
export async function validateRequest(request, scope) {
  if(request?.format !== 'hauntboard-recipient' || request.v !== 1 || request.scope !== scope || unbase64(request.publicKey).length !== 65 || request.id !== await digest(unbase64(request.publicKey))) throw Error('Recipient request belongs to another room or is invalid.');
  await suite().kem.deserializePublicKey(unbase64(request.publicKey));
  return request;
}
function validateKeys(keys, generation) {
  if(!Number.isInteger(generation) || generation<0 || generation>=MAX_GENERATIONS || !Array.isArray(keys) || !keys.length || keys.length>MAX_GENERATIONS+1 || keys.some((e,i)=> !Number.isInteger(e.generation) || e.generation< -1 || e.generation>generation || (i && e.generation<=keys[i-1].generation) || unbase64(e.key).length!==32) || keys.at(-1).generation!==generation) throw Error('Invalid room key history.');
}
export async function wrapRoomKeys(request, scope, generation, keys) {
  await validateRequest(request, scope); validateKeys(keys, generation);
  const s = suite(), recipientPublicKey = await s.kem.deserializePublicKey(unbase64(request.publicKey));
  const ctx = await s.createSenderContext({ recipientPublicKey, info:info(scope,generation,request.id) });
  const plain = enc.encode(JSON.stringify({scope,generation,keys}));
  try { return { v:1, recipient:request.id, generation, enc:base64(new Uint8Array(ctx.enc)), ct:base64(new Uint8Array(await ctx.seal(plain))) }; }
  finally { plain.fill(0); }
}
export async function unwrapRoomKeys(envelope, identity, scope, generation) {
  if(identity.scope!==scope || envelope?.v!==1 || envelope.generation!==generation || envelope.recipient!==identity.id || identity.id!==await digest(unbase64(identity.publicKey)) || unbase64(envelope.enc).length!==65 || unbase64(envelope.ct).length>2048) throw Error('Envelope recipient or room context does not match.');
  const s = suite(), recipientKey = await s.kem.importKey('jwk', identity.privateKey, false);
  const ctx = await s.createRecipientContext({ recipientKey, enc:unbase64(envelope.enc), info:info(scope,generation,identity.id) });
  let plain;
  try {
    plain=new Uint8Array(await ctx.open(unbase64(envelope.ct)));
    const value=JSON.parse(dec.decode(plain));
    if(value.scope!==scope || value.generation!==generation) throw Error('Invalid envelope context.');
    validateKeys(value.keys,generation); return value.keys;
  } finally { plain?.fill(0); }
}
export function newRecoverySecret() { return newThreadKey(); }
async function recoveryKey(secret, salt) {
  const bytes=unbase64(secret); if(bytes.length!==32) throw Error('Use the full 256-bit room recovery secret.');
  try { const base=await crypto.subtle.importKey('raw',bytes,'HKDF',false,['deriveKey']); return crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt,info:enc.encode('hauntboard-room-vault-v1')},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']); }
  finally { bytes.fill(0); }
}
export async function sealVault(value, secret, scope) {
  const salt=crypto.getRandomValues(new Uint8Array(32)), iv=crypto.getRandomValues(new Uint8Array(12));
  const plain=enc.encode(JSON.stringify(value));
  if(plain.length>2000000) throw Error('Room vault is too large.');
  try { return {format:'hauntboard-room-vault',v:1,scope,salt:base64(salt),iv:base64(iv),ct:base64(new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(scope)},await recoveryKey(secret,salt),plain)))}; }
  finally {plain.fill(0);}
}
export async function openVault(value, secret, scope) {
  if(value?.format!=='hauntboard-room-vault' || value.v!==1 || value.scope!==scope || unbase64(value.salt).length!==32 || unbase64(value.iv).length!==12 || typeof value.ct!=='string' || value.ct.length>2800000) throw Error('Unsupported vault or different network/reset.');
  let plain;
  try { plain=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:unbase64(value.iv),additionalData:enc.encode(scope)},await recoveryKey(secret,unbase64(value.salt)),unbase64(value.ct))); return JSON.parse(dec.decode(plain)); }
  catch {throw Error('Wrong recovery secret or damaged room vault.');}
  finally {plain?.fill(0);}
}
export function nextGeneration(keys) {
  validateKeys(keys,keys.at(-1)?.generation);
  if(keys.at(-1).generation+1>=MAX_GENERATIONS) throw Error('Room generation capacity reached. Create a successor room.');
  return [...keys,{generation:keys.at(-1).generation+1,key:newThreadKey()}];
}
export async function rotationEnvelopes(requests, scope, keys) {
  if(!requests.length || requests.length>MAX_MEMBERS || new Set(requests.map(r=>r.id)).size!==requests.length) throw Error('Invalid or duplicate remaining members.');
  return Promise.all(requests.map(request=>wrapRoomKeys(request,scope,keys.at(-1).generation,keys)));
}
