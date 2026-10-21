import {roomScope,recipientIdentity,recipientRequest,wrapRoomKeys,unwrapRoomKeys,newRecoverySecret,nextGeneration,sealVault,openVault} from './room-keys.mjs';
import {sealPost,openSealedPost} from './sealed-posts.mjs';
const $=id=>document.getElementById(id),p={network:'esmeralda',resetIdentity:'local-interactive-demo'},board=`component_${'a'.repeat(64)}`,thread=`component_${'b'.repeat(64)}`,registry=`component_${'c'.repeat(64)}`,scope=roomScope(p,board,thread),uid=Array(16).fill(1),metadata={title:'The haunted room',category:'general',registry};
let alice,bob,eve,keys,bobKeys,original,latest,envelope,step=0;
function status(text){$('demo-status').textContent=text;}
function ciphertext(payload){$('demo-cipher').value=new TextDecoder().decode(new Uint8Array(payload));}
const context=seed=>[board,uid,Array(16).fill(seed),0];
async function message(generation,key,seed,body){return sealPost({title:'',name:'Ghost',body},key,p,context(seed),{...metadata,generation});}
function action(id,required,fn,next){$(id).addEventListener('click',async()=>{if(step!==required)return;$(id).disabled=true;try{await fn();step++;if(next)$(next).disabled=false;}catch(e){status(e.message);$(id).disabled=false;}});}
action('demo-start',0,async()=>{
  [alice,bob,eve]=await Promise.all([recipientIdentity(scope),recipientIdentity(scope),recipientIdentity(scope)]);keys=[{generation:0,key:newRecoverySecret()}];
  original=await message(0,keys[0].key,2,'The first secret: the ghost is hiding in the library.');ciphertext(original);$('demo-alice').textContent=(await openSealedPost(original,keys[0].key,p,context(2),metadata.title)).body;status('Three recipient key pairs exist. Alice holds the room key. The public ciphertext contains no room key.');
},'demo-invite');
action('demo-invite',1,async()=>{
  envelope=await wrapRoomKeys(await recipientRequest(bob),scope,0,keys);bobKeys=await unwrapRoomKeys(envelope,bob,scope,0);
  $('demo-bob').textContent=(await openSealedPost(original,bobKeys[0].key,p,context(2),metadata.title)).body;
  let rejected=false;try{await unwrapRoomKeys(envelope,eve,scope,0);}catch{rejected=true;}if(!rejected)throw Error('Unexpected outsider access');
  $('demo-eve').textContent='Tried the same encrypted invitation: decryption rejected. The envelope belongs to Bob’s recipient key.';status('Bob can read. Eve cannot open Bob’s envelope. A managed invitation URL carries a registry binding, with no room master key.');
},'demo-recover');
action('demo-recover',2,async()=>{
  const secret=newRecoverySecret(),encrypted=await sealVault({identity:bob},secret,scope);bob=null;
  const restored=await openVault(encrypted,secret,scope);bob=restored.identity;bobKeys=await unwrapRoomKeys(envelope,bob,scope,0);
  $('demo-bob').textContent='Recovered recipient access from an encrypted vault and its separate recovery secret. The earlier message still opens.';status('Recovery works without giving the operator any private keys. Real users must keep the encrypted vault file and recovery secret.');
},'demo-remove');
action('demo-remove',3,async()=>{
  keys=nextGeneration(keys);const aliceEnvelope=await wrapRoomKeys(await recipientRequest(alice),scope,1,keys);await unwrapRoomKeys(aliceEnvelope,alice,scope,1);
  let rejected=false;try{await unwrapRoomKeys(aliceEnvelope,bob,scope,1);}catch{rejected=true;}if(!rejected)throw Error('Unexpected removed-recipient access');status('Generation 1 uses a fresh random room key. Only Alice received its envelope. Bob’s saved generation-0 key still opens old messages.');
},'demo-next');
action('demo-next',4,async()=>{
  latest=await message(1,keys[1].key,3,'The next secret: the ghost has moved to the attic.');ciphertext(latest);
  $('demo-alice').textContent=(await openSealedPost(latest,keys[1].key,p,context(3),metadata.title)).body;
  let rejected=false;try{await openSealedPost(latest,bobKeys[0].key,p,context(3),metadata.title);}catch{rejected=true;}if(!rejected)throw Error('Unexpected old-key access');
  $('demo-bob').textContent='Old message: still readable. New message: authentication/decryption rejected with the old key.';status('Complete: Alice reads the new message, Bob retains the past, and Eve sees only ciphertext. Reload to run again.');
});
try{const r=await fetch('/room-demo-evidence.json');if(!r.ok)throw Error();const e=await r.json();for(const[name,s]of Object.entries(e.stages)){const li=document.createElement('li'),a=document.createElement('a');a.href=`https://ootle-indexer-a.tari.com/transactions/${s.id}/result`;a.textContent=`${name} · ${s.id}`;a.target='_blank';a.rel='noopener noreferrer';li.append(a);$('demo-receipts').append(li);}}catch{$('demo-receipts').textContent='Live transaction evidence is temporarily unavailable.';}
