import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditPostingTransactions, transactionParts } from '../lib/privacy-audit.mjs';

const board = `component_${'a'.repeat(64)}`,
  account = `component_${'b'.repeat(64)}`;
const coin = (n) => `utxo_${'01'.repeat(32)}_${n.repeat(64)}`;
const options = { allowedComponents: [board], ownerPublicKey: 'e'.repeat(64) };
function record(n, signer = n) {
  return {
    id: n.repeat(64),
    fundingInspectionComplete: false,
    row: {
      transaction: {
        V1: {
          body: {
            transaction: {
              network: 38,
              inputs: [{ substate_id: board }, { substate_id: coin(n) }],
              instructions: [{ CallMethod: { call: { Address: board }, method: 'create_thread' } }],
              fee_instructions: [
                { StealthTransfer: { statement: { inputs_statement: { revealed_amount: '0' } } } },
                { PayFeeFromBucket: {} },
              ],
            },
            signatures: [],
          },
          seal_signature: { public_key: signer.repeat(64) },
        },
      },
    },
    result: {
      result: {
        Finalized: {
          final_decision: 'Commit',
          execution_result: {
            finalize: {
              result: { Accept: { up_substates: [[coin(n === '1' ? '3' : '4'), {}]] } },
            },
          },
        },
      },
    },
  };
}
test('two distinct signers without known graph links produce limited evidence, never an unlinkability claim', () => {
  const report = auditPostingTransactions([record('1'), record('2')], options);
  assert.equal(report.status, 'LIMITED_CHECKS_PASSED');
  assert.equal(report.strongUnlinkabilityProven, false);
  assert.equal(report.sameWalletProvenByPublicData, false);
  assert.equal(report.fundingInspectionComplete, false);
});
test('a conventional persistent signer and fee account are detected as a failing control', () => {
  const records = [record('1', 'e'), record('2', 'e')];
  for (const r of records) transactionParts(r.row).tx.inputs.push({ substate_id: account });
  const report = auditPostingTransactions(records, options);
  assert.equal(report.status, 'EXPOSURE_DETECTED');
  assert.deepEqual(report.pairs[0].sharedSigners, [options.ownerPublicKey]);
  assert.deepEqual(report.pairs[0].sharedNonBoardInputs, [account]);
  assert(
    report.transactions.every(
      (t) => !t.checks.ownerKeyAbsent && !t.checks.noUnexpectedComponentOrVault,
    ),
  );
});
test('different signers cannot conceal direct posting-change ancestry or common funding', () => {
  const a = record('1'),
    b = record('2');
  transactionParts(b.row).tx.inputs[1].substate_id = coin('3');
  a.fundingOrigins = b.fundingOrigins = ['f'.repeat(64)];
  const report = auditPostingTransactions([a, b], options);
  assert.equal(report.status, 'EXPOSURE_DETECTED');
  assert.deepEqual(report.pairs[0].directOutputSpends, [coin('3')]);
  assert.deepEqual(report.pairs[0].sharedFundingOrigins, ['f'.repeat(64)]);
});
test('revealed fees, wrong network, nonposting methods, and rejection fail the checks', () => {
  for (const mutate of [
    (r) => (transactionParts(r.row).tx.network = 16),
    (r) =>
      (transactionParts(
        r.row,
      ).tx.fee_instructions[0].StealthTransfer.statement.inputs_statement.revealed_amount = '1'),
    (r) => (transactionParts(r.row).tx.instructions[0].CallMethod.method = 'withdraw'),
    (r) => (r.result.result.Finalized.final_decision = 'Abort'),
  ]) {
    const r = record('2');
    mutate(r);
    assert.equal(auditPostingTransactions([record('1'), r], options).status, 'EXPOSURE_DETECTED');
  }
});
test('missing owner reference stays unknown; missing signatures, unknown encoding and duplicate receipts fail closed', () => {
  assert.equal(
    auditPostingTransactions([record('1'), record('2')], { allowedComponents: [board] })
      .transactions[0].checks.ownerKeyAbsent,
    null,
  );
  assert.throws(() => auditPostingTransactions([record('1')], options));
  assert.throws(() => auditPostingTransactions([record('1'), record('1')], options));
  const r = record('2');
  delete r.row.transaction.V1.body.signatures;
  assert.throws(() => auditPostingTransactions([record('1'), r], options));
  assert.throws(() => transactionParts({ transaction: {} }));
});
