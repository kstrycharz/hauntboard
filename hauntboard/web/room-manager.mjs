import {roomScope,recipientIdentity,recipientRequest,validateRequest,newRecoverySecret,wrapRoomKeys,unwrapRoomKeys,nextGeneration,rotationEnvelopes} from './room-keys.mjs';
import {roomVaultActive,roomVaultExists,createRoomVault,unlockRoomVault,lockRoomVault,roomRecord,setRoomRecord,exportRoomVault} from './room-vault.mjs';
import {accessRequestCode,parseAccessRequest,memberLabel} from './room-access-request.mjs';
import * as wallet from './browser-wallet.mjs';
import {sealedMetadata} from './sealed-posts.mjs';

// Private invitation delivery authenticates the registry binding for an existing,
// ownerless thread. The registry authorizes distribution; the board stays public.
export function createRoomManager(hooks) {
  const $=id=>document.getElementById(id);
  let thread,profile,root,view='home',pendingBinding,setupSecret,setupDownloaded=false,setupAcknowledged=false,output;
  let draftRequest='',draftName='',renderVersion=0;
  const get=()=>roomRecord(profile,thread.address);
  const put=value=>setRoomRecord(profile,thread.address,value);
  const message=text=>{$('room-status').textContent=text;};
  const el=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
  const paragraph=text=>{const e=el('p',text);root.append(e);return e;};
  function heading(title,copy){root.append(el('h3',title));if(copy)paragraph(copy);}
  function action(text,fn,primary=false){
    const b=el('button',text);b.type='button';b.className=(primary?'primary':'subtle')+' full';
    b.addEventListener('click',async()=>{b.disabled=true;message('');try{await fn();}catch(e){message(e.message);}finally{if(b.isConnected)b.disabled=false;}});root.append(b);return b;
  }
  function field(label,type='text',value=''){
    const l=el('label',label),e=el(type==='textarea'?'textarea':'input');e.id='room-field-'+root.children.length;l.htmlFor=e.id;
    if(type!=='textarea')e.type=type;else e.rows=4;e.autocomplete='off';e.value=value;root.append(l,e);return e;
  }
  function details(title,text){const d=el('details'),s=el('summary',title);d.append(s,el('p',text));root.append(d);return d;}
  function download(name,value){const u=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=el('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
  async function copy(text,label){
    try{await navigator.clipboard.writeText(text);message(label+' copied.');return true;}
    catch{message('Select and copy the '+label.toLowerCase()+' below.');return false;}
  }
  function shareOutput(label,text){
    let area,disclosure;
    const copyButton=action('Copy '+label.toLowerCase(),async()=>{if(!await copy(text,label)){disclosure.open=true;area.focus();area.select();}},true);
    disclosure=el('details');disclosure.append(el('summary','Show '+label.toLowerCase()));root.append(disclosure);
    const originalRoot=root;root=disclosure;area=field(label,'textarea',text);root=originalRoot;
    area.readOnly=true;area.className='room-share-code';output=area;area.id='room-output';area.previousElementSibling.htmlFor=area.id;copyButton.focus();
  }
  const go=async next=>{view=next;message('');await render();};
  const back=()=>action('Back to room access',()=>go('home'));
  function footer(){
    action('Back up or restore access',()=>go('backup'));
    action('Lock room access',()=>{setupSecret=null;lockRoomVault();});
  }
  async function record(){
    let r=get();if(!r){const scope=roomScope(profile,thread.board,thread.address);r={scope,identity:await recipientIdentity(scope),keys:[],members:[]};await put(r);}
    if(r.scope!==roomScope(profile,thread.board,thread.address))throw Error('This saved access belongs to another room. Restore the correct backup.');return r;
  }
  async function registry(r){
    const s=await hooks.api(`/api/key-registry?address=${r.registry}`);
    if(s.scope!==r.scope||s.board!==thread.board||s.thread!==thread.address||s.admin!==r.adminPublic)throw Error('This invitation does not match your saved room. Ask the sender for the original link.');
    if((r.revision??0)>s.revision)throw Error('Room access is still syncing. Try again shortly.');return s;
  }
  async function sync(){
    const r=get();if(!r?.registry)return r;
    const s=await registry(r),envelope=s.generations[s.generation].find(e=>e.recipient===r.identity.id);
    if(envelope)r.keys=await unwrapRoomKeys(envelope,r.identity,r.scope,s.generation);
    const changed=r.revision!==s.revision||r.generation!==s.generation||r.currentMember!==Boolean(envelope);
    r.revision=s.revision;r.generation=s.generation;r.currentMember=Boolean(envelope);
    if(changed)await put(r);return r;
  }
  async function reviewStaged(r){
    if(!wallet.active()){message('Unlock your posting wallet, then return here to review the fee. Reading and requesting access are free.');await hooks.unlockWallet?.();return;}
    const pending=r.pending;
    if(!pending)throw Error('Start the access change again.');
    const state=pending.action==='new'?null:await registry(r);
    if(state&&state.revision!==pending.revision)throw Error('Room access changed. Discard this unsubmitted change and review it again.');
    await hooks.review({kind:'registry',action:pending.action,board:thread.board,thread:thread.address,scope:r.scope,admin:r.adminPublic,registry:pending.action==='new'?undefined:r.registry,revision:pending.revision,envelopes:pending.envelopes},{roomAction:{thread:thread.address,token:pending.token},admin:r.admin,content:{title:thread.title,body:pending.description}});
  }
  async function stage(actionName,r,keys,members,envelopes,state,description){
    if(hooks.pending())throw Error('Check your pending transaction before making another change.');
    if(r.pending)throw Error('Finish or discard your unfinished access change first.');
    if(!wallet.active()){message('Unlock your posting wallet, then return here to review the fee. Reading and requesting access are free.');await hooks.unlockWallet?.();return;}
    r.pending={token:newRecoverySecret(),action:actionName,keys,members,envelopes,generation:keys.at(-1).generation,revision:state?.revision??0,description};await put(r);await reviewStaged(r);
  }
  async function resumeInvitation(){
    if(!pendingBinding||pendingBinding.thread!==thread?.address)return;
    await thisManager.accept(thread,profile,pendingBinding.registry,pendingBinding.admin);pendingBinding=null;view='home';
    await hooks.refresh();message('You can now read this room. Download a fresh access backup.');
  }
  async function afterUnlock(){
    view='home';let notice;
    try{await resumeInvitation();}catch(e){view='request';notice=e.message;}
    await render();await hooks.refresh();if(notice)message(notice);
  }
  function renderLocked(){
    const saved=roomVaultExists(profile);
    if(view==='restore'){
      heading('Restore access on this device','Choose your encrypted access backup and enter the recovery code you saved separately. Your Tari wallet phrase does not restore room access.');
      const file=field('Access backup file','file');file.accept='.json,application/json';const secret=field('Recovery code','password');
      action('Restore room access',async()=>{if(!file.files[0])throw Error('Choose your encrypted access backup file.');if(file.files[0].size>2800000)throw Error('Choose a Hauntboard access backup smaller than 2.8 MB.');await unlockRoomVault(profile,secret.value.trim(),JSON.parse(await file.files[0].text()));secret.value='';await afterUnlock();},true);
      action(saved?'Use access saved on this device':'Back',()=>go('home'));return;
    }
    if(saved){
      heading('Unlock room access','Enter your recovery code to use the access saved in this browser. Reading messages does not require a funded wallet.');
      const secret=field('Recovery code','password');
      action('Unlock room access',async()=>{await unlockRoomVault(profile,secret.value.trim());secret.value='';await afterUnlock();},true);
      action('Restore from a backup file',()=>go('restore'));
    }else{
      heading('Set up private room access','Save your access once on this device. You can then request an invitation, read invited rooms, and manage invitations you create.');
      action('Set up room access',async()=>{setupSecret=await createRoomVault(profile);setupDownloaded=false;setupAcknowledged=false;if(thread)await record();await render();},true);
      action('I already have an access backup',()=>go('restore'));
      paragraph('No wallet or test tokens are needed to set up access or read an invitation. Publishing invitations and access changes requires a funded wallet.');
    }
  }
  function renderSetup(){
    heading('Save your recovery kit','Keep both items below. You need the encrypted backup file and your recovery code to open these rooms on another device.');
    root.append(el('h4','1. Save your recovery code'));
    const code=field('Recovery code','textarea',setupSecret);code.id='room-recovery-code';code.previousElementSibling.htmlFor=code.id;code.readOnly=true;code.rows=2;code.spellcheck=false;output=code;
    action('Copy recovery code',()=>copy(setupSecret,'Recovery code'));
    paragraph('Save this code in a password manager or another private place. Keep it separate from the backup file. It is different from your Tari wallet phrase.');
    root.append(el('h4','2. Download your encrypted backup'));
    const downloadButton=action(setupDownloaded?'Download backup again':'Download access backup',()=>{download('hauntboard-room-vault.json',exportRoomVault(profile));setupDownloaded=true;downloadButton.textContent='Download backup again';continueButton.disabled=!(setupDownloaded&&setupAcknowledged);},true);
    const label=el('label'),ack=el('input');ack.type='checkbox';ack.checked=setupAcknowledged;label.className='room-check';label.append(ack,document.createTextNode(' I saved my recovery code separately from the backup file.'));root.append(label);
    const continueButton=action('Continue to room access',async()=>{if(!setupDownloaded||!setupAcknowledged)return;setupSecret=null;await afterUnlock();});continueButton.disabled=!(setupDownloaded&&setupAcknowledged);
    ack.addEventListener('change',()=>{setupAcknowledged=ack.checked;continueButton.disabled=!(setupDownloaded&&setupAcknowledged);});
  }
  async function render(){
    const ticket=++renderVersion;root.replaceChildren();output=null;
    if(!roomVaultActive()){renderLocked();return;}
    if(setupSecret){renderSetup();return;}
    let r=thread?await record():null;
    if(r?.registry)r=await sync();
    const canSetUp=Boolean(r&&!r.registry&&profile.keyRegistryTemplate&&await hooks.legacyKey(thread.address));
    if(ticket!==renderVersion||!roomVaultActive())return;
    if(view==='backup'||!thread){
      heading('Back up your room access','Download a fresh encrypted backup after joining rooms, inviting people or changing access. Restore it with your separate recovery code. Your wallet phrase does not restore room access.');
      action('Download access backup',()=>{download('hauntboard-room-vault.json',exportRoomVault(profile));message('Backup downloaded. Keep your recovery code separately.');},true);
      action('Restore from a backup file',()=>{lockRoomVault();return go('restore');});
      if(thread)back();action('Lock room access',()=>lockRoomVault());return;
    }
    if(r.pending){
      heading('Finish your access change',r.pending.description??'You have an unfinished access change for this room.');
      if(hooks.pending()){
        paragraph('A transaction may already have been sent. Check its status before starting another change.');action('Check transaction status',async()=>{await hooks.checkOperation?.();await render();},true);
      }else{
        action('Review this change',()=>reviewStaged(r),true);
        action('Discard this unsubmitted change',async()=>{hooks.cancelReview?.();delete r.pending;await put(r);await go('home');});
      }
      footer();return;
    }
    if(view==='request'){
      heading('Ask for an invitation','Send your access request to the person managing this room. They will approve it and send you a room link. No payment is needed to request or read access.');
      const name=field('Name to show your contact','text',draftName||r.displayName||'');name.maxLength=40;name.placeholder='For example, Sam';name.addEventListener('input',()=>draftName=name.value);
      const createRequestButton=action('Create access request',async()=>{
        const label=name.value.trim();if(!label)throw Error('Enter a name or nickname so your contact can recognize you.');
        r.displayName=label;await put(r);const request={...await recipientRequest(r.identity),name:label};
        const old=root.querySelector('.room-request-result');old?.remove();const result=el('section');result.className='room-request-result';createRequestButton.after(result);
        const originalRoot=root;root=result;shareOutput('Access request',accessRequestCode(request));paragraph('1. Copy this request and send it privately to your contact. 2. Open the invitation link they send back in this browser, or restore this access backup first on another device.');details('Check the request with your contact','Request fingerprint: '+request.id);root=originalRoot;
        message('Your request is ready. Download a fresh backup before using another device.');
      },true);
      back();footer();return;
    }
    if(view==='enable'){
      heading('Set up invitations for this room','Create an access list so you can invite specific people and remove them from future messages.');
      paragraph('Existing invitation links will still open earlier messages. New messages use a fresh key. Share your new room link privately so recipients know which access list to trust.');
      paragraph('The next screen shows the Ootle network fee before you publish.');
      action('Review invitation setup',async()=>{
        const legacy=await hooks.legacyKey(thread.address);if(!legacy)throw Error('Open this room with its original invitation link before setting up invitations.');
        if(!r.admin){r.admin=wallet.newRoomAdmin();r.adminPublic=r.admin.publicKey;await put(r);}
        const keys=[{generation:-1,key:legacy},{generation:0,key:newRecoverySecret()}],members=[{...await recipientRequest(r.identity),name:'You'}];
        await stage('new',r,keys,members,await rotationEnvelopes(members,r.scope,keys),null,'Set up invitations for this room. You will manage access to future messages. Existing links retain access to earlier messages.');
      },true);back();return;
    }
    if(view==='invite'&&r.registry&&r.admin){
      heading('Invite someone','Ask your contact to open this room, choose Room access → Get an invitation, and send you their access request.');
      const request=field('Access request from your contact','textarea',draftRequest);request.placeholder='Paste the access request here';request.addEventListener('input',()=>draftRequest=request.value);
      action('Check access request',async()=>{
        const parsed=parseAccessRequest(request.value);let req;try{req=await validateRequest(parsed,r.scope);}catch{throw Error('This request does not match this room. Ask your contact to create a new access request from this room.');}draftRequest=request.value;
        view='invite-confirm';await renderInviteConfirmation(r,req);
      },true);back();return;
    }
    if(view==='members'&&r.registry&&r.admin){
      heading('Manage members','Select anyone who should stop receiving future messages. They will keep messages and keys they already have.');
      const choices=[];
      const reviewedRevision=r.revision;
      for(const [index,member]of r.members.entries()){
        const row=el('section');row.className='room-member';
        if(member.id===r.identity.id)row.append(el('p','You · manages invitations'));
        else{
          const label=el('label'),check=el('input');check.type='checkbox';const name=memberLabel(member,index);label.className='room-check';label.append(check,document.createTextNode('Remove '+name));row.append(label);choices.push({member,check,name});
        }
        const d=el('details');d.append(el('summary','Verify member'),el('p','Request fingerprint: '+member.id));row.append(d);root.append(row);
      }
      const reviewButton=action('Review removal',async()=>{
        const removed=choices.filter(x=>x.check.checked);if(!removed.length)throw Error('Select at least one member to remove.');
        const current=await sync(),state=await registry(current);
        if(state.revision!==reviewedRevision)throw Error('The access list changed. Reopen Manage members before removing anyone.');
        if(state.generations[state.generation].some(e=>!current.members.some(m=>m.id===e.recipient)))throw Error('This device is missing member details. Restore your most recent access backup before changing members.');
        const removedIds=new Set(removed.map(x=>x.member.id));
        const members=current.members.filter(m=>!removedIds.has(m.id)),keys=nextGeneration(current.keys);
        await stage('rotate',current,keys,members,await rotationEnvelopes(members,r.scope,keys),state,'Remove '+removed.map(x=>x.name).join(', ')+' from future messages. Earlier messages remain readable to them. The remaining members receive a fresh room key.');
      },true);reviewButton.disabled=true;for(const choice of choices)choice.check.addEventListener('change',()=>reviewButton.disabled=!choices.some(x=>x.check.checked));
      if(!choices.length)paragraph('Only you have been invited. Invite someone to add them to this list.');back();return;
    }
    // Home shows tasks rather than cryptographic implementation details.
    heading(thread.title,r.registry?(r.admin?'You manage invitations to this room.':r.currentMember?'You have access to this room.':'You can read earlier messages. Ask for a new invitation to read future messages.'):'Choose how you want to use this sealed room.');
    if(pendingBinding?.thread===thread.address)action('Open my invitation',async()=>{await resumeInvitation();await render();},true);
    if(r.registry&&r.admin){action('Invite someone',()=>go('invite'),true);action('Manage members',()=>go('members'));}
    else action(r.registry&&r.currentMember?'Show my access request':'Get an invitation',()=>go('request'),true);
    if(r.registry){
      action('Copy room link',async()=>{const url=new URL('/',location.origin);url.hash=new URLSearchParams({thread:thread.address,board:thread.board,registry:r.registry,admin:r.adminPublic}).toString();shareOutput('Room link',url.href);await copy(url.href,'Room link');message('Room link ready. Only people you have invited can use their own saved access to open it.');});
      action('Refresh room access',async()=>{await sync();await hooks.refresh();await render();message('Room access is up to date.');});
    }else if(canSetUp)action('Set up invitations',()=>go('enable'));
    footer();
    details('What stays public?','Room titles, activity and access changes are visible on Ootle. Members can copy messages and keys. Removing someone protects future messages; it cannot erase their past access.');
    if(r.registry)details('Technical details',`Access registry: ${r.registry}. Key generation: ${r.generation}. Request fingerprint: ${r.identity.id}.`);
  }
  async function renderInviteConfirmation(r,req){
    root.replaceChildren();heading('Invite '+(req.name||'this person')+'?','Check this request with your contact before approving it. The name is chosen by the sender and does not prove their identity.');
    paragraph('Request fingerprint: '+req.id);
    paragraph('This invitation includes the available room history. The next screen shows the network fee before publication.');
    action('Review invitation',async()=>{
      const current=await sync(),state=await registry(current);
      if(state.generations[state.generation].some(e=>e.recipient===req.id))throw Error('This person already has access. Send them the room link.');
      if(state.generations[state.generation].length>=16)throw Error('This room already has 16 members. Remove someone before inviting another person.');
      const envelope=await wrapRoomKeys(req,r.scope,state.generation,current.keys);
      await stage('grant',current,current.keys,[...current.members,req],[envelope],state,'Invite '+(req.name||'this person')+' to this room, including its available message history. Send the room link after confirmation.');
    },true);action('Use a different request',()=>go('invite'));back();
  }
  const thisManager={
    async open(value,p){const changed=thread?.address!==value?.address;thread=value;profile=p;root=$('room-controls');if(changed){draftRequest='';draftName='';}view='home';message('');await render();hooks.openDialog('room-dialog');},
    async accept(value,p,address,adminPublic){
      thread=value;profile=p;
      if(!roomVaultActive()||setupSecret){pendingBinding={thread:value.address,registry:address,admin:adminPublic};await thisManager.open(value,p);message('Unlock or restore the room access you used to request this invitation.');return;}
      const r=await record();if(r.registry&&(r.registry!==address||r.adminPublic!==adminPublic))throw Error('This invitation uses a different access list. Ask your contact for the original room link.');
      const proposed={...r,registry:address,adminPublic},s=await registry(proposed),envelope=s.generations[s.generation].find(e=>e.recipient===r.identity.id);
      if(!envelope)throw Error('This device has not been invited yet. Choose Get an invitation and send your access request, or restore the backup from your invited device.');
      proposed.keys=await unwrapRoomKeys(envelope,r.identity,r.scope,s.generation);proposed.revision=s.revision;proposed.generation=s.generation;proposed.currentMember=true;await put(proposed);
    },
    async key(p,value,post){if(!roomVaultActive())return null;const r=roomRecord(p,value.address);if(!r)return null;const meta=sealedMetadata(post.payload);if(meta.v===3&&r.registry!==meta.registry)throw Error('This message uses a different access list from your invitation.');return r.keys.find(k=>k.generation===(meta.v===3?meta.generation:-1))?.key??null;},
    async writing(p,value){
      if(!roomVaultActive()){const meta=sealedMetadata(value.posts[0].payload);if(meta.v===3)throw Error('Open Room access and unlock it before replying.');return null;}
      profile=p;thread=value;const r=get();if(!r?.registry)return null;const current=await sync();if(!current.currentMember)throw Error('You can read earlier messages only. Open Room access to request a new invitation.');
      return {key:current.keys.find(k=>k.generation===current.generation).key,registry:r.registry,generation:current.generation,revision:current.revision};
    },
    async finish(p,action,tx){
      if(!roomVaultActive())throw Error('Your transaction confirmed. Unlock Room access, then check the transaction again to finish saving it.');
      const r=roomRecord(p,action.thread);if(!r?.pending||r.pending.token!==action.token)throw Error('Restore your latest access backup to finish saving this confirmed change.');
      const staged=r.pending;let s;
      for(const address of r.registry?[r.registry]:(tx.components??[])){try{const candidate=await hooks.api(`/api/key-registry?address=${address}`);if(candidate.scope===r.scope&&candidate.thread===action.thread&&candidate.admin===r.adminPublic){s=candidate;break;}}catch{}}
      if(!s||s.generation!==staged.generation||s.revision!==(staged.action==='new'?0:staged.revision+1))throw Error('The access change confirmed and is still syncing. Check the same transaction again shortly.');
      for(const expected of staged.envelopes)if(!s.generations[s.generation].some(e=>JSON.stringify(e)===JSON.stringify(expected)))throw Error('The saved access change does not match the confirmed record. Keep your backup and check this transaction again.');
      r.registry=s.address;r.keys=staged.keys;r.members=staged.members;r.revision=s.revision;r.generation=s.generation;r.currentMember=true;delete r.pending;await setRoomRecord(p,action.thread,r);view='home';
    },
    lock(){setupSecret=null;lockRoomVault();},
    clearView(){renderVersion++;if(output)output.value='';output=null;setupSecret=null;if($('room-dialog').open)render().catch(e=>message(e.message));},
    managed(p,value){try{return roomVaultActive()&&Boolean(roomRecord(p,value.address)?.registry);}catch{return false;}},
  };
  return thisManager;
}
