// Read a public transaction only. No wallet credentials, signing or submission.
import {writeFile} from 'node:fs/promises';
import * as sdk from '../web/vendor/wallet-sdk.mjs';
import {transactionIdentity} from '../web/transaction-identity.mjs';
import {readFile} from 'node:fs/promises';
const id=process.argv[2];if(!/^[a-f0-9]{64}$/.test(id??''))throw Error('Supply one public Esmeralda transaction ID.');
const source=`https://ootle-indexer-a.tari.com/transactions/${id}`;
const response=await fetch(source,{redirect:'error',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error(`Public lookup failed (${response.status}).`);
const row=JSON.parse(await response.text(),(_key,value,context)=>typeof value==='number'&&!Number.isSafeInteger(value)?JSON.rawJSON(context.source):value);
const raw=row.transaction?.transaction??row.transaction;
if(raw?.V1?.body?.transaction?.network!==38||(raw.V1.body.transaction.blob_hashes??[]).length)throw Error('Expected an Esmeralda transaction with no pruned blob payloads.');
const envelope=sdk.sealTransaction({sealedJson:JSON.stringify(raw)});
if(await transactionIdentity(envelope,()=>readFile('hauntboard/web/transaction-identity.wasm'))!==id)throw Error('Native identity does not match the provider ID.');
await writeFile('hauntboard/tests/fixtures/esmeralda-identity.json',JSON.stringify({id,envelope,source,checkedAt:new Date().toISOString(),scope:'Publicly retrieved transaction encoding for a native ID regression vector; no claim of authorship, current availability or finalized execution.'},null,2)+'\n');
console.log('Public identity vector captured and independently matched by the native decoder.');
