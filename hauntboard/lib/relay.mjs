import {mkdir,readFile,readdir,open,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {atomicJson} from './chain.mjs';
// One durable single-host relay. Exclusive creation survives restarts; uncertain claims never expire.
export class Relay {
  constructor(root,{concurrency=4,capacity=10000}={}){this.root=root;this.concurrency=concurrency;this.capacity=capacity;this.active=0;}
  path(network,id){if(!/^[a-zA-Z0-9._:-]{1,160}$/.test(network)||!/^[a-f0-9]{64}$/.test(id))throw new Error('INVALID_OPERATION_IDENTITY');return join(this.root,network.replaceAll(':','_'),`${id}.json`);}
  async status(network,id){try{return JSON.parse(await readFile(this.path(network,id),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;return {status:'not_submitted'};}}
  async submit(network,id,envelope,send,{transactionId}={}){
    if(transactionId!==undefined&&!/^[a-f0-9]{64}$/.test(transactionId))throw new Error('INVALID_TRANSACTION_ID');
    const fingerprint=createHash('sha256').update(envelope).digest('hex');
    const previous=await this.status(network,id);
    if(previous.status!=='not_submitted'){
      if(previous.fingerprint!==fingerprint)throw Object.assign(new Error('Operation contains different signed bytes.'),{status:409});
      if(previous.tx)return {transaction_id:previous.tx,reused:true};
      throw Object.assign(new Error('Submission outcome is uncertain. Reconcile before another attempt.'),{status:409});
    }
    if(this.active>=this.concurrency)throw Object.assign(new Error('Relay is busy. Keep the same operation and retry later.'),{status:429});
    this.active++;
    const path=this.path(network,id),dir=join(path,'..');
    try{
      await mkdir(dir,{recursive:true});
      if((await readdir(dir)).length>=this.capacity)throw Object.assign(new Error('Operation journal is full. Operator reconciliation is required.'),{status:503});
      let claim;try{claim=await open(path,'wx',0o600);}catch(e){if(e.code==='EEXIST')throw Object.assign(new Error('Operation already claimed. Reconcile its status.'),{status:409});throw e;}
      const createdAt=new Date().toISOString();
      try{await claim.writeFile(JSON.stringify({fingerprint,status:'submitting',...(transactionId?{tx:transactionId}:{}),createdAt}));await claim.sync();}finally{await claim.close();}
      const sent=await send();
      if(!/^[a-f0-9]{64}$/.test(sent?.transaction_id??''))throw new Error('Provider returned an uncertain submission result.');
      if(transactionId&&sent.transaction_id!==transactionId)throw new Error('Provider acknowledged a different transaction. Reconcile the original identity.');
      await atomicJson(path,{fingerprint,status:'submitted',tx:sent.transaction_id,createdAt});
      return sent;
    }finally{this.active--;}
  }
  async reconcile(network,id,lookup){
    const current=await this.status(network,id);
    if(!current.tx||['accepted','rejected','not_submitted'].includes(current.status))return current;
    const result=await lookup(current.tx),final=result?.result?.Finalized;
    // Failed lookups, missing data and Pending never establish rejection.
    if(!final||!['Commit','Abort'].includes(final.final_decision))return current;
    const accepted=final.final_decision==='Commit'&&Boolean(final.execution_result?.finalize?.result?.Accept);
    const updated={...current,status:accepted?'accepted':'rejected',finalizedAt:new Date().toISOString()};
    await atomicJson(this.path(network,id),updated);return updated;
  }
  async maintain(network,lookup,{limit=100,retentionMs=30*24*60*60*1000,now=Date.now()}={}){
    if(!Number.isInteger(limit)||limit<1||limit>1000||!Number.isFinite(retentionMs)||retentionMs<24*60*60*1000)throw new Error('INVALID_RETENTION_POLICY');
    const dir=join(this.path(network,'0'.repeat(64)),'..');let files;
    try{files=(await readdir(dir)).filter(f=>/^[a-f0-9]{64}\.json$/.test(f)).sort();}catch(e){if(e.code==='ENOENT')return {checked:0,finalized:0,pruned:0,unavailable:0};throw e;}
    const report={checked:0,finalized:0,pruned:0,unavailable:0};
    this.cursor??=new Map();const offset=this.cursor.get(network)??0;
    for(let n=0;n<Math.min(limit,files.length);n++){
      const id=files[(offset+n)%files.length].slice(0,-5);report.checked++;
      try{
        const record=await this.reconcile(network,id,lookup);
        if(['accepted','rejected'].includes(record.status)){
          report.finalized++;
          if(Number.isFinite(Date.parse(record.finalizedAt))&&now-Date.parse(record.finalizedAt)>retentionMs){await unlink(this.path(network,id));report.pruned++;}
        }
      }catch{report.unavailable++;}
    }
    this.cursor.set(network,files.length?(offset+report.checked)%files.length:0);return report;
  }
}
