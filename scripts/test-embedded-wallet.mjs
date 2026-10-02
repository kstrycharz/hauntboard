// Isolated browser CI only: all seed material remains in private container storage.
import { chromium, firefox } from '@playwright/test';
import assert from 'node:assert/strict';
import { randomInt } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { writePrivateJson } from './lib/private-json.mjs';
import { localNetworkWitness } from './lib/local-network-witness.mjs';
const production = process.env.WALLET_BROWSER_TARGET === 'production';
// Production browser-only checks do not depend on a running local validator/indexer.
if (!production) await localNetworkWitness();
const network = production ? 'esmeralda' : 'localnet';
const origin = production ? 'http://localhost:8180' : 'http://localhost:5173';
const target = production ? 'http://hauntbox-production-web-1:8080' : 'http://web:5173';
async function stored(page) {
  return page.evaluate(
    async (network) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('hauntbox-browser-vault', 1);
        open.onerror = () => reject(new Error('STORAGE_UNAVAILABLE'));
        open.onsuccess = () => {
          const db = open.result;
          const read = db
            .transaction('private', 'readonly')
            .objectStore('private')
            .get(`participant-wallet:v1:${network}`);
          read.onsuccess = () => {
            const saved = read.result;
            resolve({
              address: saved.address,
              noPlaintextRecovery: !JSON.stringify(saved).includes('Phrase'),
              deviceKeyNotExportable: !saved.deviceKey.extractable,
              encryptedBytes: saved.encrypted.byteLength,
            });
            db.close();
          };
        };
      }),
    network,
  );
}
const checks = {},
  fixtures = {};
let browser,
  activePage,
  phase = 'start';
