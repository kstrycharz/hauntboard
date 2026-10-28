import {test} from 'node:test';
import assert from 'node:assert/strict';
import {testnetBeta,validatePublicManifest} from '../lib/release-mode.mjs';
const manifest={network:'esmeralda',networkByte:38,sdkVersion:'0.11.1',wasmVersion:'0.47.0',providerRuntimeVersion:'0.45.0',schema:4,posterPrivacy:'stealth-fee-v1',compatibilityVerified:false,posterPrivacyVerified:false};
test('testnet beta allows owner-operated frontend testing without fabricating release evidence',()=>{
  assert.equal(testnetBeta({}),false);assert.equal(testnetBeta({HAUNTBOARD_TESTNET_BETA:'true'}),true);
  assert.throws(()=>testnetBeta({HAUNTBOARD_TESTNET_BETA:'yes'}));
  assert.throws(()=>validatePublicManifest(manifest));
  validatePublicManifest(manifest,true);
  for(const providerRuntimeVersion of [undefined,'0.99.0','0.99.0-rc.1'])validatePublicManifest({...manifest,providerRuntimeVersion},true);
  assert.equal(manifest.posterPrivacyVerified,false);
  for(const change of [{network:'mainnet'},{networkByte:16},{schema:3},{posterPrivacy:null},{sdkVersion:'wrong'}])assert.throws(()=>validatePublicManifest({...manifest,...change},true));
  assert.throws(()=>validatePublicManifest({...manifest,compatibilityVerified:true}));
  validatePublicManifest({...manifest,compatibilityVerified:true,posterPrivacyVerified:true});
});
