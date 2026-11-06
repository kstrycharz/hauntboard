// Actual bundled wallet/crypto and encrypted storage; synthetic provider/receipts.
// No public chain writes. Output values model the network's spent/change lifecycle.
import {chromium, firefox} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile, writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const server = createServer(async (req,res) => {
  try {
    if (req.url === '/') { res.setHeader('Content-Type','text/html'); res.end('<!doctype html><title>Posting wallet regression</title>'); return; }
    if (!/^\/(vendor\/[A-Za-z0-9_.-]+|[a-z-]+\.(mjs|wasm))$/.test(req.url)) throw Error('Path');
    res.setHeader('Content-Type',req.url.endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
    res.end(await readFile('hauntboard/web'+req.url));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(8798,'127.0.0.1',resolve));
const report = {checkedAt:new Date().toISOString(), scope:'Real SDK/WASM and encrypted browser wallet; synthetic owned outputs, execution and receipts. No public writes or claims of funded-chain execution.',browsers:{}};
try {
  for (const [name,engine] of [['chromium',chromium],['firefox',firefox]]) {
    const browser = await engine.launch();
    try {
      const page = await browser.newPage();
      await page.goto('http://127.0.0.1:8798');
      const checks = await page.evaluate(async () => {
        const wallet = await import('/browser-wallet.mjs'), sdk = await import('/vendor/wallet-sdk.mjs');
        const {NATIVE} = await import('/stealth-fee.mjs');
        const {transactionMetadata} = await import('/transaction-identity.mjs');
        const native = new sdk.WasmStealthCrypto(16), rows = new Map(), results = new Map();
        const board = `component_${'a'.repeat(64)}`;
        let sends = 0, submitted, preparedBeforeSend = false;
        const api = async (path, request) => {
          if (path.startsWith('/api/board')) return {schema:4,pages:[]};
          if (path === '/api/utxo-scan') return {utxos:[],nextCursor:null,complete:true};
          if (path === '/api/browser-submit') {
            if (!preparedBeforeSend) throw Error('Native identity was not persisted before dispatch');
            sends++; submitted = await transactionMetadata(request.transaction);
            return {transaction_id:submitted.id};
          }
          if (path === '/api/indexer') {
            if (request.path === 'network') return {network:'localnet',network_byte:16};
            if (request.path === 'epoch-manager/stats') return {current_epoch:10};
            if (request.path === 'transactions/dry-run') return {result:{finalize:{result:{Accept:{}},total_fees_required:'10000',fee_receipt:{total_fees_paid:'10000',total_fee_overcharge:'0'}}}};
            if (request.path.startsWith('transactions/')) return results.get(request.path.split('/')[1]);
            if (request.path.startsWith('substates/')) {
              const id = request.path.slice(10);
              if (rows.has(id)) return rows.get(id);
              if (id === board) return {verified:true,version:0,substate:{}};
              throw Object.assign(Error('No account at this address'),{status:404});
            }
          }
          throw Error('Unexpected synthetic provider request');
        };
        wallet.configure({network:'localnet',networkByte:16,resetIdentity:'posting-regression',posterPrivacy:'stealth-fee-v1'},api);
        const created = await wallet.create('604281');
        await wallet.confirmPhrase();
        const output = async (amount, change = false) => {
          const generated = await native.generateOutputsStatement([sdk.createOutput({destination:created.address,amount,resourceAddress:NATIVE,...(change ? {memo:{Message:'hauntboard:posting-change:v1'}} : {})})],null);
          const entry = JSON.parse(generated.statement.statementJson).outputs[0];
          const {sender_public_nonce,...body} = entry.output;
          const id = `utxo_${NATIVE.slice(9)}_${entry.output.commitment}`;
          rows.set(id,{verified:true,version:0,substate:{Utxo:{is_frozen:false,output:{...entry,output:{...body,public_nonce:sender_public_nonce}}}}});
          return id;
        };
        const receipt = (id, up, down = []) => results.set(id,{result:{Finalized:{final_decision:'Commit',execution_result:{finalize:{result:{Accept:{up_substates:up.map(id => [id,{}]),down_substates:down.map(id => [id,0])}},fee_receipt:{total_fees_paid:'13000'}}}}}});
        const incomingId = '1'.repeat(64), initial = await output(100000000n);
        receipt(incomingId,[initial]);
        await wallet.importIncoming(incomingId);
        if ((await wallet.privateBalance()).ready !== '100000000') throw Error('Initial funds unavailable');
        const body = {kind:'thread',board,title:'Synthetic post',mode:0,uid:Array(16).fill(1),payload:[1]};
        const first = await wallet.review(body);
        const firstSent = await wallet.submit(first, ({id}) => {if (!id) throw Error('Missing identity'); preparedBeforeSend = true;});
        const change = await output(100000000n-BigInt(first.maxFee),true);
        rows.delete(initial); receipt(firstSent.transactionId,[change],[initial]);
        await wallet.transaction(firstSent.transactionId);
        const remaining = await wallet.privateBalance();
        if (remaining.ready !== remaining.total || BigInt(remaining.ready) <= 99000000n) throw Error('Remaining funds were stranded after the first post');
        await wallet.setPostingPolicy('isolated');
        let held = false;
        try { await wallet.review({...body,uid:Array(16).fill(2)}); } catch (error) { held = error.code === 'change-held'; }
        if (!held) throw Error('Isolation did not explain held change');
        await wallet.setPostingPolicy('standard');
        wallet.lock(); await wallet.unlock('604281');
        if (wallet.getPostingPolicy() !== 'standard') throw Error('Explicit policy did not survive unlock');
        const second = await wallet.review({...body,uid:Array(16).fill(2)});
        if (second.coinId !== change) throw Error('The second post cannot use verified remaining funds');
        preparedBeforeSend = false;
        const secondSent = await wallet.submit(second, () => {preparedBeforeSend = true;});
        let reserved = false;
        try { await wallet.review({...body,uid:Array(16).fill(3)}); } catch { reserved = true; }
        if (!reserved || sends !== 2 || firstSent.transactionId === secondSent.transactionId) throw Error('Pending input was reused or operation identity repeated');
        results.set(secondSent.transactionId,{result:{Finalized:{final_decision:'Abort',execution_result:{finalize:{result:{Reject:{}},fee_receipt:{total_fees_paid:'0'}}}}}});
        await wallet.transaction(secondSent.transactionId);
        await wallet.setPostingPolicy('isolated');
        let stillHeld = false;
        try { await wallet.review({...body,uid:Array(16).fill(4)}); } catch (error) { stillHeld = error.code === 'change-held'; }
        if (!stillHeld) throw Error('A rejected spend discarded change provenance');
        return {firstPost:true,remainingFundsUsable:true,explicitIsolationExplained:true,policySurvivesUnlock:true,secondPostUsesChange:true,pendingInputProtected:true,identityPersistedBeforeDispatch:true,rejectionRetainsChangeProvenance:true};
      });
      assert(Object.values(checks).every(Boolean)); report.browsers[name] = checks;
      console.log(`${name}: two-post change lifecycle and pending-input regression passed (synthetic execution)`);
    } finally { await browser.close(); }
  }
  report.status = 'PASSED';
  await writeFile('hauntboard/evidence/posting-wallet-browser.json',JSON.stringify(report,null,2)+'\n');
} finally { server.close(); }
