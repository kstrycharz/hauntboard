// Bounded local-only wallet integration. Private journal survives crashes; mutations never retry.
import { chromium } from '@playwright/test';
import { readFile, writeFile, open, unlink } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { openLocalWallet } from './lib/local-test-auth.mjs';
import { localNetworkWitness } from './lib/local-network-witness.mjs';
import { NATIVE_RESOURCE, exactRpcUnits } from './lib/wallet-funding-adapter.mjs';
import { units } from './lib/funding.mjs';
import { writePrivateJson } from './lib/private-json.mjs';
process.umask(0o077);
const checks = { submittedTransactions: 0 };
const wallets = [];
const allowed = new Set([
  'wallet.get_info',
  'accounts.get_balances',
  'accounts.stealth_transfer',
  'transactions.get',
  'transactions.get_all',
  'stealth_utxos.list',
]);
const evidencePath = 'docs/evidence/m2/local-private-transfer.json';
const journalPath = '/private/private-transfer.json';
const lockPath = '/private/integration.lock';
const browser = await chromium.launch();
let lock;
let journal;
async function evidence(status) {
  await writeFile(
    evidencePath,
    JSON.stringify(
      { checkedAt: new Date().toISOString(), network: 'localnet', status, checks },
      null,
      2,
    ) + '\n',
  );
}
async function save() {
  await writePrivateJson(journalPath, journal);
}
async function rpc(role, method, params) {
  assert(allowed.has(method));
  const wallet = wallets[role === 'sender' ? 0 : 1];
  const token = await readFile(wallet.tokenFile, 'utf8');
  const response = await fetch(`http://${role}:5100/json_rpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token.trim()}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(15000),
    redirect: 'error',
  });
  const body = await response.json();
  if (!response.ok || body.error || !body.result)
    throw Object.assign(new Error('LOCAL_RPC_REJECTED'), {
      code: 'LOCAL_RPC_REJECTED',
      rpcCode: body.error?.code,
    });
  return body.result;
}
function unsigned(tx) {
  return tx.transaction?.V1?.body?.transaction;
}
async function waitTx(role, tx) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const result = await rpc(role, 'transactions.get', { transaction_id: tx });
    if (!['New', 'Pending'].includes(result.status)) return result;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('LOCAL_TRANSACTION_PENDING');
}
async function transfer(name, role, destination, amount, selection, memo) {
  const owner = wallets[role === 'sender' ? 0 : 1].account.component_address;
  let stage = journal.stages[name];
  if (!stage) {
    const request = {
      owner_account: { ComponentAddress: owner },
      resource_address: NATIVE_RESOURCE,
      input_selection: selection,
      fee_params: { input_selection: selection, pay_fee_with_swap: null },
      transfers: [
        {
          destination_address: destination,
          blinded_output_amount: amount,
          revealed_output_amount: '0',
          output_memo: { Message: memo },
          pay_to: 'StealthPublicKey',
          attach_sender_address: false,
        },
      ],
      max_fee: '1000000',
      dry_run: true,
    };
    const dry = await rpc(role, 'accounts.stealth_transfer', request);
    const dryResult = await waitTx(role, dry.transaction_id);
    assert.equal(dryResult.status, 'DryRun');
    assert(dryResult.result?.result?.Accept);
    const measured = units(exactRpcUnits(dryResult.result.total_fees_required));
    const maxFee = measured + 10000n;
    assert(maxFee <= 1000000n);
    checks[`${name}EstimatedFeeWithinCap`] = true;
    const history = await rpc(role, 'transactions.get_all', { account: owner, status: null });
    stage = {
      state: 'submitting',
      baseline: history.transactions.map((row) => row.id),
      maxFee: maxFee.toString(),
    };
    journal.stages[name] = stage;
    await save();
    // Record uncertainty before the sole submission; a lost response stays reconcilable.
    checks.submittedTransactions++;
    const submitted = await rpc(role, 'accounts.stealth_transfer', {
      ...request,
      max_fee: stage.maxFee,
      dry_run: false,
    });
    assert(/^[a-f0-9]{64}$/.test(submitted.transaction_id));
    stage.tx = submitted.transaction_id;
    await save();
  }
  if (!stage.tx) {
    const history = await rpc(role, 'transactions.get_all', { account: owner, status: null });
    const rows = history.transactions.filter(
      (row) => !row.is_dry_run && !stage.baseline.includes(row.id),
    );
    assert.equal(rows.length, 1, 'uncertain stage requires exactly one account-linked candidate');
    stage.tx = rows[0].id;
    await save();
  }
  const result = await waitTx(role, stage.tx);
  assert.equal(result.status, 'Accepted');
  assert.equal(result.result.transaction_hash, stage.tx);
  assert(result.result.result.Accept);
  const fee = exactRpcUnits(result.result.fee_receipt.total_fees_paid);
  assert(units(fee) <= units(stage.maxFee));
  stage.state = 'confirmed';
  stage.fee = fee;
  await save();
  assert(
    Object.values(journal.stages).reduce(
      (total, row) => total + units(row.fee ?? row.maxFee),
      0n,
    ) <= 3000000n,
  );
  checks[`${name}Confirmed`] = true;
  return result;
}
async function outputs(role) {
  const wallet = wallets[role === 'sender' ? 0 : 1];
  await rpc(role, 'accounts.get_balances', {
    account: wallet.account.component_address,
    refresh: true,
  });
  return (
    await rpc(role, 'stealth_utxos.list', {
      resource_address: NATIVE_RESOURCE,
      account_address: wallet.account.component_address,
      filter_by_status: null,
    })
  ).utxos;
}
async function waitOutput(role, predicate) {
  for (let attempt = 0; attempt < 20; attempt++) {
    if ((await outputs(role)).some(predicate)) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('LOCAL_OUTPUT_SCAN_PENDING');
}
try {
  lock = await open(lockPath, 'wx', 0o600);
  await evidence('IN_PROGRESS_LOCAL_ONLY');
  const identity = await localNetworkWitness();
  try {
    journal = JSON.parse(await readFile(journalPath, 'utf8'));
    assert.equal(journal.instance, identity.instance);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    journal = { instance: identity.instance, stages: {} };
  }
  for (const role of ['sender', 'receiver'])
    wallets.push(await openLocalWallet(browser, role, '/private'));
  assert.notEqual(wallets[0].account.owner_public_key, wallets[1].account.owner_public_key);
  checks.independentAuthenticatedWallets = true;
  await transfer(
    'convert',
    'sender',
    wallets[0].address,
    '500000000',
    'RevealedOnly',
    'local-concealed-input',
  );
  await waitOutput(
    'sender',
    (output) =>
      output.memo?.Message === 'local-concealed-input' &&
      ['Unspent', 'Spent'].includes(output.status),
  );
  checks.concealedInputScanned = true;
  const reward = await transfer(
    'reward',
    'sender',
    wallets[1].address,
    '100000000',
    'ConfidentialOnly',
    'Hauntbox local proof',
  );
  // Inspect the actual pruned transaction, never exported as public evidence.
  const body = unsigned(reward);
  checks.rewardTransactionBodyParsed = !!body && Array.isArray(body.instructions);
  assert(body && Array.isArray(body.instructions));
  const statements = [...body.fee_instructions, ...body.instructions]
    .filter((i) => i.StealthTransfer)
    .map((i) => i.StealthTransfer.statement);
  checks.rewardStatementShape = statements.map((s) => ({
    inputs: s.inputs_statement.inputs.length,
    outputs: s.outputs_statement.outputs.length,
    zeroRevealedInput: s.inputs_statement.revealed_amount === '0',
    noRevealedOutput: s.outputs_statement.revealed_output === null,
  }));
  assert(statements.length > 0);
  assert(statements.every((s) => s.inputs_statement.revealed_amount === '0'));
  const feeReveals = statements.map((s) => s.outputs_statement.revealed_output).filter(Boolean);
  assert.equal(feeReveals.length, 1);
  assert.equal(exactRpcUnits(feeReveals[0].amount), journal.stages.reward.maxFee);
  assert(body.fee_instructions.some((instruction) => instruction.PayFeeFromBucket));
  assert(
    statements.some(
      (s) => s.inputs_statement.inputs.length > 0 && s.outputs_statement.outputs.length >= 2,
    ),
  );
  checks.zeroRevealedRewardAndConcealedChange = true;
  checks.revealedOutputRestrictedToFeePayment = true;
  const publicResponse = await fetch(
    `http://indexer:18300/transactions/${journal.stages.reward.tx}`,
    { signal: AbortSignal.timeout(10000), redirect: 'error' },
  );
  assert(publicResponse.ok);
  const publicTransaction = (await publicResponse.json()).transaction?.transaction;
  assert.deepEqual(publicTransaction, reward.transaction);
  const publicBytes = JSON.stringify(publicTransaction);
  assert(!publicBytes.includes('Hauntbox local proof'));
  assert(!publicBytes.includes(wallets[1].address));
  assert(!publicBytes.includes(wallets[1].account.owner_public_key));
  checks.publicIndexerOmitsPlainMemoAndReceiverIdentity = true;
  checks.publicSenderOwnerKeyVisible = publicBytes.includes(wallets[0].account.owner_public_key);
  await waitOutput(
    'receiver',
    (output) =>
      output.memo?.Message === 'Hauntbox local proof' &&
      output.value === '100000000' &&
      ['Unspent', 'Spent'].includes(output.status) &&
      output.is_on_chain,
  );
  checks.receiverScansAmountAndMemo = true;
  await transfer(
    'receiverSpend',
    'receiver',
    wallets[0].address,
    '20000000',
    'ConfidentialOnly',
    'local-receiver-spend',
  );
  await waitOutput(
    'sender',
    (output) =>
      output.memo?.Message === 'local-receiver-spend' &&
      output.value === '20000000' &&
      output.status === 'Unspent',
  );
  checks.independentReceiverSpend = true;
  await evidence('PASSED_LOCAL_WALLET_PRIVATE_TRANSFER');
  console.log(JSON.stringify({ status: 'PASSED_LOCAL_WALLET_PRIVATE_TRANSFER', checks }));
} catch (error) {
  await evidence('FAILED_LOCAL_WALLET_PRIVATE_TRANSFER');
  console.error(
    JSON.stringify({
      status: 'FAILED_LOCAL_WALLET_PRIVATE_TRANSFER',
      checks,
      code: error.code ?? 'LOCAL_ASSERTION_FAILED',
    }),
  );
  process.exitCode = 1;
} finally {
  for (const wallet of wallets) {
    try {
      await wallet.close();
    } catch {
      process.exitCode = 1;
    }
  }
  await browser.close();
  if (process.exitCode) await evidence('FAILED_LOCAL_WALLET_PRIVATE_TRANSFER');
  if (lock) {
    await lock.close();
    await unlink(lockPath);
  }
}
