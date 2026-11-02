export {TransactionBuilder,Network,literalArg,intLiteral,amountLiteral,bytesLiteral,resolveTransaction,signTransaction,sealTransaction,sendDryRun,iterVaultIdsInState,decodeSubstateValue,decodeExecuteResult,decodeUtxo,XTR_FAUCET_COMPONENT_ADDRESS,XTR_FAUCET_VAULT_ADDRESS,XTR_FAUCET_CLAIM_RESOURCE_ADDRESS} from '@tari-project/ootle';
export {SecretKeyWallet,EphemeralKeySigner} from '@tari-project/ootle-secret-key-wallet';
export {WasmStealthCrypto,OotleWallet,WalletStealthAuthorizer,StealthInput,StealthTransferStatement,stealthTransferInstruction,stealthUtxoSubstateId,commitmentOf,createOutput} from '@tari-project/ootle';
import {decryptOwnedUtxo as nativeDecryptOwnedUtxo,commitmentOf as nativeCommitment,watchTransaction as nativeWatch,decodeExecuteResult as decodeExecution} from '@tari-project/ootle';
// The app accepts normalized historical rows as well as current up/down rows.
// The maintained SDK expects the explicit up-state form. Verification, ownership
// and version checks remain the caller's responsibility; no flag is manufactured.
export async function decryptOwnedUtxo(crypto,secret,row,id){
  if(typeof row.state?.up?.substate==='string')return nativeDecryptOwnedUtxo(crypto,secret,row,id);
  if(row.state&&!row.state.up)return null;
  const value=row.substate??row.state?.up?.substate,utxo=value?.Utxo,commitment=nativeCommitment(id);
  if(!utxo?.output||utxo.is_frozen||!commitment)return null;
  const body=utxo.output.output,unhex=x=>Uint8Array.from(x.match(/../g)??[],b=>parseInt(b,16));
  try{return await crypto.unblindOutput(commitment,unhex(body.encrypted_data),await crypto.deriveAeadKey(secret,unhex(body.public_nonce)),false);}catch{return null;}
}
export async function watchTransaction(provider,id,options){
 const rawProvider={...provider,getTransactionResult:async tx=>{const row=await provider.getTransactionResult(tx),f=row.result?.Finalized;return f?.encoded_execution_result?{...row,result:{Finalized:{...f,execution_result:f.encoded_execution_result}}}:row;}};
 const row=await nativeWatch(rawProvider,id,options),f=row.result?.Finalized;
 return f&&typeof f.execution_result==='string'?{...row,result:{Finalized:{...f,encoded_execution_result:f.execution_result,execution_result:decodeExecution(f.execution_result)}}}:row;
}
export {generateOotleSecretKey,ootlePublicKeyFromSecretKey,generateOotleAddress} from '@tari-project/ootle-wasm';
export {borEncodeTransaction} from '@tari-project/ootle-wasm';
export {generateMnemonic,validateMnemonic,mnemonicToEntropy} from '@scure/bip39';
export {signBalanceProof,Mask,resourceAddressLiteral} from '@tari-project/ootle';
export {wordlist as recoveryWordlist} from '@scure/bip39/wordlists/english.js';
import {Encoder} from 'cbor-x';
const encoder=new Encoder({useRecords:false});
// tari_template_lib 0.33 Vec<u8> parameters require a CBOR array, rather than a byte-string literal.
export function vectorLiteral(bytes){return {Literal:Array.from(encoder.encode(Array.from(bytes)),x=>x.toString(16).padStart(2,'0')).join('')};}
