// Read-only. Accept public transaction IDs, never a seed, view key or wallet export.
import { readFile, writeFile } from 'node:fs/promises';
import { decodeState } from '../lib/state.mjs';
import { providerState } from '../web/provider-state.mjs';
import {
  auditPostingTransactions,
  calledComponent,
  transactionParts,
} from '../lib/privacy-audit.mjs';

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  return i < 0 ? undefined : args[i + 1];
};
const allowedOptions = new Set(['--ids', '--owner-public-key', '--output']);
for (let i = 0; i < args.length; i += 2)
  if (!allowedOptions.has(args[i]) || !args[i + 1] || args[i + 1].startsWith('--'))
    throw new Error('Use --ids id,id [--owner-public-key hex] [--output file].');
const config = JSON.parse(await readFile('hauntboard/deploy/network.public.json', 'utf8'));
const providers = ['https://ootle-indexer-a.tari.com', 'https://ootle-indexer-b.tari.com'];
async function get(origin, path) {
  const response = await fetch(`${origin}/${path}`, {
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Public provider lookup failed (${response.status}).`);
  return response.json();
}
async function state(address) {
  const rows = await Promise.all(providers.map((p) => get(p, `substates/${address}`)));
  const decoded = rows.map((raw) => {
    const row = providerState(raw);
    if (row.substate?.Component?.header?.template_address?.replace(/^template_/, '') !== config.template)
      throw new Error('Unexpected board template.');
    return decodeState(row, address);
  });
  if (JSON.stringify(decoded[0]) !== JSON.stringify(decoded[1]))
    throw new Error('Providers disagree on board state; retry a read after indexing settles.');
  return decoded[0];
}
const board = await state(config.board);
if (board.schema !== 4 || !board.isBoard) throw new Error('Expected the no-author schema-4 board.');
const allowedComponents = [config.board, ...board.threads.map((t) => t.address)];
const records = [];
const idsOption = option('--ids');
let ids;
if (idsOption) {
  ids = idsOption.split(',');
  if (ids.length < 2 || ids.length > 12 || ids.some((id) => !/^[a-f0-9]{64}$/.test(id)))
    throw new Error('Supply 2–12 public transaction IDs.');
} else {
  const recent = await get(providers[0], 'transactions/recent?limit=100');
  ids = (recent.transactions ?? [])
    .filter((r) => {
      try {
        return transactionParts(r).tx.instructions.some(
          (i) =>
            allowedComponents.includes(calledComponent(i)) &&
            ['append', 'create_thread'].includes(i.CallMethod?.method),
        );
      } catch {
        return false;
      }
    })
    .slice(0, 12)
    .map((r) => r.transaction_id);
}
for (const id of ids) {
  const rows = await Promise.all(providers.map((p) => get(p, `transactions/${id}`)));
  // Compare the privacy-relevant fields; indexers may attach different local metadata.
  const projection = (row) => {
    const { tx, signatures, seal } = transactionParts(row);
    return JSON.stringify({
      inputs: tx.inputs,
      instructions: tx.instructions,
      fee_instructions: tx.fee_instructions,
      signatures,
      seal,
    });
  };
  if (projection(rows[0]) !== projection(rows[1]))
    throw new Error('Providers disagree on transaction data.');
  const results = await Promise.all(providers.map((p) => get(p, `transactions/${id}/result`)));
  if (
    results.some(
      (r) =>
        r.result?.Finalized?.final_decision !== 'Commit' ||
        !r.result.Finalized.execution_result?.finalize?.result?.Accept,
    )
  )
    throw new Error('Both providers must report finalized acceptance.');
  // Resolve thread page addresses from verified contract state; never whitelist a fee account from the transaction itself.
  for (const instruction of transactionParts(rows[0]).tx.instructions) {
    const target = calledComponent(instruction);
    if (target && target !== config.board && allowedComponents.includes(target)) {
      const thread = await state(target);
      if (thread.board !== config.board || thread.isBoard || thread.pageOwner)
        throw new Error('Invalid thread role.');
      allowedComponents.push(...thread.pages);
    }
  }
  records.push({ id, row: rows[0], result: results[0], fundingInspectionComplete: false });
}
const report = {
  checkedAt: new Date().toISOString(),
  network: config.network,
  board: config.board,
  providers,
  scope: 'Read-only public transaction inspection. No transactions signed or submitted.',
  ...(records.length >= 2
    ? auditPostingTransactions(records, {
        allowedComponents: [...new Set(allowedComponents)],
        ownerPublicKey: option('--owner-public-key'),
      })
    : {
        status: 'INSUFFICIENT_PUBLIC_POSTING_RECEIPTS',
        discovered: records.map((r) => r.id),
        strongUnlinkabilityProven: false,
        limitation:
          'Recent provider history is bounded. Supply two known post IDs with --ids; no substitute fee spends were created.',
      }),
};
await writeFile(
  option('--output') ?? 'hauntboard/evidence/privacy-public-audit.json',
  JSON.stringify(report, null, 2) + '\n',
);
console.log(JSON.stringify(report));
if (
  report.status === 'EXPOSURE_DETECTED' ||
  report.status === 'INSUFFICIENT_PUBLIC_POSTING_RECEIPTS'
)
  process.exitCode = 2;
