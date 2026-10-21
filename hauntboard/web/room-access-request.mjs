import {base64,unbase64} from './crypto.mjs';
const prefix='hauntboard-access-v1.';
export function accessRequestCode(request){return prefix+base64(new TextEncoder().encode(JSON.stringify(request)));}
export function parseAccessRequest(text){
  if(typeof text!=='string'||text.length>4096)throw Error('Paste the complete access request your contact sent you.');
  const value=text.trim();let request;
  try{request=JSON.parse(value.startsWith(prefix)?new TextDecoder('utf-8',{fatal:true}).decode(unbase64(value.slice(prefix.length).replace(/\s/g,''))):value);}catch{throw Error('This access request is incomplete. Ask your contact to copy it again.');}
  if(!request||typeof request!=='object'||Array.isArray(request))throw Error('Paste an access request, rather than a room invitation or recovery code.');
  if(request.name!==undefined&&(typeof request.name!=='string'||!request.name.trim()||request.name.length>40))throw Error('The name in this request is invalid. Ask your contact to create a new request.');
  return request;
}
export function memberLabel(member,index){return typeof member.name==='string'&&member.name.trim()?member.name.trim():`Member ${index+1}`;}