async function visit(page) {
  await page.route(`${origin}/**`, async (route) => {
    const response = await route.fetch({
      url: route.request().url().replace(origin, target),
    });
    await route.fulfill({ response });
  });
  await page.goto(`${origin}/account`);
  await page.getByRole('button', { name: 'Create wallet', exact: true }).waitFor();
}
async function enterPin(page, pin, confirm = false) {
  await page.getByLabel(confirm ? 'Confirm wallet PIN' : 'Wallet PIN', { exact: true }).fill(pin);
}
try {
  for (const [name, engine] of [
    ['chromium', chromium],
    ['firefox', firefox],
  ]) {
    phase = `${name}_create`;
    browser = await engine.launch();
    const context = await browser.newContext(),
      page = await context.newPage();
    activePage = page;
    page.setDefaultTimeout(8000);
    const requests = [];
    page.on('request', (request) => {
      if (request.method() === 'POST') requests.push(request.postData() ?? '');
    });
    await visit(page);
    phase = `${name}_dialog`;
    await page.getByRole('button', { name: 'Create wallet', exact: true }).click();
    await page.getByRole('dialog').waitFor();
    const pin = String(randomInt(10000000, 100000000));
    assert.ok(
      await page
        .getByLabel('Wallet PIN', { exact: true })
        .evaluate((input) => input === document.activeElement),
    );
    await page.keyboard.type(pin);
    assert.equal(await page.getByLabel('Wallet PIN', { exact: true }).inputValue(), pin);
    await page.keyboard.press('Backspace');
    assert.equal(
      await page.getByLabel('Wallet PIN', { exact: true }).inputValue(),
      pin.slice(0, -1),
    );
    await page.getByRole('button', { name: 'PIN digit ' + pin.at(-1), exact: true }).click();
    await page.keyboard.type('a');
    assert.equal(await page.getByLabel('Wallet PIN', { exact: true }).inputValue(), pin);
    await page.getByRole('button', { name: 'Clear PIN', exact: true }).click();
    for (const digit of pin)
      await page.getByRole('button', { name: `PIN digit ${digit}`, exact: true }).click();
    await page.keyboard.press('Enter');
    await page.getByLabel('Confirm wallet PIN', { exact: true }).waitFor();
    assert.ok(
      await page
        .getByLabel('Confirm wallet PIN', { exact: true })
        .evaluate((input) => input === document.activeElement),
    );
    await page.getByRole('button', { name: `PIN digit ${pin[0]}`, exact: true }).click();
    await page.keyboard.type(pin.slice(1));
    await page.keyboard.press('Enter');
    phase = `${name}_recovery_display`;
    const owner = await page
      .getByLabel('Spending-key recovery phrase', { exact: true })
      .inputValue();
    const view = await page.getByLabel('View-key recovery phrase', { exact: true }).inputValue();
    assert.equal(owner.split(' ').length, 24);
    assert.equal(view.split(' ').length, 24);
    fixtures[name] = { pin, ownerPhrase: owner, viewPhrase: view };
    await writePrivateJson('/private/embedded-wallet-ui.json', fixtures);
    await page
      .getByLabel('First word of spending-key phrase', { exact: true })
      .fill(owner.split(' ')[0]);
    await page
      .getByLabel('First word of view-key phrase', { exact: true })
      .fill(view.split(' ')[0]);
    await page
      .getByRole('button', { name: 'I saved both phrases — finish setup', exact: true })
      .click();
    phase = `${name}_persist`;
    await page.getByRole('button', { name: 'Lock wallet', exact: true }).waitFor();
    const encryptedOnly = await stored(page);
    const address = encryptedOnly.address;
    assert.ok(address.startsWith(production ? 'otl_esm_1' : 'otl_loc_1'));
    assert.equal(requests.length, 0);
    assert.ok(
      encryptedOnly.noPlaintextRecovery &&
        encryptedOnly.deviceKeyNotExportable &&
        encryptedOnly.encryptedBytes > 64,
    );
    phase = `${name}_unlock_reload`;
    await page.reload();
    await page.getByRole('button', { name: 'Sign in with PIN', exact: true }).click();
    await enterPin(page, pin);
    await page.getByRole('button', { name: 'Unlock wallet', exact: true }).click();
    await page.getByRole('button', { name: 'Lock wallet', exact: true }).waitFor();
    assert.equal(await page.getByLabel('Spending-key recovery phrase', { exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Lock wallet', exact: true }).click();
    await page.getByRole('button', { name: 'Sign in with PIN', exact: true }).click();
    phase = `${name}_lockout`;
    const wrongPin = pin === '10000000' ? '10000001' : '10000000';
    for (let attempt = 0; attempt < 5; attempt++) {
      await enterPin(page, wrongPin);
      await page.getByRole('button', { name: 'Unlock wallet', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: 'Incorrect PIN' }).waitFor();
    }
    await page.reload();
    await page.getByRole('button', { name: 'Sign in with PIN', exact: true }).click();
    await enterPin(page, pin);
    await page.getByRole('button', { name: 'Unlock wallet', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'locked for 15 minutes' }).waitFor();
    await page.getByRole('button', { name: 'Close wallet dialog', exact: true }).click();
    // Restore into a clean browser with a new PIN; never reuse an old device key.
    phase = `${name}_recover`;
    const restoredContext = await browser.newContext(),
      restored = await restoredContext.newPage();
    await visit(restored);
    await restored.getByRole('button', { name: 'Recover wallet', exact: true }).click();
    await restored.getByLabel('Spending-key recovery phrase', { exact: true }).fill(owner);
    await restored.getByLabel('View-key recovery phrase', { exact: true }).fill(view);
    const newPin = String(randomInt(10000000, 100000000));
    await enterPin(restored, newPin);
    await restored.getByRole('button', { name: 'Continue', exact: true }).click();
    await enterPin(restored, newPin, true);
    await restored.getByRole('button', { name: 'Restore wallet', exact: true }).click();
    await restored.getByRole('button', { name: 'Lock wallet', exact: true }).waitFor();
    const restoredAddress = (await stored(restored)).address;
    assert.equal(restoredAddress, address);
    const negative = production
      ? { invalidPhrase: true, mainnetBlocked: true }
      : await restored.evaluate(async () => {
          const wallet = await import('/src/participant-wallet.ts');
          let invalidPhrase = false,
            mainnetBlocked = false;
          try {
            await wallet.recoverWallet('invalid', 'invalid', 'localnet');
          } catch {
            invalidPhrase = true;
          }
          try {
            await wallet.generateWallet('mainnet');
          } catch {
            mainnetBlocked = true;
          }
          return { invalidPhrase, mainnetBlocked };
        });
    assert.ok(negative.invalidPhrase && negative.mainnetBlocked);
    await restored.getByRole('button', { name: 'Use my wallet for rewards', exact: true }).click();
    assert.equal(
      await restored
        .getByLabel('Same-network payout address, optional', { exact: true })
        .inputValue(),
      address,
    );
    checks[name] = {
      nativeWalletGenerated: true,
      keypadAndDialog: true,
      keyboardTypingAndAutoFocus: true,
      mixedKeyboardAndKeypad: true,
      backspaceAndNonDigits: true,
      enterAdvancesPinSteps: true,
      recoveryShownOnce: true,
      localEncryptedStorage: true,
      noPinOrSeedRequests: true,
      pinUnlockAfterReload: true,
      durableLockout: true,
      cleanBrowserRecoverySameAddress: true,
      submissionUsesGeneratedAddress: true,
      ...(production ? {} : { invalidPhraseRejected: true, mainnetBlocked: true }),
    };
    await browser.close();
    browser = null;
  }
  const result = {
    checkedAt: new Date().toISOString(),
    status: 'PASSED_EMBEDDED_TESTNET_WALLET',
    network,
    productionBuild: production,
    checks,
    scope:
      'Browser wallet generation/unlock/key recovery only. No faucet, chain submission, deposits, balance scan or spending.',
  };
  await writeFile(
    production
      ? 'docs/evidence/m2/embedded-wallet-production.json'
      : 'docs/evidence/m2/embedded-wallet.json',
    JSON.stringify(result, null, 2) + '\n',
  );
  console.log(JSON.stringify(result));
} catch (error) {
  const diagnosis = await activePage?.evaluate(async () => {
    try {
      await (await import('/src/participant-wallet.ts')).generateWallet('localnet');
      return { generation: true };
    } catch (e) {
      return {
        type: e.name,
        wasm: /WebAssembly|wasm/.test(e.message),
        fetch: /fetch|404|module/.test(e.message),
        stack: e.stack?.split('\n').slice(1, 4),
      };
    }
  });
  const alerts = await activePage?.getByRole('alert').allTextContents();
  const ui = await activePage?.evaluate(() =>
    Array.from(document.querySelectorAll('h2,dialog button')).map((e) => e.textContent),
  );
  console.log(
    JSON.stringify({
      status: 'EMBEDDED_WALLET_FAILED',
      phase,
      errorType: error.constructor.name,
      diagnosis,
      ui,
      alerts,
    }),
  );
  process.exitCode = 1;
} finally {
  await browser?.close();
}
