// Decode only provider-verified state from the explicitly pinned registry template.
import { unbase64, base64 } from './crypto.mjs';
const component=/^component_[a-f0-9]{64}$/;
const bytes=(v,n)=>Array.isArray(v)&&v.length===n&&v.every(x=>Number.isInteger(x)&&x>=0&&x<=255);
export function decodeRegistry(row, address, template) {
  const c=row?.substate?.Component, s=c?.body?.state;
  if(!component.test(address)||!/^[a-f0-9]{64}$/.test(template??'') || row?.verified!==true || !Number.isSafeInteger(row.version) || row.version<0 || c?.header?.template_address?.replace(/^template_/,'')!==template || c.header.owner_rule!=='None' || !Array.isArray(s)||s.length!==8||s[0]!==1 || typeof s[1]!=='string'||s[1].length>512||!component.test(s[2])||!component.test(s[3])||!Number.isInteger(s[5])||s[5]<0||s[5]>=16||!Number.isInteger(s[6])||s[6]<0||s[6]>256||!Array.isArray(s[7])||s[7].length!==s[5]+1) throw Error('Unverified or invalid key registry.');
  // Engine versions expose public-key bytes as a hex string or byte array.
  const admin=typeof s[4]==='string'?s[4]:s[4]?.['@cbor']==='bytes'?s[4].hex:bytes(s[4],32)?s[4].map(x=>x.toString(16).padStart(2,'0')).join(''):null;
  if(!/^[a-f0-9]{64}$/.test(admin??'')) throw Error('Invalid room administrator.');
  const generations=s[7].map((members,generation)=>{
    if(!Array.isArray(members)||!members.length||members.length>16) throw Error('Invalid member collection.');
    const seen=new Set();
    return members.map(entry=>{
      if(!Array.isArray(entry)||entry.length!==2||!bytes(entry[0],32)||!Array.isArray(entry[1])||!entry[1].length||entry[1].length>3072||entry[1].some(x=>!Number.isInteger(x)||x<0||x>255)) throw Error('Invalid registry envelope.');
      const id=base64(new Uint8Array(entry[0]));if(seen.has(id))throw Error('Duplicate registry member.');seen.add(id);
      const envelope=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(new Uint8Array(entry[1])));
      if(envelope.v!==1||envelope.generation!==generation||envelope.recipient!==id||unbase64(envelope.enc).length!==65||unbase64(envelope.ct).length>2048) throw Error('Invalid recipient envelope.');
      return envelope;
    });
  });
  return {address,version:row.version,scope:s[1],board:s[2],thread:s[3],admin,generation:s[5],revision:s[6],generations};
}
export function envelopeEntries(envelopes) {
  return envelopes.map(e=>[Array.from(unbase64(e.recipient)),Array.from(new TextEncoder().encode(JSON.stringify(e)))]);
}
