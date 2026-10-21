// No key material is involved. Released Tari code owns BOR decoding and transaction hashing.
let modulePromise;
export async function transactionMetadata(envelope,load=()=>fetch('/transaction-identity.wasm').then(r=>{if(!r.ok)throw new Error('Transaction identity module unavailable.');return r.arrayBuffer();})){
 if(typeof envelope!=='string'||envelope.length>349528||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(envelope))throw new Error('Invalid signed transaction envelope.');
 modulePromise??=Promise.resolve(load()).then(bytes=>WebAssembly.compile(bytes)).catch(e=>{modulePromise=null;throw e;});
 const instance=await WebAssembly.instantiate(await modulePromise,{}),native=instance.exports;
 const bytes=Uint8Array.from(atob(envelope),c=>c.charCodeAt(0));
 if(!bytes.length||bytes.length>262144)throw new Error('Invalid signed transaction size.');
 new Uint8Array(native.memory.buffer,native.transaction_buffer(),bytes.length).set(bytes);
 if(native.transaction_identity(bytes.length)!==0)throw new Error('Tari rejected the signed transaction encoding.');
 return {id:[...new Uint8Array(native.memory.buffer,native.identity_buffer(),32)].map(b=>b.toString(16).padStart(2,'0')).join(''),maxEpoch:Number(native.transaction_max_epoch())};
}
export async function transactionIdentity(envelope,load){return (await transactionMetadata(envelope,load)).id;}
