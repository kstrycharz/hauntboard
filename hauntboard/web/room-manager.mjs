import {roomScope,recipientIdentity,recipientRequest,validateRequest,digest,newRecoverySecret,wrapRoomKeys,unwrapRoomKeys,nextGeneration,rotationEnvelopes} from './room-keys.mjs';
import {roomVaultActive,createRoomVault,unlockRoomVault,lockRoomVault,roomRecord,setRoomRecord,exportRoomVault} from './room-vault.mjs';
import * as wallet from './browser-wallet.mjs';
import {sealedMetadata} from './sealed-posts.mjs';

// The registry binding arrives through a trusted invitation. Existing ownerless
// threads cannot retrospectively attest who created them.
export function createRoomManager(hooks) {
  const $=id=>document.getElementById(id);
  let thread, profile, root, output, pendingBinding;
  const get=()=>roomRecord(profile,thread.address);
  const put=value=>setRoomRecord(profile,thread.address,value);
  const message=text=>{$('room-status').textContent=text;};
  const guard=fn=>async()=>{try{await fn();}catch(e){message(e.message);}};
  function element(tag,text){const e=document.createElement(tag);if(text)e.textContent=text;return e;}
  function action(text,fn){const b=element('button',text);b.type='button';b.className='subtle full';b.addEventListener('click',guard(fn));root.append(b);return b;}
  function input(label,type='text'){const l=element('label',label),e=element(type==='textarea'?'textarea':'input');e.id='room-field-'+root.children.length;l.htmlFor=e.id;if(type!=='textarea')e.type=type;e.autocomplete='off';if(type==='textarea')e.rows=4;root.append(l,e);return e;}
  function show(value){output.value=typeof value==='string'?value:JSON.stringify(value,null,2);output.hidden=false;output.focus();output.select();}
  function download(name,value){const u=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=element('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
  async function record() {
    let r=get();
    if(!r){const scope=roomScope(profile,thread.board,thread.address),identity=await recipientIdentity(scope);r={scope,identity,keys:[],members:[]};await put(r);}
    if(r.scope!==roomScope(profile,thread.board,thread.address))throw Error('Room vault context mismatch.');
    return r;
  }
  async function registry(r) {
    const s=await hooks.api(`/api/key-registry?address=${r.registry}`);
    if(s.scope!==r.scope||s.board!==thread.board||s.thread!==thread.address||s.admin!==r.adminPublic)throw Error('Registry binding does not match this invitation.');
    if((r.revision??0)>s.revision)throw Error('Provider returned an older registry revision. Retry with an up-to-date provider.');
    return s;
  }
  async function sync() {
    const r=get();if(!r?.registry)return r;
    const s=await registry(r),envelope=s.generations[s.generation].find(e=>e.recipient===r.identity.id);
    if(envelope)r.keys=await unwrapRoomKeys(envelope,r.identity,r.scope,s.generation);
    r.revision=s.revision;r.generation=s.generation;r.currentMember=Boolean(envelope);await put(r);return r;
  }
  async function stage(action,r,keys,members,envelopes,state) {
    if(!wallet.active())throw Error('Unlock your posting wallet before reviewing a registry fee.');
    if(r.pending)throw Error('A room change is already staged. Reconcile or discard its unsubmitted review first.');
    const token=newRecoverySecret();
    r.pending={token,action,keys,members,envelopes,generation:keys.at(-1).generation,revision:state?.revision??0};await put(r);
    await hooks.review({kind:'registry',action,board:thread.board,thread:thread.address,scope:r.scope,admin:r.adminPublic,registry:action==='new'?undefined:r.registry,revision:state?.revision??0,envelopes},{roomAction:{thread:thread.address,token},admin:r.admin,content:{title:thread.title,body:action==='rotate'?'Rotate to a fresh key for the selected remaining members. Previously shared messages stay readable.':action==='grant'?'Deliver encrypted room keys to the verified recipient. This invitation includes available message history.':'Enable managed access with a fresh room key. Existing bearer invitations retain access to old messages.'}});
  }
  async function render() {
    root.replaceChildren();output=element('textarea');output.id='room-output';output.readOnly=true;output.hidden=true;output.rows=6;output.setAttribute('aria-label','Room invitation or recovery output');
    if(!roomVaultActive()) {
      root.append(element('p','Use a separate room recovery secret to unlock recipient and administration keys. Your wallet phrase does not restore this vault. Keep both the encrypted vault file and its recovery secret.'));
      const secret=input('Room recovery secret','password'), file=input('Optional encrypted vault file','file');file.accept='.json,application/json';
      action('Unlock or restore room vault',async()=>{let backup;if(file.files[0]){if(file.files[0].size>2800000)throw Error('Vault file is too large.');backup=JSON.parse(await file.files[0].text());}await unlockRoomVault(profile,secret.value.trim(),backup);secret.value='';await render();});
      action('Create room vault',async()=>{const recovery=await createRoomVault(profile);await render();show(recovery);message('Save this recovery secret privately, then download the encrypted vault. The secret will not be displayed again.');});
      root.append(output);return;
    }
    action('Download encrypted room vault',()=>download('hauntboard-room-vault.json',exportRoomVault(profile)));
    action('Lock room vault',async()=>{lockRoomVault();});
    if(!thread){root.append(output);return;}
    const r=await record();
    if(pendingBinding?.thread===thread.address)action('Open recipient invitation',async()=>{
      await thisManager.accept(thread,profile,pendingBinding.registry,pendingBinding.admin);pendingBinding=null;await hooks.refresh();await render();message('Recipient invitation opened. Download a fresh encrypted vault backup.');
    });
    root.append(element('p','Public titles, room activity, recipient pseudonyms and registry administration are observable. Verify recipient fingerprints over a private channel. Every member can copy decrypted messages or keys.'));
    action('Create my recipient request',async()=>{show(await recipientRequest(r.identity));message(`Recipient fingerprint: ${r.identity.id}. Send the request privately to the room administrator.`);});
    if(r.registry) {
      const latest=await sync();
      root.append(element('p',`Registry ${r.registry}. Key generation ${latest.generation}. ${latest.currentMember?'You have current access.':'You have historical access only.'}`));
      action('Copy my managed invitation',async()=>{
        const url=new URL('/',location.origin);url.hash=new URLSearchParams({thread:thread.address,board:thread.board,registry:r.registry,admin:r.adminPublic}).toString();
        show(url.href);message('This link contains no room key. The recipient needs their own unlocked room vault and an authorized envelope. Share the registry binding through a trusted channel.');
      });
      action('Refresh my room access',async()=>{await sync();await hooks.refresh();await render();});
    }
    if(!profile.keyRegistryTemplate)root.append(element('p','Registry publication is pending on this network. Recipient requests and encrypted vault backups are available now.'));
    if(profile.keyRegistryTemplate&&!r.registry)action('Enable managed access for future messages',async()=>{
      const legacy=await hooks.legacyKey(thread.address);if(!legacy)throw Error('Open a valid existing invitation before enabling managed access.');
      if(!r.admin){r.admin=wallet.newRoomAdmin();r.adminPublic=r.admin.publicKey;await put(r);}
      const keys=[{generation:-1,key:legacy},{generation:0,key:newRecoverySecret()}],members=[await recipientRequest(r.identity)];
      await stage('new',r,keys,members,await rotationEnvelopes(members,r.scope,keys));
    });
    if(r.registry&&r.admin) {
      const request=input('Recipient request JSON','textarea');
      action('Review invitation for this recipient',async()=>{
        const current=await sync(),state=await registry(current),req=await validateRequest(JSON.parse(request.value),r.scope);
        if(state.generations[state.generation].some(e=>e.recipient===req.id))throw Error('This recipient already has access.');
        if(state.generations[state.generation].length>=16)throw Error('Room member capacity reached.');
        const envelope=await wrapRoomKeys(req,r.scope,state.generation,current.keys);
        await stage('grant',current,current.keys,[...current.members,req],[envelope],state);
      });
      root.append(element('p','Select the members who should KEEP access to future messages. Your own recipient key is always retained.'));
      const choices=[];
      for(const member of r.members){const l=element('label'),c=element('input');c.type='checkbox';c.checked=true;c.disabled=member.id===r.identity.id;l.append(c,document.createTextNode(' '+member.id));root.append(l);choices.push({member,c});}
      action('Review removal and key rotation',async()=>{
        const current=await sync(),state=await registry(current),members=choices.filter(x=>x.c.checked).map(x=>x.member);
        if(!members.some(m=>m.id===current.identity.id))throw Error('Keep your own recovery recipient.');
        const keys=nextGeneration(current.keys);await stage('rotate',current,keys,members,await rotationEnvelopes(members,r.scope,keys),state);
      });
    }
    if(r.pending)action('Discard unsubmitted room review',async()=>{
      if(hooks.pending())throw Error('A transaction is pending. Reconcile its original transaction first.');
      hooks.cancelReview?.();
      delete r.pending;await put(r);await render();
    });
    root.append(output);
  }
  const thisManager={
    async open(value,p){thread=value;profile=p;root=$('room-controls');message('');await render();hooks.openDialog('room-dialog');},
    async accept(value,p,registryAddress,adminPublic){
      thread=value;profile=p;
      if(!roomVaultActive()){
        pendingBinding={thread:value.address,registry:registryAddress,admin:adminPublic};await thisManager.open(value,p);message('Unlock or restore the room vault that created your recipient request, then choose Open recipient invitation.');return;
      }
      const r=await record();
      if(r.registry&&(r.registry!==registryAddress||r.adminPublic!==adminPublic))throw Error('A different registry is already pinned for this room.');
      const proposed={...r,registry:registryAddress,adminPublic};
      const s=await registry(proposed),envelope=s.generations[s.generation].find(e=>e.recipient===r.identity.id);
      if(!envelope)throw Error('Your recipient key has no current invitation. Send your recipient request to the administrator.');
      proposed.keys=await unwrapRoomKeys(envelope,r.identity,r.scope,s.generation);proposed.revision=s.revision;proposed.generation=s.generation;proposed.currentMember=true;await put(proposed);
    },
    async key(p,value,post){
      if(!roomVaultActive())return null;
      const r=roomRecord(p,value.address);if(!r)return null;
      const meta=sealedMetadata(post.payload);
      if(meta.v===3&&r.registry!==meta.registry)throw Error('Message registry differs from your pinned invitation.');
      return r.keys.find(k=>k.generation===(meta.v===3?meta.generation:-1))?.key??null;
    },
    async writing(p,value){
      if(!roomVaultActive()) {
        const meta=sealedMetadata(value.posts[0].payload);if(meta.v===3)throw Error('Unlock your room vault before replying.');
        return null;
      }
      profile=p;thread=value;const r=get();if(!r?.registry)return null;
      const current=await sync();if(!current.currentMember)throw Error('Your access covers past messages only. Ask for a new invitation.');
      return {key:current.keys.find(k=>k.generation===current.generation).key,registry:r.registry,generation:current.generation,revision:current.revision};
    },
    async finish(p,action,tx){
      if(!roomVaultActive())throw Error('Transaction confirmed. Unlock your room vault, then reconcile it to finish saving room access.');
      const r=roomRecord(p,action.thread);if(!r?.pending||r.pending.token!==action.token)throw Error('Room change recovery data is unavailable. Restore the latest encrypted room vault.');
      const staged=r.pending;
      let s;
      for(const address of r.registry?[r.registry]:(tx.components??[])) {
        try{const candidate=await hooks.api(`/api/key-registry?address=${address}`);if(candidate.scope===r.scope&&candidate.thread===action.thread&&candidate.admin===r.adminPublic){s=candidate;break;}}catch{}
      }
      if(!s||s.generation!==staged.generation||s.revision!==(staged.action==='new'?0:staged.revision+1))throw Error('Transaction confirmed; registry indexing is pending. Reconcile again.');
      const stored=s.generations[s.generation];
      for(const expected of staged.envelopes)if(!stored.some(e=>JSON.stringify(e)===JSON.stringify(expected)))throw Error('Registry envelope differs from the saved change.');
      r.registry=s.address;r.keys=staged.keys;r.members=staged.members;r.revision=s.revision;r.generation=s.generation;r.currentMember=true;delete r.pending;await setRoomRecord(p,action.thread,r);
    },
    lock(){lockRoomVault();},
    clearView(){if($('room-output'))$('room-output').value='';if($('room-dialog').open)render().catch(e=>message(e.message));},
    managed(p,value){try{return roomVaultActive()&&Boolean(roomRecord(p,value.address)?.registry);}catch{return false;}},
  };
  return thisManager;
}
