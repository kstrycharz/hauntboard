// Live provider assertions. This remains provider-reported evidence, not browser consensus verification.
export function validateTestnetWitness(checks,expectedVersion=null){
  for(const path of ['network','info','validators','epoch-manager/stats'])if(checks[path]?.status!==200)throw new Error('PUBLIC_TESTNET_PROVIDER_UNAVAILABLE');
  const n=checks.network.body,info=checks.info.body,roster=checks.validators.body,stats=checks['epoch-manager/stats'].body;
  if(n?.network!=='esmeralda'||n.network_byte!==38||info?.network!=='esmeralda'||info.network_byte!==38)throw new Error('PUBLIC_TESTNET_NETWORK_MISMATCH');
  if(!/^\d+\.\d+\.\d+$/.test(info.version??'')||(expectedVersion&&info.version!==expectedVersion))throw new Error('PUBLIC_TESTNET_RUNTIME_MISMATCH');
  if(info.verify_substate_proofs!==true)throw new Error('PUBLIC_TESTNET_PROOF_VERIFICATION_DISABLED');
  if(!Number.isSafeInteger(stats?.current_epoch)||!Number.isSafeInteger(stats.current_block_height)||stats.current_block_height<=0||!/^[a-f0-9]{64}$/.test(stats.current_block_hash??''))throw new Error('PUBLIC_TESTNET_CHAIN_STATE_UNAVAILABLE');
  if(!Number.isSafeInteger(roster?.epoch)||Math.abs(roster.epoch-stats.current_epoch)>1||!Array.isArray(roster.validators)||!roster.validators.length||roster.validators.some(v=>!/^[a-f0-9]{64}$/.test(v.public_key??'')||typeof v.peer_id!=='string'||!v.peer_id))throw new Error('PUBLIC_TESTNET_VALIDATOR_ROSTER_UNAVAILABLE');
  return {network:'esmeralda',networkByte:38,runtimeVersion:info.version,epoch:stats.current_epoch,blockHeight:stats.current_block_height,blockHash:stats.current_block_hash,validatorCount:roster.validators.length,validatorPublicKeys:roster.validators.map(v=>v.public_key).sort(),proofVerificationEnabled:true,sidechainId:info.sidechain_id??null};
}
export async function readTestnetWitness(origin,expectedVersion){
  const checks=Object.fromEntries(await Promise.all(['network','info','validators','epoch-manager/stats'].map(async path=>{const r=await fetch(`${origin}/${path}`,{redirect:'error',signal:AbortSignal.timeout(5000)});return [path,{status:r.status,body:await r.json()}];})));
  return validateTestnetWitness(checks,expectedVersion);
}
