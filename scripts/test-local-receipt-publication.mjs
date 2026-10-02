// Actual wallet Web UI in the isolated CI browser, using the existing test-only passkey.
import { chromium } from '@playwright/test';
import { openLocalWallet } from './lib/local-test-auth.mjs';
import { writeFile, readFile, open, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { writePrivateJson } from './lib/private-json.mjs';
import { localNetworkWitness } from './lib/local-network-witness.mjs';
import { exactRpcUnits } from './lib/wallet-funding-adapter.mjs';
const browser = await chromium.launch();
const fullRoom = process.env.PUBLISH_HAUNTBOX_ROOM === 'true';
const sourcePath = fullRoom
  ? 'templates/hauntbox-room/src/lib.rs'
  : 'spikes/receipt-template/src/lib.rs';
const wasmPath = fullRoom
  ? 'templates/hauntbox-room/hauntbox-room.wasm'
  : 'docs/evidence/m2/receipt-spike.wasm';
const publishedPath = fullRoom
  ? 'docs/evidence/m2/room-published-local.wasm'
  : 'docs/evidence/m2/receipt-published-local.wasm';
let lock, wallet;
let phase = 'route';
const journalPath = fullRoom
  ? '/private/room-publication.json'
  : '/private/receipt-publication.json';
let journal;
async function readRpc(method, params) {
  assert(
    [
      'transactions.get',
      'templates.list_authored',
      'transactions.get_all',
      'transactions.submit_manifest',
      'transactions.submit_instruction',
    ].includes(method),
  );
  if (method === 'transactions.submit_manifest') assert.equal(params.dry_run, true);
  const response = await fetch('http://sender:5100/json_rpc', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${(await readFile(wallet.tokenFile, 'utf8')).trim()}`,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(10000),
  });
  const body = await response.json();
  if (!response.ok || body.error || !body.result) {
    const text = JSON.stringify(body.error ?? {});
    const missing = /missing field [`']([a-z_]+)[`']/.exec(text)?.[1];
    const category = [
      'Syntax error',
      'Lex error',
      'not imported',
      'not defined',
      'Invalid variable type',
      'Unsupported expression',
      'Failed to parse variable',
      'Failed to parse manifest',
    ].find((s) => text.includes(s));
    console.log(JSON.stringify({ rpcErrorKeys: Object.keys(body.error ?? {}), category }));
    throw Object.assign(new Error('READ_RPC_FAILED'), {
      code: `READ_RPC_FAILED_${method}_${body.error?.code ?? response.status}${missing ? `_MISSING_${missing}` : ''}`,
    });
  }
  return body.result;
}
try {
  lock = await open('/private/integration.lock', 'wx', 0o600);
  wallet = await openLocalWallet(browser, 'sender', '/private');
  const identity = await localNetworkWitness();
  const sourceHash = createHash('sha256')
    .update(await readFile(sourcePath))
    .digest('hex');
  const sourceWasmHash = createHash('sha256')
    .update(await readFile(wasmPath))
    .digest('hex');
  try {
    journal = JSON.parse(await readFile(journalPath, 'utf8'));
    assert.equal(journal.instance, identity.instance);
    assert.equal(journal.sourceWasmHash, sourceWasmHash);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    journal = { instance: identity.instance, sourceHash, sourceWasmHash, state: 'prepared' };
  }
  if (journal.state === 'submitting' && !journal.tx)
    throw new Error('UNCERTAIN_PUBLICATION_REQUIRES_RECONCILIATION');
  if (journal.state === 'prepared') {
    await wallet.page.unroute('http://localhost:5100/**');
    await wallet.page.route('http://localhost:5100/**', async (route) => {
      const url = route.request().url().replace('http://localhost:5100', 'http://sender:5100');
      const data = route.request().postData() ? route.request().postDataJSON() : null;
      if (['webauthn.auth_start', 'webauthn.already_registered'].includes(data?.method))
        data.params.username = 'hauntbox-local-ci-sender';
      if (data?.method === 'transactions.publish_template' && !data.params.dry_run) {
        assert.equal(data.params.fee_account.ComponentAddress, wallet.account.component_address);
        assert(BigInt(exactRpcUnits(data.params.max_fee)) <= 5000000n);
        assert.equal(journal.state, 'prepared');
        const binary = Buffer.from(data.params.binary, 'base64');
        journal.publishedWasmHash = createHash('sha256').update(binary).digest('hex');
        journal.maxFee = exactRpcUnits(data.params.max_fee);
        journal.state = 'submitting';
        await writePrivateJson(journalPath, journal);
        await writeFile(publishedPath, binary);
      }
      const response = await route.fetch({ url, ...(data ? { postData: data } : {}) });
      if (data?.method === 'transactions.publish_template' && !data.params.dry_run) {
        const result = await response.json();
        assert(/^[a-f0-9]{64}$/.test(result.result?.transaction_id));
        journal.tx = result.result.transaction_id;
        await writePrivateJson(journalPath, journal);
      }
      await route.fulfill({ response });
    });
    await wallet.page.goto('http://localhost:5100/');
    phase = 'authenticated-ui';
    const { credentials } = await wallet.cdp.send('WebAuthn.getCredentials', {
      authenticatorId: wallet.authenticatorId,
    });
    await writeFile('/private/sender-passkey.json', JSON.stringify(credentials[0]), {
      mode: 0o600,
    });
    await wallet.page.getByRole('button', { name: /Send/i }).first().waitFor();
    await wallet.page.getByRole('button', { name: 'Publish Template', exact: true }).click();
    await wallet.page.getByRole('dialog').waitFor();
    await wallet.page
      .getByRole('dialog')
      .locator('input[type="file"]')
      .first()
      .setInputFiles(wasmPath);
    await wallet.page.getByRole('button', { name: 'Estimate fee', exact: true }).waitFor();
    await wallet.page.getByRole('button', { name: 'Estimate fee', exact: true }).click();
    await wallet.page.getByRole('button', { name: 'Re-estimate', exact: true }).waitFor();
    const maxFee =
      BigInt(await wallet.page.getByRole('dialog').locator('input[name="maxFee"]').inputValue()) +
      10000n;
    assert(maxFee <= 5000000n);
    await wallet.page.getByRole('dialog').locator('input[name="maxFee"]').fill(maxFee.toString());
    await wallet.page.getByRole('button', { name: 'Publish', exact: true }).click();
    await wallet.page
      .getByRole('heading', { name: 'Publish Template', exact: true })
      .waitFor({ state: 'hidden' });
  }
  assert(journal.tx);
  let transaction;
  for (let attempt = 0; attempt < 30; attempt++) {
    transaction = await readRpc('transactions.get', { transaction_id: journal.tx });
    if (transaction.status === 'Accepted') break;
    if (!['New', 'Pending'].includes(transaction.status)) throw new Error('PUBLICATION_REJECTED');
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  assert.equal(transaction.status, 'Accepted');
  assert.equal(transaction.result.transaction_hash, journal.tx);
  assert(
    BigInt(exactRpcUnits(transaction.result.fee_receipt.total_fees_paid)) <= BigInt(journal.maxFee),
  );
  journal.state = 'confirmed';
  await writePrivateJson(journalPath, journal);
  const templates = await readRpc('templates.list_authored', {
    author_public_key: wallet.account.owner_public_key,
    page: 0,
    page_size: 20,
  });
  const template = templates.templates.find(
    (row) => row.name === (fullRoom ? 'HauntboxRoom' : 'HauntboxReceiptSpike'),
  );
  assert(template);
  journal.template = template.address;
  await writePrivateJson(journalPath, journal);
  if (fullRoom) {
    assert.equal(journal.publishedWasmHash, sourceWasmHash);
    await writePrivateJson('/private/app-receipt-config.json', {
      network: 'localnet',
      instance: identity.instance,
      template: journal.template,
      indexerUrl: 'http://indexer:18300',
      receipt: {
        account: wallet.account.component_address,
        rpcUrl: 'http://sender:5100/json_rpc',
        tokenFile: '/private/sender-token',
      },
    });
    console.log(
      JSON.stringify({
        status: 'LOCAL_ROOM_TEMPLATE_PUBLISHED',
        publishedThroughWalletUi: true,
        sourceWasmMatched: true,
      }),
    );
  } else {
    if (!journal.create) {
      console.log(
        JSON.stringify({
          templateAddressLength: journal.template.length,
          templatePrefix: journal.template.startsWith('template_'),
          templateHex: /^[a-f0-9]{64}$/.test(journal.template),
        }),
      );
      const manifest = `use template_${journal.template} as Receipt;\nfn fee_main() { let account = var!["account"]; account.pay_fee(1000000); }\nfn main() { let receipt = Receipt::new(var!["digest"]); }`;
      const dry = await readRpc('transactions.submit_manifest', {
        manifest,
        variables: {
          account: wallet.account.component_address,
          digest: `[${Array(32).fill('7u8').join(',')}]`,
        },
        max_fee: '1000000',
        dry_run: true,
        seal_signer_key_id: null,
      });
      const simulated = await readRpc('transactions.get', { transaction_id: dry.transaction_id });
      console.log(
        JSON.stringify({
          receiptDryRunStatus: simulated.status,
          instructionContainerKeys: Object.keys(simulated.transaction?.V1?.body ?? {}),
          responseKeys: Object.keys(dry),
        }),
      );
      const instructions = simulated.transaction.V1.body.transaction.instructions;
      const maxFee = BigInt(exactRpcUnits(dry.required_fees)) + 10000n;
      assert(maxFee <= 1000000n);
      journal.create = { state: 'submitting', maxFee: maxFee.toString() };
      await writePrivateJson(journalPath, journal);
      const submitted = await readRpc('transactions.submit_instruction', {
        instructions,
        fee_account: wallet.account.component_address,
        max_fee: maxFee.toString(),
        inputs: [],
        override_inputs: true,
        proof_ids: [],
      });
      journal.create.tx = submitted.transaction_id;
      await writePrivateJson(journalPath, journal);
    }
    assert(journal.create.tx);
    let created;
    for (let attempt = 0; attempt < 30; attempt++) {
      created = await readRpc('transactions.get', { transaction_id: journal.create.tx });
      if (created.status === 'Accepted') break;
      if (!['New', 'Pending'].includes(created.status)) throw new Error('CREATE_REJECTED');
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    assert.equal(created.status, 'Accepted');
    assert(
      BigInt(exactRpcUnits(created.result.fee_receipt.total_fees_paid)) <=
        BigInt(journal.create.maxFee),
    );
    journal.component = created.result.result.Accept.up_substates.find(
      ([id]) => typeof id === 'string' && id.startsWith('component_'),
    )?.[0];
    assert(journal.component);
    journal.create.state = 'confirmed';
    await writePrivateJson(journalPath, journal);
    if (!journal.call) {
      const manifest = `fn fee_main() { let account = var!["account"]; account.pay_fee(1000000); }\nfn main() { let receipt = var!["receipt"]; receipt.get_receipt(); }`;
      const dry = await readRpc('transactions.submit_manifest', {
        manifest,
        variables: { account: wallet.account.component_address, receipt: journal.component },
        max_fee: '1000000',
        dry_run: true,
        seal_signer_key_id: null,
      });
      const simulated = await readRpc('transactions.get', { transaction_id: dry.transaction_id });
      assert.equal(simulated.status, 'DryRun');
      const maxFee = BigInt(exactRpcUnits(dry.required_fees)) + 10000n;
      assert(maxFee <= 1000000n);
      journal.call = { state: 'submitting', maxFee: maxFee.toString() };
      await writePrivateJson(journalPath, journal);
      const submitted = await readRpc('transactions.submit_instruction', {
        instructions: simulated.transaction.V1.body.transaction.instructions,
        fee_account: wallet.account.component_address,
        max_fee: maxFee.toString(),
        inputs: [],
        override_inputs: true,
        proof_ids: [],
      });
      journal.call.tx = submitted.transaction_id;
      await writePrivateJson(journalPath, journal);
    }
    assert(journal.call.tx);
    let called;
    for (let attempt = 0; attempt < 30; attempt++) {
      called = await readRpc('transactions.get', { transaction_id: journal.call.tx });
      if (called.status === 'Accepted') break;
      if (!['New', 'Pending'].includes(called.status)) throw new Error('CALL_REJECTED');
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    assert.equal(called.status, 'Accepted');
    assert(
      BigInt(exactRpcUnits(called.result.fee_receipt.total_fees_paid)) <=
        BigInt(journal.call.maxFee),
    );
    journal.call.state = 'confirmed';
    await writePrivateJson(journalPath, journal);
    console.log(
      JSON.stringify({
        receiptReadAccepted: true,
        returnedIndexedKeys: Object.keys(called.result.execution_results?.[0]?.indexed ?? {}),
      }),
    );
    const receiptValue = called.result.execution_results?.[0]?.indexed?.value;
    assert.deepEqual(receiptValue?.[0], Array(32).fill(7));
    assert(Number.isSafeInteger(receiptValue?.[1]));
    const publicResponse = await fetch(`http://indexer:18300/substates/${journal.component}`, {
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
    });
    assert(publicResponse.ok);
    const publicState = await publicResponse.json();
    const sourceLinked =
      createHash('sha256')
        .update(await readFile('docs/evidence/m2/receipt-spike-rebuilt.wasm'))
        .digest('hex') === journal.publishedWasmHash &&
      journal.sourceWasmHash === journal.publishedWasmHash;
    assert(sourceLinked);
    const component = publicState.substate?.Component;
    assert(component);
    assert.equal(publicState.verified, true);
    assert.equal(component.header.template_address.replace(/^template_/, ''), journal.template);
    console.log(
      JSON.stringify({
        componentKeys: Object.keys(component),
        indexerVerified: publicState.verified,
      }),
    );
    const evidence = {
      checkedAt: new Date().toISOString(),
      network: 'localnet',
      status: 'PASSED_LOCAL_RECEIPT_PUBLICATION_CREATE_CALL',
      checks: {
        publishedThroughRealWalletUi: true,
        walletFeeEstimateAndPaidFeeWithinCaps: true,
        sourceRebuildMatchesPublishedWasm: sourceLinked,
        originalTemplateFoundInWallet: true,
        createAndGetReceiptAccepted: true,
        expectedSyntheticDigestReturned: true,
        independentlyReadFromIndexer: true,
      },
      sourceHash: journal.sourceHash,
      wasmHash: journal.publishedWasmHash,
    };
    await writeFile(
      'docs/evidence/m2/local-receipt.json',
      JSON.stringify(evidence, null, 2) + '\n',
    );
    console.log(
      JSON.stringify({
        indexerStateKeys: Object.keys(publicState),
        substateKeys: Object.keys(publicState.substate ?? {}),
        componentValueKeys: Object.keys(publicState.substate?.value ?? {}),
      }),
    );
    console.log(
      JSON.stringify({
        createdAcceptanceKeys: Object.keys(created.result.result.Accept),
        upSubstateKeys: Object.keys(created.result.result.Accept.up_substates[0] ?? {}),
        executionKeys: Object.keys(created.result.execution_results?.[0] ?? {}),
      }),
    );
    console.log(
      JSON.stringify({
        status: 'LOCAL_WALLET_UI_PUBLICATION_CONFIRMED',
        templateResponseKeys: Object.keys(templates),
        templateRowKeys: Object.keys(templates.templates?.[0] ?? {}),
        acceptanceKeys: Object.keys(transaction.result.result.Accept),
      }),
    );
  }
} catch (error) {
  console.log(
    JSON.stringify({
      status: 'LOCAL_UI_INSPECTION_FAILED',
      phase,
      timeout: error.name === 'TimeoutError',
      code: error.code ?? error.name,
    }),
  );
  process.exitCode = 1;
} finally {
  try {
    await wallet?.close();
  } finally {
    await browser.close();
    if (lock) {
      await lock.close();
      await unlink('/private/integration.lock');
    }
  }
}
