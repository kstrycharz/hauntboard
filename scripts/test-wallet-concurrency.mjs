// Browser-only secrets stay inside ephemeral contexts; evidence contains booleans only.
import { chromium, firefox } from '@playwright/test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

const origin = 'http://localhost:5173';
async function visit(context) {
  const page = await context.newPage();
  await page.route(`${origin}/**`, async (route) => {
    const response = await route.fetch({
      url: route.request().url().replace(origin, 'http://web:5173'),
    });
    await route.fulfill({ response });
  });
  await page.goto(`${origin}/account`);
  await page.getByRole('button', { name: 'Create wallet', exact: true }).waitFor();
  return page;
}
async function prepare(page) {
  await page.evaluate(async () => {
    window.wallet = await import('/src/participant-wallet.ts');
    window.vault = await import('/src/browser-vault.ts');
    window.recovery = await window.wallet.generateWallet('localnet');
  });
}
async function save(page, restoring = false, pin = '12345678') {
  return page.evaluate(
    async ({ restoring, pin }) => {
      try {
        await window.wallet.saveWallet(window.recovery, pin, 'localnet', restoring);
        return 'OK';
      } catch (e) {
        return e.message;
      }
    },
    { restoring, pin },
  );
}
async function unlock(page, pin) {
  return page.evaluate(async (pin) => {
    try {
      await window.wallet.unlockWallet(pin, 'localnet');
      return 'OK';
    } catch (e) {
      return e.message;
    }
  }, pin);
}
const checks = {};
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
]) {
  const browser = await engine.launch();
  try {
    const context = await browser.newContext();
    const a = await visit(context),
      b = await visit(context);
    await Promise.all([prepare(a), prepare(b)]);
    const outcomes = await Promise.all([save(a), save(b)]);
    assert.deepEqual([...outcomes].sort(), ['OK', 'WALLET_EXISTS']);
    const winner = outcomes[0] === 'OK' ? a : b,
      loser = winner === a ? b : a;
    assert.ok(
      await winner.evaluate(
        async () =>
          (await window.wallet.walletInfo('localnet')).address === window.recovery.address,
      ),
    );
    assert.equal(await save(loser, true), 'WALLET_CONFLICT');
    await loser.getByRole('button', { name: 'Sign in with PIN', exact: true }).waitFor();
    // Five parallel attempts across tabs must persist all five failures.
    assert.deepEqual(
      await Promise.all(Array.from({ length: 5 }, (_, i) => unlock(i % 2 ? a : b, '87654321'))),
      Array(5).fill('WALLET_PIN_INCORRECT'),
    );
    assert.ok(
      await winner.evaluate(async () => {
        const s = await window.vault.vaultGet('participant-wallet:v1:localnet');
        return s.failures === 5 && s.lockedUntil > Date.now();
      }),
    );
    assert.equal(await unlock(loser, '12345678'), 'WALLET_LOCKED');
    // Recovery/PIN rotation and an old unlock compete for the same cross-tab lock.
    assert.equal(await save(winner, true), 'OK');
    const rotation = save(winner, true, '23456789');
    const oldUnlock = unlock(loser, '12345678');
    assert.equal(await rotation, 'OK');
    assert.ok(['OK', 'WALLET_PIN_INCORRECT'].includes(await oldUnlock));
    assert.equal(await unlock(winner, '23456789'), 'OK');
    assert.equal(await unlock(loser, '12345678'), 'WALLET_PIN_INCORRECT');
    // Synchronous IndexedDB put failure must reject, retain ciphertext and not count PIN failure.
    assert.equal(
      await winner.evaluate(async () => {
        const original = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = () => {
          throw new DOMException('injected', 'QuotaExceededError');
        };
        try {
          await window.wallet.unlockWallet('23456789', 'localnet');
          return 'OK';
        } catch (e) {
          return e.message;
        } finally {
          IDBObjectStore.prototype.put = original;
        }
      }),
      'BROWSER_STORAGE_UNAVAILABLE',
    );
    assert.equal(
      await winner.evaluate(
        async () => (await window.vault.vaultGet('participant-wallet:v1:localnet')).failures,
      ),
      1,
    );
    assert.equal(await unlock(winner, '23456789'), 'OK');
    // A fresh tab has not loaded the dynamic SDK. Block its module with a valid PIN.
    const unavailable = await visit(context);
    await unavailable.route(/ootle.*wasm/, (route) => route.abort());
    assert.equal(
      await unavailable.evaluate(async () => {
        const wallet = await import('/src/participant-wallet.ts');
        try {
          await wallet.unlockWallet('23456789', 'localnet');
          return 'OK';
        } catch (e) {
          return e.message;
        }
      }),
      'WALLET_SDK_UNAVAILABLE',
    );
    assert.equal(
      await winner.evaluate(
        async () => (await window.vault.vaultGet('participant-wallet:v1:localnet')).failures,
      ),
      0,
    );
    // Corrupt the outer device ciphertext; this is a recovery error, not a bad PIN.
    await winner.evaluate(async () => {
      const s = await window.vault.vaultGet('participant-wallet:v1:localnet');
      new Uint8Array(s.encrypted)[0] ^= 1;
      await window.vault.vaultPut('participant-wallet:v1:localnet', s);
    });
    assert.equal(await unlock(winner, '23456789'), 'WALLET_DATA_INVALID');
    assert.equal(
      await winner.evaluate(
        async () => (await window.vault.vaultGet('participant-wallet:v1:localnet')).failures,
      ),
      0,
    );
    checks[name] = {
      oneCreationWinner: true,
      staleRecoveryPreservesWallet: true,
      otherTabRefreshes: true,
      concurrentFailuresCounted: true,
      recoveryKeepsNewPin: true,
      storageFailureNotPinFailure: true,
      sdkFailureNotPinFailure: true,
      corruptionRequiresRecovery: true,
    };
  } finally {
    await browser.close();
  }
}
const evidence = {
  checkedAt: new Date().toISOString(),
  status: 'PASSED_WALLET_CONCURRENCY',
  checks,
  scope: 'Isolated browser contexts; no chain transactions or faucet claims.',
};
await writeFile(
  'docs/evidence/m2/wallet-concurrency.json',
  JSON.stringify(evidence, null, 2) + '\n',
);
console.log(JSON.stringify(evidence));
