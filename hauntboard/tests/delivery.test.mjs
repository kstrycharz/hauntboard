import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {serverProfile,TARI_TESTNET_PROVIDERS} from '../lib/server-profile.mjs';
import {networkProfile,networkKey} from '../web/network-profile.mjs';
import {Relay} from '../lib/relay.mjs';
import {validateTestnetWitness} from '../lib/testnet-provider.mjs';
test('live Esmeralda witness rejects localnet, changed runtime, disabled proofs and empty validators',()=>{
 const fixture={network:{status:200,body:{network:'esmeralda',network_byte:38}},info:{status:200,body:{network:'esmeralda',network_byte:38,version:'0.46.0',verify_substate_proofs:true}},validators:{status:200,body:{epoch:11938,validators:[{public_key:'a'.repeat(64),peer_id:'synthetic-validator'}]}},'epoch-manager/stats':{status:200,body:{current_epoch:11938,current_block_height:955048,current_block_hash:'b'.repeat(64)}}};
 assert.equal(validateTestnetWitness(fixture,'0.46.0').validatorCount,1);
 for(const mutate of [f=>f.network.body.network='localnet',f=>f.info.body.network_byte=16,f=>f.info.body.version='0.43.0',f=>f.info.body.verify_substate_proofs=false,f=>f.validators.body.validators=[],f=>f.validators.body.epoch=0,f=>f['epoch-manager/stats'].body.current_block_height=0,f=>f.info.status=503]){const f=structuredClone(fixture);mutate(f);assert.throws(()=>validateTestnetWitness(f,'0.46.0'));}
});
test('public and client profiles require explicitly approved Tari-hosted Esmeralda providers',()=>{
 const env={HAUNTBOARD_PROFILE:'public',ORIGIN:'https://board.example',INDEXER_URL:TARI_TESTNET_PROVIDERS[0],APPROVED_PROVIDER_ORIGINS:TARI_TESTNET_PROVIDERS.join(',')};
 assert.equal(serverProfile(env).origin,env.ORIGIN);
 for(const patch of [{ORIGIN:'http://board.example'},{ORIGIN:'https://board.example/path'},{INDEXER_URL:'https://user:password@provider.example'},{INDEXER_URL:'https://provider.example/path'},{APPROVED_PROVIDER_ORIGINS:''}])assert.throws(()=>serverProfile({...env,...patch}));
 assert.throws(()=>serverProfile({INDEXER_URL:'https://provider.example'}));
 assert.equal(serverProfile({...env,HAUNTBOARD_PROFILE:'client',ORIGIN:'http://localhost:8282'}).profile,'client');
 assert.throws(()=>serverProfile({...env,HAUNTBOARD_PROFILE:'client',ORIGIN:'http://remote.example:8282'}));
 for(const provider of TARI_TESTNET_PROVIDERS){
  assert.equal(serverProfile({...env,INDEXER_URL:provider}).indexer,provider);
  assert.equal(serverProfile({...env,INDEXER_URL:provider,HAUNTBOARD_PROFILE:'client',ORIGIN:'http://localhost:8282'}).indexer,provider);
 }
 for(const provider of ['https://provider.example','http://ootle-indexer-a.tari.com','https://ootle-indexer-a.tari.com.evil.example','https://ootle-indexer-a.tari.com:8443','http://indexer:18300']){
  for(const profile of ['public','client'])assert.throws(()=>serverProfile({...env,HAUNTBOARD_PROFILE:profile,ORIGIN:profile==='client'?'http://localhost:8282':env.ORIGIN,INDEXER_URL:provider,APPROVED_PROVIDER_ORIGINS:provider}),/TARI_TESTNET_PROVIDER_REQUIRED/);
 }
});
test('wallet network/reset identity is explicit and mainnet is rejected',()=>{
 const p=networkProfile({network:'esmeralda',networkByte:38,resetIdentity:'generation-1'});
 assert.equal(networkKey(p),'esmeralda:generation-1');
 for(const patch of [{network:'mainnet'},{networkByte:16},{resetIdentity:''}])assert.throws(()=>networkProfile({...p,...patch}));
});
test('relay survives restart, blocks changed bytes and preserves uncertain claims',async()=>{
 const root=await mkdtemp(join(tmpdir(),'hauntboard-relay-'));
 try{
  const relay=new Relay(root),id='a'.repeat(64),tx='b'.repeat(64);let sends=0;
  await relay.submit('localnet:one',id,'envelope',async()=>{sends++;return {transaction_id:tx};});
  const restarted=new Relay(root);assert.equal((await restarted.submit('localnet:one',id,'envelope',()=>{throw new Error('duplicate');})).transaction_id,tx);
  await assert.rejects(restarted.submit('localnet:one',id,'changed',()=>{}),/different signed bytes/);assert.equal(sends,1);
  await assert.rejects(relay.submit('localnet:one','c'.repeat(64),'unknown',()=>{throw new Error('lost response');}));
  await assert.rejects(restarted.submit('localnet:one','c'.repeat(64),'unknown',()=>{}),/uncertain/);
  assert.equal((await restarted.status('localnet:two',id)).status,'not_submitted');
 }finally{await rm(root,{recursive:true,force:true});}
});
test('concurrent duplicate operation is claimed once and overload is bounded',async()=>{
 const root=await mkdtemp(join(tmpdir(),'hauntboard-concurrent-'));
 try{
  const a=new Relay(root,{concurrency:1}),b=new Relay(root);let release,entered;const started=new Promise(r=>entered=r),hold=new Promise(r=>release=r);
  const pending=a.submit('localnet:one','d'.repeat(64),'same',async()=>{entered();await hold;return {transaction_id:'e'.repeat(64)};});
  await started;
  await assert.rejects(b.submit('localnet:one','d'.repeat(64),'same',()=>{}),/uncertain/);
  await assert.rejects(a.submit('localnet:one','f'.repeat(64),'other',()=>{}),/busy/);
  release();await pending;
  await assert.rejects(new Relay(root,{capacity:1}).submit('localnet:one','f'.repeat(64),'new',()=>{}),/journal is full/);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('mapped local browser port admits only loopback hosts and rejects invalid configuration',()=>{
 const profile=serverProfile({PORT:'8280',LOCAL_BROWSER_PORT:'8283'});
 assert(profile.hosts.has('localhost:8283'));assert(profile.hosts.has('127.0.0.1:8283'));
 assert(!profile.hosts.has('attacker.example:8283'));assert(!profile.hosts.has('localhost:9999'));
 for(const LOCAL_BROWSER_PORT of ['0','65536','8283.5','invalid'])assert.throws(()=>serverProfile({LOCAL_BROWSER_PORT}));
});

test('local LAN opt-in accepts only named private IPv4 hosts on the browser port',()=>{
 const profile=serverProfile({LOCAL_BROWSER_PORT:'8283',LOCAL_LAN_HOSTS:'192.168.1.250,192.168.2.187'});
 assert(profile.hosts.has('192.168.1.250:8283'));assert(profile.hosts.has('192.168.2.187:8283'));
 assert(!profile.hosts.has('192.168.1.251:8283'));assert(!profile.hosts.has('192.168.1.250:9999'));
 for(const LOCAL_LAN_HOSTS of ['0.0.0.0','8.8.8.8','attacker.example','192.168.1.250:8283','192.168.999.1','172.32.0.1'])assert.throws(()=>serverProfile({LOCAL_LAN_HOSTS}));
});
