import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {decodeUtxoStream} from '../web/indexer-codec.mjs';
import {scanCursor,scanUtxos} from '../lib/utxo-scan.mjs';
const loadCodec=()=>readFile('hauntboard/web/transaction-identity.wasm');
// Official length-delimited protobuf: shard 1 reached version 24, no updates.
const frame=Uint8Array.from([10,10,4,8,1,16,24,42,2,8,24]);
test('released protobuf decoder rejects truncated frames and decodes combined shard boundaries',async()=>{
 const decoded=await decodeUtxoStream(frame,loadCodec);assert.equal(decoded[0].sos.shard,1);assert.equal(decoded[0].eos.max_state_version,24);
 await assert.rejects(decodeUtxoStream(frame.slice(0,-1),loadCodec),/Tari rejected/);
});
test('scan advances completed shards and retains omitted shard versions without mutating the saved cursor',async()=>{
 const cursor=scanCursor(null),saved=structuredClone(cursor);
 const result=await scanUtxos({cursor,origin:'https://provider.invalid',loadCodec,fetchImpl:async()=>new Response(frame)});
 assert.deepEqual(cursor,saved);assert.equal(result.nextCursor.versions[0][1],24);assert.equal(result.nextCursor.versions[1][1],0);assert.equal(result.nextCursor.pending.length,224);assert.equal(result.complete,false);
});
test('malformed cursor and failed or truncated provider response cannot advance persisted scanning state',async()=>{
 assert.throws(()=>scanCursor({v:1,versions:[],pending:[]}));const cursor=scanCursor(null),saved=structuredClone(cursor);
 for(const response of [new Response('unavailable',{status:503}),new Response(frame.slice(0,-1))])await assert.rejects(scanUtxos({cursor,origin:'https://provider.invalid',loadCodec,fetchImpl:async()=>response}));
 assert.deepEqual(cursor,saved);
});
