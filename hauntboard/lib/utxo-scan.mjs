import {decodeUtxoStream} from '../web/indexer-codec.mjs';
import {decodeUtxo} from '../web/vendor/wallet-sdk.mjs';
const resource=`resource_${'01'.repeat(32)}`;
export function scanCursor(value){
 if(value===null||value===undefined)return {v:1,versions:Array.from({length:256},(_,i)=>[i+1,0]),pending:Array.from({length:256},(_,i)=>i+1)};
 if(value.v!==1||!Array.isArray(value.versions)||value.versions.length!==256||!Array.isArray(value.pending)||value.pending.length>256)throw Error('Invalid scan cursor');
 const shards=new Set();
 for(const [shard,version] of value.versions){if(!Number.isInteger(shard)||shard<1||shard>256||shards.has(shard)||!Number.isSafeInteger(version)||version<0)throw Error('Invalid shard scan cursor');shards.add(shard);}
 if(new Set(value.pending).size!==value.pending.length||value.pending.some(s=>!shards.has(s)))throw Error('Invalid pending scan shards');
 return {v:1,versions:value.versions.map(p=>[...p]),pending:[...value.pending]};
}
export async function scanUtxos({cursor,origin,loadCodec,fetchImpl=fetch}){
 const next=scanCursor(cursor),selected=next.pending.splice(0,32),versions=new Map(next.versions);
 const request=async(path,body)=>{const r=await fetchImpl(origin+'/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(25000),redirect:'error'});if(!r.ok)throw Error('Private-output provider unavailable');return r;};
 const response=await request('utxos/stream',{resource_address:resource,shard_state_versions:selected.map(s=>[s,versions.get(s)]),per_shard_limit:2,unspent_only:true});
 const reader=response.body.getReader(),chunks=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2097152)throw Error('Private-output stream capacity exceeded');chunks.push(value);}}catch(e){await reader.cancel();throw e;}
 const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
 const frames=await decodeUtxoStream(bytes,loadCodec),pairs=new Map();let current=null;
 const seen=new Set();
 for(const frame of frames){
  if(frame.sos){if(current||!selected.includes(frame.sos.shard)||seen.has(frame.sos.shard)||!Number.isSafeInteger(frame.sos.max_state_version))throw Error('Invalid private-output shard stream');current={...frame.sos,count:0};seen.add(current.shard);}
  if(frame.update){if(!current)throw Error('Output outside shard');current.count++;const u=frame.update.Unspent;if(u){if(!Number.isInteger(u.tag)||u.tag<0||u.tag>4294967295||!Array.isArray(u.public_nonce)||u.public_nonce.length!==32||u.public_nonce.some(b=>!Number.isInteger(b)||b<0||b>255))throw Error('Invalid private-output locator');const nonce=Buffer.from(u.public_nonce).toString('hex');pairs.set(`${u.tag}:${nonce}`,[u.tag,nonce]);}}
  if(frame.eos){if(!current||frame.eos.max_state_version!==current.max_state_version||current.count!==current.num_updates||current.max_state_version<versions.get(current.shard))throw Error('Incomplete private-output shard stream');versions.set(current.shard,current.max_state_version);if(current.has_more){if(current.max_state_version===next.versions.find(([s])=>s===current.shard)[1])throw Error('Private-output cursor did not advance');next.pending.push(current.shard);}current=null;}
 }
 // Shards with no changes after the requested version are omitted by the indexer.
 // Their cursor remains unchanged; a later pass still requests that same version.
 if(current)throw Error('Private-output stream ended within a shard');
 const rows=new Map(),locators=[...pairs.values()];
 for(let start=0;start<locators.length;start+=100){let pageCursor=null;for(let page=0;page<20;page++){
  const data=await(await request('utxos/fetch',{resource_address:resource,tag_and_nonce_pairs:locators.slice(start,start+100),...(pageCursor?{cursor:pageCursor}:{})})).json();
  if(!Array.isArray(data.utxos))throw Error('Invalid private-output fetch');
  for(const [id,value] of data.utxos){if(!/^[a-f0-9]{64}$/.test(id)||rows.has(id))throw Error('Invalid or repeated private output');rows.set(id,decodeUtxo(value));if(rows.size>1000)throw Error('Private-output scan capacity exceeded');}
  if(!data.next_cursor)break;if(data.next_cursor===pageCursor||page===19)throw Error('Private-output fetch did not finish');pageCursor=data.next_cursor;
 }}
 next.versions=[...versions];return {utxos:[...rows],nextCursor:next,complete:next.pending.length===0};
}
