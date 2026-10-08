export {TransactionBuilder,Network,literalArg,intLiteral,amountLiteral,bytesLiteral,resolveTransaction,signTransaction,sealTransaction,watchTransaction,sendDryRun,iterVaultIdsInState,XTR_FAUCET_COMPONENT_ADDRESS,XTR_FAUCET_VAULT_ADDRESS,XTR_FAUCET_CLAIM_RESOURCE_ADDRESS} from '@tari-project/ootle';
export {SecretKeyWallet,EphemeralKeySigner} from '@tari-project/ootle-secret-key-wallet';
export {WasmStealthCrypto,OotleWallet,WalletStealthAuthorizer,StealthInput,StealthTransferStatement,stealthTransferInstruction,stealthUtxoSubstateId,commitmentOf,createOutput,decryptOwnedUtxo} from '@tari-project/ootle';
export {generateOotleSecretKey,ootlePublicKeyFromSecretKey,generateOotleAddress} from '@tari-project/ootle-wasm';
export {borEncodeTransaction} from '@tari-project/ootle-wasm';
export {generateMnemonic,validateMnemonic,mnemonicToEntropy} from '@scure/bip39';
export {signBalanceProof,Mask,resourceAddressLiteral} from '@tari-project/ootle';
export {wordlist as recoveryWordlist} from '@scure/bip39/wordlists/english.js';
import {Encoder} from 'cbor-x';
const encoder=new Encoder({useRecords:false});
// tari_template_lib 0.33 Vec<u8> parameters require a CBOR array, rather than a byte-string literal.
export function vectorLiteral(bytes){return {Literal:Array.from(encoder.encode(Array.from(bytes)),x=>x.toString(16).padStart(2,'0')).join('')};}
