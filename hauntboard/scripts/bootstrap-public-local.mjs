// Separate localnet board and journal; preserves the prior contracts, wallets and clients.
import {readFile,mkdir,chown,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {rpc,atomicJson,waitTransaction,requireAccepted,quoteCall,submitCall,createdComponents,getSubstate} from '../lib/chain.mjs';
const c=JSON.parse(await readFile('/sender-companion/config.json','utf8'));assert.equal(c.network,'localnet');
const binary=await readFile('hauntboard/template-public/hauntboard_public.wasm'),hash=createHash('sha256').update(binary).digest('hex'),path='/private/hauntboard-public-v4.json';
let j;try{j=JSON.parse(await readFile(path,'utf8'));assert.equal(j.instance,c.instance);assert.equal(j.hash,hash);}catch(e){if(e.code!=='ENOENT')throw e;j={instance:c.instance,hash,stages:{}};}
async function stage(name,send){let s=j.stages[name];if(!s){s=j.stages[name]={status:'submitting'};await atomicJson(path,j);s.id=(await send()).transaction_id;await atomicJson(path,j);}if(!s.id)throw new Error('Uncertain local publication: reconcile before retrying.');const result=requireAccepted(await waitTransaction(c,s.id));s.status='confirmed';await atomicJson(path,j);return result;}
if(!j.template){const request={binary:binary.toString('base64'),fee_account:{ComponentAddress:c.account},max_fee:'5000000',detect_inputs:true,dry_run:true},estimated=await rpc(c,'transactions.publish_template',request),fee=(BigInt(estimated.dry_run_fee)+10000n).toString();assert(BigInt(fee)<=5000000n);const result=await stage('publish',()=>rpc(c,'transactions.publish_template',{...request,max_fee:fee,dry_run:false}));j.template=result.result.result.Accept.up_substates.find(([id])=>id.startsWith('template_'))[0].slice(9);await atomicJson(path,j);}
if(!j.board){const q=await quoteCall(c,'let board=Board::new("The Public Crypt");',{},`use template_${j.template} as Board;`);const result=await stage('board',()=>submitCall(c,q));j.board=createdComponents(result).find(id=>id!==c.account);await atomicJson(path,j);}
const row=await getSubstate('http://indexer:18300',j.board,j.template);assert.equal(row.substate.Component.body.state[0],4);
await mkdir('/privacy-companion',{recursive:true});await atomicJson('/privacy-companion/config.json',{...c,board:j.board,template:j.template,posterPrivacy:'stealth-fee-v1',schema:4,legacyBoards:[c.board,...(c.legacyBoards??[])],legacyTemplates:[c.template,...(c.legacyTemplates??[])]});
// The shipping application runs as UID 1000. Preserve records while migrating
// the isolated preview volume previously created by root-run development tools.
async function appOwnership(path){await chown(path,1000,1000);for(const entry of await readdir(path,{withFileTypes:true})){const child=`${path}/${entry.name}`;if(entry.isDirectory())await appOwnership(child);else if(entry.isFile())await chown(child,1000,1000);}}
await appOwnership('/privacy-companion');
const report={status:'LOCAL_PUBLIC_CONTRACT_READY',network:'localnet',schema:4,board:j.board,template:j.template,wasmSha256:hash,bytes:binary.length,transactionIds:Object.values(j.stages).map(s=>s.id),publicDeployment:false};await atomicJson('hauntboard/evidence/public-contract-local.json',report);console.log(JSON.stringify(report));
