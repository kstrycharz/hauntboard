import { openVault, sealVault, newRecoverySecret } from './room-keys.mjs';
let session, epoch = 0;
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('hauntboard-room-vault-lock') : null;
channel?.addEventListener('message', () => lockRoomVault(false));
export const vaultScope = p => JSON.stringify(['hauntboard-room-vault',1,p.network,p.resetIdentity]);
const locator = p => `hauntboard-room-vault:${vaultScope(p)}`;
export function roomVaultExists(profile){return Boolean(localStorage.getItem(locator(profile)));}
export function roomVaultActive() { return Boolean(session); }
export function lockRoomVault(broadcast=true) { epoch++;session=null; if(broadcast)channel?.postMessage('lock'); window.dispatchEvent(new Event('room-vault-locked')); }
function current(profile) {
  if(!session || session.scope!==vaultScope(profile)) throw Error('Unlock your room vault first.');
  return session;
}
async function persist(profile, target, value, stillCurrent) {
  if(!navigator.locks) throw Error('This browser needs Web Locks for safe vault writes.');
  await navigator.locks.request(locator(profile),async()=>{
    if(!stillCurrent()) throw Error('Room access was locked or changed. Unlock it and try again.');
    if(localStorage.getItem(locator(profile))!==target.persisted) throw Error('Room vault changed in another tab. Lock and unlock it again.');
    const encrypted=JSON.stringify(await sealVault(value,target.secret,target.scope));
    // Locking while WebCrypto runs must not write or reopen a closed session.
    if(!stillCurrent()) throw Error('Room access was locked or changed. Unlock it and try again.');
    localStorage.setItem(locator(profile),encrypted);
    target.persisted=encrypted;target.value=value;
  });
}
export async function createRoomVault(profile) {
  if(localStorage.getItem(locator(profile))) throw Error('Unlock or restore the existing room vault.');
  const before=epoch,prior=session,secret=newRecoverySecret();
  const candidate={scope:vaultScope(profile),secret,value:{v:1,rooms:{}},persisted:null};
  await persist(profile,candidate,candidate.value,()=>epoch===before&&session===prior);
  epoch++;session=candidate;return secret;
}
export async function unlockRoomVault(profile, secret, backup) {
  const before=epoch,prior=session,persisted=localStorage.getItem(locator(profile));
  const encrypted=backup??JSON.parse(persisted??'null');
  const value=await openVault(encrypted,secret,vaultScope(profile));
  if(value?.v!==1 || !value.rooms || typeof value.rooms!=='object' || Array.isArray(value.rooms) || Object.keys(value.rooms).length>128) throw Error('Invalid room vault.');
  if(Object.keys(value.rooms).some(key=>!/^component_[a-f0-9]{64}$/.test(key))) throw Error('Invalid room locator in backup.');
  const unchanged=()=>epoch===before&&session===prior;
  if(!unchanged()||localStorage.getItem(locator(profile))!==persisted) throw Error('Room access changed while unlocking. Try again.');
  const candidate={scope:vaultScope(profile),secret,value,persisted};
  // An imported vault only replaces local data after a successful authenticated decrypt.
  if(backup) await persist(profile,candidate,value,unchanged);
  if(!unchanged()) throw Error('Room access changed while unlocking. Try again.');
  epoch++;session=candidate;
}
export function roomRecord(profile, thread) {
  // Detached records keep failed writes from activating unsaved keys/actions.
  return structuredClone(current(profile).value.rooms[thread]??null);
}
export async function setRoomRecord(profile, thread, value) {
  const target=current(profile),record=structuredClone(value);
  if(!/^component_[a-f0-9]{64}$/.test(thread)) throw Error('Invalid room locator.');
  const operation=(target.queue??Promise.resolve()).then(async()=>{
    if(session!==target) throw Error('Unlock your room vault first.');
    const next=structuredClone(target.value);
    if(!Object.hasOwn(next.rooms,thread) && Object.keys(next.rooms).length>=128) throw Error('Vault capacity reached.');
    next.rooms[thread]=record;
    await persist(profile,target,next,()=>session===target);
  });
  target.queue=operation.catch(()=>{});await operation;
}
export async function saveRoomVault(profile) {
  const target=current(profile);
  const operation=(target.queue??Promise.resolve()).then(()=>persist(profile,target,structuredClone(target.value),()=>session===target));
  target.queue=operation.catch(()=>{});await operation;
}
export function exportRoomVault(profile) {
  const target=current(profile),stored=localStorage.getItem(locator(profile));
  if(stored!==target.persisted) throw Error('Room vault changed in another tab. Lock and unlock it before exporting.');
  return JSON.parse(stored);
}
