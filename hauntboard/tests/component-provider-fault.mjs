// Test-container preload only: force a proof delay on the primary board read.
// The fallback still retrieves and verifies actual public testnet state.
const board=process.env.TEST_BOARD;
if(!/^component_[a-f0-9]{64}$/.test(board??'')) throw new Error('TEST_BOARD_REQUIRED');
const original=globalThis.fetch;
globalThis.fetch=(url,options)=>String(url)===`https://ootle-indexer-a.tari.com/substates/${board}`
  ? Promise.resolve(new Response(JSON.stringify({verified:false}),{headers:{'Content-Type':'application/json'}}))
  : original(url,options);
