// Shared by browser and server. A reset identifier is operator-pinned; never inferred from epoch.
export function networkProfile(value) {
  const bytes={localnet:16,esmeralda:38};
  if(!value||!Object.hasOwn(bytes,value.network)||value.networkByte!==bytes[value.network])throw new Error('Unsupported or mismatched test network. Mainnet is disabled.');
  if(typeof value.resetIdentity!=='string'||! /^[a-zA-Z0-9._-]{1,128}$/.test(value.resetIdentity))throw new Error('A pinned network reset identity is required.');
  return Object.freeze({network:value.network,networkByte:value.networkByte,resetIdentity:value.resetIdentity});
}
export const networkKey=p=>`${p.network}:${p.resetIdentity}`;
