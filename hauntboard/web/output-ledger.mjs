// Bounded discovery; ownership and proof checks are supplied by the native Tari wallet path.
export async function scanOutputLedger({coins,cursor=null,readPage,verifyOwned,checkpoint=async()=>{},maxPages=10,capacity=32}){
 const ledger=coins.filter(c=>c.state!=='used').map(c=>({...c}));
 if(ledger.length>capacity||new Set(ledger.map(c=>c.id)).size!==ledger.length)throw new Error('Invalid wallet output ledger.');
 let found=0,complete=false,capacityReached=false;
 // Indexer cursors are opaque commitment IDs. Pages follow database insertion
 // order, not lexical commitment order. Reject repeats, not decreasing text.
 const seen=new Set(cursor===null?[]:[cursor]);
 for(let page=0;page<maxPages;page++){
  const response=await readPage(cursor),rows=response?.utxos;
  if(!Array.isArray(rows)||rows.length>100)throw new Error('Invalid output scan response.');
  const pageIds=new Set();
  for(const row of rows){
   if(!Array.isArray(row)||row.length!==2||typeof row[0]!=='string'||!/^[a-f0-9]{64}$/.test(row[0])||!row[1]||typeof row[1]!=='object'||Array.isArray(row[1]))throw new Error('Invalid output scan response.');
   if(seen.has(row[0])||pageIds.has(row[0]))throw new Error('Output scan cursor did not advance.');
   pageIds.add(row[0]);
  }
  for(const commitment of pageIds)seen.add(commitment);
  for(const [commitment,utxo] of rows){
   const id=`utxo_${'01'.repeat(32)}_${commitment}`;
   if(!ledger.some(c=>c.id===id)){
    const owned=await verifyOwned(id,utxo);
    if(owned){
     if(ledger.length>=capacity){capacityReached=true;await checkpoint({coins:ledger,cursor,complete:false,capacityReached});return {coins:ledger,cursor,complete:false,capacityReached,found};}
     ledger.push({id,state:owned.change?'quarantined':'ready'});found++;
    }
   }
   cursor=commitment;
  }
  complete=rows.length<100;
  await checkpoint({coins:ledger,cursor:complete?null:cursor,complete,capacityReached});
  if(complete)break;
 }
 return {coins:ledger,cursor:complete?null:cursor,complete,capacityReached,found};
}
