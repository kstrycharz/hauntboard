// Read-only probe: no signing, funding, account creation or publication.
import {writeFile} from 'node:fs/promises';
import {validateTestnetWitness} from '../lib/testnet-provider.mjs';
import {TARI_TESTNET_PROVIDERS} from '../lib/server-profile.mjs';
const origins=(process.env.PROBE_PROVIDERS??TARI_TESTNET_PROVIDERS.join(',')).split(',');
const checks=await Promise.all(origins.map(async origin=>{
  const u=new URL(origin);if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash||!TARI_TESTNET_PROVIDERS.includes(u.origin))throw new Error('Tari-hosted Esmeralda HTTPS origin required');
  const result={origin:u.origin};
  for(const path of ['network','identity','info','validators','epoch-manager/stats']){
    try{const r=await fetch(`${u.origin}/${path}`,{signal:AbortSignal.timeout(15000),redirect:'error',headers:{Origin:'https://hauntboard.invalid'}});result[path]={status:r.status,cors:r.headers.get('access-control-allow-origin'),body:await r.json()};}
    catch{result[path]={reachable:false};}
  }
  result.networkMatches=result.network?.status===200&&result.network.body?.network==='esmeralda'&&result.network.body?.network_byte===38;
  try{result.liveWitness=validateTestnetWitness(result);result.liveTestnetChecksPass=true;}catch(e){result.liveTestnetChecksPass=false;result.failure=e.message;}
  return result;
}));
const rosterAgreement=checks.every(c=>c.liveTestnetChecksPass)&&checks.every(c=>JSON.stringify(c.liveWitness.validatorPublicKeys)===JSON.stringify(checks[0].liveWitness.validatorPublicKeys));
const report={checkedAt:new Date().toISOString(),status:checks.every(c=>c.liveTestnetChecksPass)&&rosterAgreement?'READ_ONLY_LIVE_TESTNET_CHECKS_PASS':'NETWORK_GATE_FAILED',validatorRosterAgreement:rosterAgreement,checks,pinnedBuild:{sdk:'0.7.0',wasm:'0.43.0'},limitations:['These are HTTPS indexer and provider-reported validator checks, not direct validator P2P connections or independent consensus verification.','Runtime compatibility with this client, reset identity, funding, CORS browser journey and private scan/spend are not proven by this read-only probe.']};
await writeFile('hauntboard/evidence/public-network-probe.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
if(report.status==='NETWORK_GATE_FAILED')process.exitCode=1;
