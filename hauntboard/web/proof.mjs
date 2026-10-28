const $=id=>document.getElementById(id);
const perspectives={
  outsider:{title:'Outsider',copy:'Can see the public title, category, reply relationships and ciphertext. Without a room key, the message bodies stay sealed.',past:'Sealed',future:'Sealed'},
  invited:{title:'Invited reader',copy:'Uses their recipient identity to open the encrypted room-key envelope locally. While included in the current generation, they can decrypt available history and new messages.',past:'Readable with delivered history keys',future:'Readable while retained in the new generation'},
  removed:{title:'Removed reader',copy:'Keeps historical keys and anything already copied. After confirmation of rotation, their old key cannot decrypt a message encrypted under the fresh generation key.',past:'Still readable with retained old keys',future:'Sealed under the new generation key'},
};
for(const button of document.querySelectorAll('[data-perspective]'))button.addEventListener('click',()=>{
  const view=perspectives[button.dataset.perspective];
  for(const other of document.querySelectorAll('[data-perspective]'))other.setAttribute('aria-pressed',String(other===button));
  $('reader-title').textContent=view.title;$('reader-copy').textContent=view.copy;$('past-access').textContent=view.past;$('future-access').textContent=view.future;
});
const labels={publishRegistry:'Publish the companion registry template',preparePostingFunds:'Prepare native posting funds',sealedOpeningPost:'Publish a sealed opening message',createKeyRegistry:'Create the room registry',grantBobAccess:'Grant the invited reader access',managedPostBeforeRemoval:'Publish before removal',removeBobAndRotate:'Remove the reader and rotate the key',managedPostAfterRemoval:'Publish under the new generation'};
try {
  const response=await fetch('/proof-evidence.json',{redirect:'error'});if(!response.ok)throw Error('Evidence unavailable');
  const record=await response.json();
  if(record.network!=='esmeralda'||!/^component_[a-f0-9]{64}$/.test(record.registry)||Object.keys(labels).some(key=>!/^([a-f0-9]{64})$/.test(record.stages?.[key]?.id??'')))throw Error('Invalid evidence record');
  $('record-status').textContent=`Recorded ${new Date(record.checkedAt).toISOString().slice(0,10)} UTC: eight transactions reported confirmed. These links open the public explorer; this page has not rechecked their finality.`;
  for(const [key,label] of Object.entries(labels)){
    const li=document.createElement('li'),title=document.createElement('strong'),a=document.createElement('a');
    title.textContent=label;a.href=`https://explorer.tari.mw/tx/${record.stages[key].id}`;a.textContent=`Inspect transaction ${record.stages[key].id.slice(0,12)}…`;li.append(title,document.createElement('br'),a);$('recorded-stages').append(li);
  }
  $('check-registry').disabled=false;
  $('check-registry').addEventListener('click',async()=>{
    $('check-registry').disabled=true;$('registry-status').textContent='Checking this client’s configured provider…';
    try{
      const result=await fetch(`/api/key-registry?address=${encodeURIComponent(record.registry)}`,{redirect:'error',signal:AbortSignal.timeout(15000)});
      if(!result.ok)throw Error('Registry unavailable');const state=await result.json();
      if(state.address!==record.registry||state.board!==record.board||state.thread!==record.thread||!Number.isInteger(state.generation)||!Number.isInteger(state.revision))throw Error('Registry mismatch');
      $('registry-status').textContent=`Provider returned the matching registry at generation ${state.generation}, revision ${state.revision}. Checked ${new Date().toISOString()}. This availability check does not revalidate all eight transactions or independently verify consensus.`;
    }catch{$('registry-status').textContent='The recorded registry could not be checked through this client right now. The provider may be unavailable, history may have expired, or this client may use a different testnet reset. This does not establish current finality.';}
    finally{$('check-registry').disabled=false;}
  });
}catch{$('record-status').textContent='The dated evidence record could not be loaded. Use the source evidence link below. No live chain status is established.';}
