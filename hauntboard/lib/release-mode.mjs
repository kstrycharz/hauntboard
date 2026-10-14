export function testnetBeta(env) {
  const value=env.HAUNTBOARD_TESTNET_BETA??'false';
  if(!['true','false'].includes(value))throw new Error('INVALID_TESTNET_BETA_SETTING');
  return value==='true';
}
export function validatePublicManifest(c,beta=false) {
  if(c.network!=='esmeralda'||c.networkByte!==38||c.sdkVersion!=='0.7.0'||c.wasmVersion!=='0.43.0')throw new Error('Public runtime configuration is invalid.');
  if(c.schema!==4||c.posterPrivacy!=='stealth-fee-v1')throw new Error('The public board requires the no-author schema-4 contract.');
  if(!beta&&c.compatibilityVerified!==true)throw new Error('Public runtime compatibility gate has not passed.');
  if(!beta&&c.posterPrivacyVerified!==true)throw new Error('Poster privacy release gate has not passed.');
}
