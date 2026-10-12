import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const sums=await readFile('release/SHA256SUMS','utf8');
for(const line of sums.trim().split('\n')) {
  const match=/^([a-f0-9]{64})  ([A-Za-z0-9/._-]+)$/.exec(line);
  assert(match,'Invalid checksum entry');
  assert(!match[2].split('/').includes('..'),'Invalid checksum path');
  assert.equal(createHash('sha256').update(await readFile(match[2])).digest('hex'),match[1],match[2]);
}
const network=JSON.parse(await readFile('hauntboard/deploy/network.public.json','utf8'));
assert.equal(network.network,'esmeralda');
assert.equal(network.schema,4);
assert.match(network.board,/^component_[a-f0-9]{64}$/);
assert.match(network.template,/^[a-f0-9]{64}$/);
assert(WebAssembly.validate(await readFile('hauntboard/template-public/hauntboard_public.wasm')));
for(const file of ['hauntboard/web/wallet-recovery.wasm','hauntboard/web/transaction-identity.wasm']) assert(WebAssembly.validate(await readFile(file)),file);
console.log('Release artifact checksums, WASM and published board identity verified.');
