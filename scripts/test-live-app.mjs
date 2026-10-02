// Real local application journey with CI-only virtual passkey. No public wallets or funds.
import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { localNetworkWitness } from './lib/local-network-witness.mjs';
import { writePrivateJson } from './lib/private-json.mjs';
const witness = await localNetworkWitness();
const browser = await chromium.launch(),
  context = await browser.newContext(),
  page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send('WebAuthn.enable');
const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
  options: {
    protocol: 'ctap2',
    transport: 'internal',
    hasResidentKey: true,
    hasUserVerification: true,
    isUserVerified: true,
    automaticPresenceSimulation: true,
  },
});
let stored;
try {
  stored = JSON.parse(await readFile('/private/app-curator-passkey.json', 'utf8'));
  await cdp.send('WebAuthn.addCredential', { authenticatorId, credential: stored });
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
let journal;
try {
  journal = JSON.parse(await readFile('/private/app-journey.json', 'utf8'));
  assert.equal(journal.instance, witness.instance);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  journal = { instance: witness.instance };
}
const checks = { ...(journal.checks ?? {}) };
let phase = 'start';
const walletSettings = JSON.parse(await readFile('/private/app-wallet-settings.json', 'utf8'));
async function nativeRead(role, method, params) {
  assert(['transactions.get_all', 'accounts.get_balances', 'stealth_utxos.list'].includes(method));
  const settings = walletSettings[role];
  const response = await fetch(settings.rpcUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${(await readFile(settings.tokenFile, 'utf8')).trim()}`,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(15000),
  });
  const body = await response.json();
  assert(response.ok && !body.error && body.result);
  return body.result;
}
async function transactionCount() {
  let count = 0;
  for (const role of ['receipt', 'reward'])
    count += (
      await nativeRead(role, 'transactions.get_all', {
        account: walletSettings[role].account,
        status: null,
      })
    ).transactions.filter((row) => !row.is_dry_run).length;
  return count;
}
const baselineCount = await transactionCount();
page.on('pageerror', (error) =>
  console.log(
    JSON.stringify({
      browserErrorType: error.name,
    }),
  ),
);
const save = () => writePrivateJson('/private/app-journey.json', journal);
await page.route('http://localhost:5173/**', async (route) => {
  const response = await route.fetch({
    url: route.request().url().replace('http://localhost:5173', 'http://web:5173'),
  });
  await route.fulfill({ response });
});
const submittedBodies = [];
page.on('request', (request) => {
  if (request.url().includes('/envelopes') && request.method() === 'POST')
    submittedBodies.push(request.postDataJSON());
});
try {
  await page.goto('http://localhost:5173/');
  await page.getByText('Local test network', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Curator', exact: true }).click();
  phase = 'passkey';
  if (stored) await page.getByRole('button', { name: 'Sign in with passkey', exact: true }).click();
  else {
    await page.getByText('First-time operator setup', { exact: true }).click();
    await page
      .getByLabel('Private setup code')
      .fill((await readFile('/run/hauntbox/bootstrap-code', 'utf8')).trim());
    await page.getByRole('button', { name: 'Register curator passkey', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Sign out', exact: true }).waitFor();
  const credentials = await cdp.send('WebAuthn.getCredentials', { authenticatorId });
  await writePrivateJson('/private/app-curator-passkey.json', credentials.credentials[0]);
  checks.realAppPasskeyVerified = true;
  phase = 'room';
  if (!journal.room) {
    await page
      .getByRole('button', { name: 'Generate browser encryption key', exact: true })
      .click();
    const download = page.waitForEvent('download');
    await page
      .getByRole('button', { name: 'Download encrypted recovery file', exact: true })
      .click();
    const file = await download;
    const path = await file.path();
    journal.recoveryFile = await readFile(path, 'utf8');
    journal.recoveryCode = await page
      .getByLabel('Separate recovery code', { exact: true })
      .first()
      .inputValue();
    await save();
    await page
      .getByLabel('Encrypted recovery file', { exact: true })
      .first()
      .setInputFiles({
        name: 'recovery.json',
        mimeType: 'application/json',
        buffer: Buffer.from(journal.recoveryFile),
      });
    await page
      .getByLabel('Separate recovery code', { exact: true })
      .last()
      .fill(journal.recoveryCode);
    await page.getByRole('button', { name: 'Verify and restore key', exact: true }).first().click();
    await page.getByRole('button', { name: 'Create room on chain', exact: true }).waitFor();
    const resultPromise = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/curator/rooms') && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Create room on chain', exact: true }).click();
    const response = await resultPromise;
    assert.equal(response.status(), 202);
    journal.room = (await response.json()).id;
    await save();
  }
  phase = 'room-select';
  await page.getByRole('button', { name: 'The room', exact: true }).click();
  await page.getByLabel('Choose room', { exact: true }).selectOption(journal.room);
  phase = 'room-open';
  await page.getByText('open', { exact: true }).waitFor({ timeout: 90000 });
  checks.chainRoomCreatedAndVerified = true;
  if (!journal.submission) {
    phase = 'seal';
    await page.getByRole('button', { name: 'Open submission desk', exact: true }).click();
    await page
      .getByLabel('Your private story', { exact: true })
      .fill('The clock rang thirteen times. Nobody lived upstairs.');
    // Independent payout recipient is the local receipt-wallet identity; reward signer is receiver.
    // Obtain address from the native SDK account listing through existing scoped local credential.
    const settings = JSON.parse(await readFile('/private/app-wallet-settings.json', 'utf8'));
    const response = await fetch(settings.receipt.rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${(await readFile(settings.receipt.tokenFile, 'utf8')).trim()}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'accounts.list',
        params: { offset: 0, limit: 100 },
      }),
    });
    const accounts = (await response.json()).result.accounts;
    const recipient = accounts.find(
      (row) => row.account.component_address === settings.receipt.account,
    ).address;
    await page.getByLabel('Same-network payout address, optional', { exact: true }).fill(recipient);
    const uploaded = page.waitForResponse(
      (response) => /\/envelopes$/.test(response.url()) && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Encrypt and seal submission', exact: true }).click();
    const result = await uploaded;
    assert.equal(result.status(), 202);
    journal.submission = (await result.json()).submissionId;
    await save();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save private envelope', exact: true }).click();
    const downloaded = await downloadPromise;
    journal.savedEnvelope = JSON.parse(await readFile(await downloaded.path(), 'utf8'));
    await save();
    checks.browserEncryptedSubmission = true;
    assert(submittedBodies.length === 1);
    assert(!JSON.stringify(submittedBodies).includes('clock rang'));
    assert(!JSON.stringify(submittedBodies).includes(recipient));
    assert(
      Object.keys(submittedBodies[0]).every((key) =>
        ['submissionId', 'envelope', 'digest', 'challenge', 'lookupCapability'].includes(key),
      ),
    );
    checks.requestContainsOnlyCiphertextAndPublicContext = true;
  }
  phase = 'receipt';
  await page.getByRole('button', { name: 'Your receipt', exact: true }).click();
  if (journal.savedEnvelope) {
    await page.getByLabel('Restore a private envelope file', { exact: true }).setInputFiles({
      name: 'envelope.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(journal.savedEnvelope)),
    });
    await page.getByRole('button', { name: 'Check receipt', exact: true }).click();
  }
  await page
    .getByRole('button', { name: 'Download inclusion receipt', exact: true })
    .waitFor({ timeout: 90000 });
  checks.chainReceiptConfirmed = true;
  await page.reload();
  await page.getByRole('button', { name: 'Your receipt', exact: true }).click();
  await page.getByRole('button', { name: 'Check receipt', exact: true }).click();
  await page.getByRole('button', { name: 'Download inclusion receipt', exact: true }).waitFor();
  checks.reloadRecoversEncryptedSubmission = true;
  const recoveredUpload = page.waitForResponse(
    (response) => /\/envelopes$/.test(response.url()) && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Retry saved upload', exact: true }).click();
  assert.equal((await recoveredUpload).status(), 202);
  assert(submittedBodies.length > 0);
  assert(
    submittedBodies.every((body) =>
      Object.keys(body).every((key) =>
        ['submissionId', 'envelope', 'digest', 'challenge', 'lookupCapability'].includes(key),
      ),
    ),
  );
  assert(
    submittedBodies.every(
      (body) =>
        body.envelope === journal.savedEnvelope.envelope &&
        !JSON.stringify(body).includes('The clock rang'),
    ),
  );
  checks.browserEncryptedSubmission = true;
  checks.requestContainsOnlyCiphertextAndPublicContext = true;
  checks.exactUploadRetryIsIdempotent = true;
  phase = 'open';
  await page.getByRole('button', { name: 'Curator', exact: true }).click();
  await page.getByLabel('Choose room', { exact: true }).selectOption(journal.room);
  await page.getByRole('button', { name: 'Load encrypted inbox', exact: true }).click();
  if (
    !(await page.getByRole('button', { name: 'Open envelope', exact: true }).first().isEnabled())
  ) {
    await page.getByLabel('Encrypted recovery file', { exact: true }).setInputFiles({
      name: 'recovery.json',
      mimeType: 'application/json',
      buffer: Buffer.from(journal.recoveryFile),
    });
    await page.getByLabel('Separate recovery code', { exact: true }).fill(journal.recoveryCode);
    await page.getByRole('button', { name: 'Verify and restore key', exact: true }).click();
    checks.cleanBrowserKeyRecovery = true;
  }
  await page.getByRole('button', { name: 'Open envelope', exact: true }).first().click();
  await page
    .getByText('The clock rang thirteen times. Nobody lived upstairs.', { exact: true })
    .waitFor();
  checks.browserOnlyDecryption = true;
  phase = 'quote';
  if (!journal.reward) {
    await page.getByLabel('Amount in tTARI', { exact: true }).fill('1');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Get private reward quote', exact: true }).click();
    await page
      .getByRole('button', { name: 'Confirm this private testnet reward', exact: true })
      .waitFor();
    const confirmed = page.waitForResponse((response) => /\/confirm$/.test(response.url()));
    await page
      .getByRole('button', { name: 'Confirm this private testnet reward', exact: true })
      .click();
    const response = await confirmed;
    assert.equal(response.status(), 202);
    journal.reward = (await response.json()).rewardId;
    await save();
  }
  for (let attempt = 0; attempt < 30; attempt++) {
    await page.getByRole('button', { name: 'Check reward status', exact: true }).click();
    if (await page.getByText('confirmed', { exact: true }).isVisible()) break;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  await page.getByText('confirmed', { exact: true }).waitFor();
  checks.nativePrivateRewardConfirmed = true;
  phase = 'receiver-scan';
  let received = false;
  for (let attempt = 0; attempt < 20; attempt++) {
    await nativeRead('receipt', 'accounts.get_balances', {
      account: walletSettings.receipt.account,
      refresh: true,
    });
    const outputs = await nativeRead('receipt', 'stealth_utxos.list', {
      resource_address: `resource_${'01'.repeat(32)}`,
      account_address: walletSettings.receipt.account,
      filter_by_status: null,
    });
    if (
      outputs.utxos.some(
        (output) =>
          output.memo?.Message === 'A candle for your story — Hauntbox' &&
          output.value === '1000000' &&
          output.is_on_chain &&
          ['Unspent', 'Spent'].includes(output.status),
      )
    ) {
      received = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  assert(received);
  checks.independentRecipientScannedAmountAndMemo = true;
  checks.newSubmittedTransactions = (await transactionCount()) - baselineCount;
  journal.checks = checks;
  await save();
  await writeFile(
    'docs/evidence/m2/local-app-journey.json',
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        network: 'localnet',
        status: 'PASSED_REAL_LOCAL_APPLICATION_JOURNEY',
        checks,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(JSON.stringify({ status: 'REAL_LOCAL_APPLICATION_JOURNEY_PASSED', checks }));
} catch (error) {
  console.log(
    JSON.stringify({
      status: 'REAL_LOCAL_APPLICATION_JOURNEY_FAILED',
      phase,
      code: error.safeCode ?? error.code ?? error.name,
    }),
  );
  process.exitCode = 1;
} finally {
  await browser.close();
}
