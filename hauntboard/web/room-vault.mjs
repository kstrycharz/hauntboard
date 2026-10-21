import { openVault, sealVault, newRecoverySecret } from './room-keys.mjs';
let session;
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('hauntboard-room-vault-lock') : null;
channel?.addEventListener('message', () => { session=null; window.dispatchEvent(new Event('room-vault-locked')); });
export const vaultScope = p => JSON.stringify(['hauntboard-room-vault',1,p.network,p.resetIdentity]);
const locator = p => `hauntboard-room-vault:${vaultScope(p)}`;
export function roomVaultExists(profile){return Boolean(localStorage.getItem(locator(profile)));}
export function roomVaultActive() { return Boolean(session); }
export function lockRoomVault(broadcast=true) { session=null; if(broadcast)channel?.postMessage('lock'); window.dispatchEvent(new Event('room-vault-locked')); }
export async function createRoomVault(profile) {
  if(localStorage.getItem(locator(profile))) throw Error('Unlock or restore the existing room vault.');
  const secret=newRecoverySecret(); session={scope:vaultScope(profile),secret,value:{v:1,rooms:{}},persisted:null}; await saveRoomVault(profile); return secret;
}
export async function unlockRoomVault(profile, secret, backup) {
  const encrypted=backup??JSON.parse(localStorage.getItem(locator(profile))??'null');
  const value=await openVault(encrypted,secret,vaultScope(profile));
  if(value?.v!==1 || !value.rooms || typeof value.rooms!=='object' || Array.isArray(value.rooms) || Object.keys(value.rooms).length>128) throw Error('Invalid room vault.');
  session={scope:vaultScope(profile),secret,value,persisted:localStorage.getItem(locator(profile))};
  // An imported vault only replaces local data after a successful authenticated decrypt.
  if(backup) await saveRoomVault(profile);
}
export function roomRecord(profile, thread) {
  if(!session || session.scope!==vaultScope(profile)) throw Error('Unlock your room vault first.');
  return session.value.rooms[thread]??null;
}
export async function setRoomRecord(profile, thread, value) {
  roomRecord(profile,thread);
  if(!/^component_[a-f0-9]{64}$/.test(thread)) throw Error('Invalid room locator.');
  if(!Object.hasOwn(session.value.rooms,thread) && Object.keys(session.value.rooms).length>=128) throw Error('Vault capacity reached.');
  session.value.rooms[thread]=value; await saveRoomVault(profile);
}
export async function saveRoomVault(profile) {
  roomRecord(profile,'');
  if(!navigator.locks) throw Error('This browser needs Web Locks for safe vault writes.');
  await navigator.locks.request(locator(profile),async()=>{
    const prior=localStorage.getItem(locator(profile));
    if(session.persisted!==undefined && prior!==session.persisted) throw Error('Room vault changed in another tab. Lock and unlock it again.');
    const encrypted=JSON.stringify(await sealVault(session.value,session.secret,session.scope));
    localStorage.setItem(locator(profile),encrypted);session.persisted=encrypted;
  });
}
export function exportRoomVault(profile) { roomRecord(profile,''); return JSON.parse(localStorage.getItem(locator(profile))); }
