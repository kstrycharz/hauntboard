// Read-only release evidence. Never creates a wallet, submits a transaction or writes public text.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {getSubstate} from '../lib/chain.mjs';
import {decodeState} from '../lib/state.mjs';
import {readTestnetWitness} from '../lib/testnet-provider.mjs';
const config=JSON.parse(await readFile('hauntboard/deploy/network.json','utf8'));
const origins=['https://ootle-indexer-a.tari.com','https://ootle-indexer-b.tari.com'];
const report={checkedAt:new Date().toISOString(),network:'esmeralda',board:config.board,template:config.template,providers:[],postingPrivacyVerified:false,scope:'Read-only current-state recovery; no new messages, wallets or spending.'};
for(const origin of origins){
 const witness=await readTestnetWitness(origin,config.providerRuntimeVersion);
 const boardRow=await getSubstate(origin,config.board,config.template),board=decodeState(boardRow,config.board);
 if(board.schema!==4||!board.isBoard||boardRow.substate.Component.header.owner_rule!=='None')throw new Error('Unexpected public board identity or owner rules.');
 const history=[];
 for(const ref of board.threads){
  const row=await getSubstate(origin,ref.address,config.template),thread=decodeState(row,ref.address);
  if(thread.schema!==4||thread.isBoard||thread.pageOwner||thread.board!==config.board||JSON.stringify(thread.uid)!==JSON.stringify(ref.uid))throw new Error('Public thread relationship mismatch.');
  let count=0;const pages=[];
  for(const [index,address] of thread.pages.entries()){
   const raw=await getSubstate(origin,address,config.template),page=decodeState(raw,address);
   if(page.pageOwner!==ref.address||page.pageStart!==index*16||page.board!==config.board||JSON.stringify(page.uid)!==JSON.stringify(thread.uid))throw new Error('Public page relationship mismatch.');
   count+=page.posts.length;pages.push({address,version:raw.version,hash:createHash('sha256').update(JSON.stringify(raw.substate)).digest('hex')});
  }
  if(count!==thread.postCount)throw new Error('Public history count mismatch.');
  history.push({address:ref.address,posts:count,pages});
 }
 report.providers.push({origin,witness,boardVersion:boardRow.version,boardHash:createHash('sha256').update(JSON.stringify(boardRow.substate)).digest('hex'),threads:history});
}
if(JSON.stringify(report.providers[0].threads)!==JSON.stringify(report.providers[1].threads)||report.providers[0].boardHash!==report.providers[1].boardHash)throw new Error('Providers disagree; repeat after indexer synchronization.');
report.status='PUBLIC_HISTORY_RECOVERED_ON_BOTH_PROVIDERS';
report.postCount=report.providers[0].threads.reduce((sum,t)=>sum+t.posts,0);
await writeFile('hauntboard/evidence/delivery-public-history.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,threads:report.providers[0].threads.length,posts:report.postCount,postingPrivacyVerified:false}));
