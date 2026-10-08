import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as sdk from '../web/vendor/wallet-sdk.mjs';
import {transactionIdentity,transactionMetadata} from '../web/transaction-identity.mjs';
const load=()=>readFile('hauntboard/web/transaction-identity.wasm');
test('released Tari decoder computes stable signed identity and rejects malformed BOR',async()=>{
 const signer=sdk.SecretKeyWallet.randomWithViewKey(16);
 const build=()=>new sdk.TransactionBuilder(16,5).callMethod({componentAddress:`component_${'a'.repeat(64)}`,methodName:'get_counts'},[]).buildUnsignedTransaction();
 const sealed=sdk.sealTransaction(await sdk.signTransaction([signer],build()));
 const id=await transactionIdentity(sealed,load);assert.match(id,/^[a-f0-9]{64}$/);assert.equal(await transactionIdentity(sealed,load),id);
 const metadata=await transactionMetadata(sealed,load);assert.equal(metadata.id,id);assert.ok(Number.isSafeInteger(metadata.maxEpoch));assert.ok(metadata.maxEpoch>0);
 const changed=new sdk.TransactionBuilder(16,6).callMethod({componentAddress:`component_${'a'.repeat(64)}`,methodName:'get_counts'},[]).buildUnsignedTransaction();
 assert.notEqual(await transactionIdentity(sdk.sealTransaction(await sdk.signTransaction([signer],changed)),load),id);
 for(const envelope of ['','!','AAAA','a'.repeat(20001)])await assert.rejects(transactionIdentity(envelope,load));
});
test('native identity agrees with an already confirmed Esmeralda board creation',async()=>{
 const expected='4cea075beef93e8a5cd7203f030006c88a236d53e02c809f158378d24045811e';
 const r=await fetch(`https://ootle-indexer-a.tari.com/transactions/${expected}`,{redirect:'error',signal:AbortSignal.timeout(10000)});assert.equal(r.status,200);
 const row=await r.json(),raw=row.transaction?.transaction??row.transaction;
 const envelope=sdk.sealTransaction({sealedJson:JSON.stringify(raw)});
 assert.equal(await transactionIdentity(envelope,load),expected);
});
