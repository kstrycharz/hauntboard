import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Relay} from '../lib/relay.mjs';
const finalized={result:{Finalized:{final_decision:'Commit',execution_result:{finalize:{result:{Accept:{}}}}}}};
test('lost acknowledgement retains native identity, reconciles after restart and never resends',async()=>{
 const root=await mkdtemp(join(tmpdir(),'relay-reconciliation-'));
 try{
  const id='a'.repeat(64),tx='b'.repeat(64),r=new Relay(root);
  await assert.rejects(r.submit('esmeralda:one',id,'same signed bytes',()=>{throw new Error('lost response');},{transactionId:tx}));
  const restart=new Relay(root);assert.equal((await restart.status('esmeralda:one',id)).tx,tx);
  assert.equal((await restart.submit('esmeralda:one',id,'same signed bytes',()=>assert.fail('resent'))).transaction_id,tx);
  await assert.rejects(restart.reconcile('esmeralda:one',id,()=>{throw new Error('unavailable');}));
  assert.equal((await restart.status('esmeralda:one',id)).status,'submitting');
  await restart.reconcile('esmeralda:one',id,()=>({result:'Pending'}));
  assert.equal((await restart.reconcile('esmeralda:one',id,()=>finalized)).status,'accepted');
  await assert.rejects(restart.submit('esmeralda:one',id,'different bytes',()=>{}),/different signed bytes/);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('mismatched acknowledgement preserves original identity and retention keeps uncertain operations',async()=>{
 const root=await mkdtemp(join(tmpdir(),'relay-retention-'));
 try{
  const r=new Relay(root),id='a'.repeat(64),tx='b'.repeat(64),unknown='c'.repeat(64);
  await assert.rejects(r.submit('localnet:one',id,'signed',async()=>({transaction_id:'d'.repeat(64)}),{transactionId:tx}),/different transaction/);
  await assert.rejects(r.submit('localnet:one',unknown,'unknown',()=>{throw new Error('lost');}));
  await r.reconcile('localnet:one',id,()=>finalized);
  const path=r.path('localnet:one',id),record=JSON.parse(await readFile(path));record.finalizedAt='2020-01-01T00:00:00Z';await writeFile(path,JSON.stringify(record));
  const report=await r.maintain('localnet:one',()=>assert.fail('terminal should not be queried'));
  assert.equal(report.pruned,1);assert.equal((await r.status('localnet:one',unknown)).status,'submitting');
  assert.equal((await r.status('localnet:other',unknown)).status,'not_submitted');
 }finally{await rm(root,{recursive:true,force:true});}
});
