// Released Tari BOR/protobuf codecs. Buffers are used synchronously after loading.
let pending;
async function native(load){
 pending??=Promise.resolve(load?load():fetch('/transaction-identity.wasm').then(r=>{if(!r.ok)throw Error('Indexer codec unavailable');return r.arrayBuffer();})).then(bytes=>WebAssembly.instantiate(bytes,{})).then(x=>x.instance.exports).catch(e=>{pending=null;throw e;});
 return pending;
}
async function run(bytes,method,load){
 if(bytes.length>2097152)throw Error('Indexer response exceeds codec limit');
 const n=await native(load);new Uint8Array(n.memory.buffer,n.codec_input(),bytes.length).set(bytes);
 const len=n[method](bytes.length);if(!len)throw Error('Tari rejected the indexer encoding');
 return new Uint8Array(new Uint8Array(n.memory.buffer,n.codec_output(),len));
}
export async function decodeUtxoStream(bytes,load){return JSON.parse(new TextDecoder().decode(await run(bytes,'decode_utxo_stream',load)));}
export async function encodeSubstate(value,load){const bytes=await run(new TextEncoder().encode(JSON.stringify(value)),'encode_substate',load);return btoa(String.fromCharCode(...bytes));}
