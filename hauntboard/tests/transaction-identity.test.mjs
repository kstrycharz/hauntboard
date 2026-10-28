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
test('native identity matches the archived public Esmeralda vector with an exact u64 nonce',async()=>{
 const vector=JSON.parse(await readFile('hauntboard/tests/fixtures/esmeralda-identity.json','utf8'));
 assert.equal(await transactionIdentity(vector.envelope,load),vector.id);
});

// Indexer retention is bounded. Run this external compatibility check explicitly
// with a currently available public ID; ordinary unit checks stay offline.
test('native identity agrees with an explicitly selected public Esmeralda transaction',{skip:!process.env.HAUNTBOARD_LIVE_IDENTITY_TX},async()=>{
 const expected=process.env.HAUNTBOARD_LIVE_IDENTITY_TX;assert.match(expected,/^[a-f0-9]{64}$/);
 const r=await fetch(`https://ootle-indexer-a.tari.com/transactions/${expected}`,{redirect:'error',signal:AbortSignal.timeout(10000)});assert.equal(r.status,200);
 // Preserve u64 nonces exactly. JSON.parse's default Number conversion rounds
 // values above 2^53, changing the signed transaction before BOR encoding.
 const row=JSON.parse(await r.text(),(_key,value,context)=>typeof value==='number'&&!Number.isSafeInteger(value)?JSON.rawJSON(context.source):value),raw=row.transaction?.transaction??row.transaction;
 assert.deepEqual(raw.V1.body.transaction.blob_hashes??[],[],'Pruned blobs cannot be reconstructed by the transaction encoder.');
 const envelope=sdk.sealTransaction({sealedJson:JSON.stringify(raw)});
 assert.equal(await transactionIdentity(envelope,load),expected);
});
