import { chromium, firefox, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import assert from "node:assert/strict";
import { writeFile, mkdir } from "node:fs/promises";
import { confirmRecoveryWord, enterWalletCredential } from "./gui-helpers.mjs";
const origin = process.env.PIN_ORIGIN ?? 'http://localhost:8283';
assert.ok(origin, "PIN_ORIGIN is required");
const reports = [];
async function openSettings(page) {
  if (!(await page.locator("#wallet-settings").evaluate((el) => el.open)))
    await page.locator("#wallet-settings summary").click();
}
for (const [engine, type] of Object.entries({ chromium, firefox })) {
  const browser = await type.launch();
  try {
    const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
      }),
      page = await context.newPage(),
      sent = [];
    if (origin === 'http://localhost:8283') await context.route('http://localhost:8283/**', async route => {
      const headers = await route.request().allHeaders(); headers.host = 'localhost:8283';
      await route.fulfill({response:await route.fetch({url:route.request().url().replace('http://localhost:8283','http://board-privacy:8280'),headers})});
    });
    await context.route("**/api/browser-submit", (r) => r.abort());
    await context.route("**/api/faucet-submit", (r) => r.abort());
    page.on("request", (r) => {
      if (r.postData()) sent.push(r.postData());
    });
    // Keep both test tabs unlocked to isolate the wallet-change notification.
    // Production visibility locking remains enabled and is tested separately.
    await context.addInitScript(() =>
      document.addEventListener(
        "visibilitychange",
        (e) => e.stopImmediatePropagation(),
        true,
      ),
    );
    await page.goto(origin);
    await page.waitForFunction(() => document.body.dataset.ready === "true");
    await page.locator("#browser-wallet-button").click();
    await page.locator("#wallet-create-choice").click();
    await mkdir('hauntboard/evidence',{recursive:true});
    await page.locator('#browser-wallet-dialog').screenshot({path:`hauntboard/evidence/wallet-pin-keypad-${engine}.png`});
    await page.locator("#wallet-password").fill("12345");
    await page.locator("#wallet-pin-confirm").fill("12345");
    await page.locator("#wallet-create").click();
    assert.equal(
      await page.evaluate(async () =>
        (await import("/browser-wallet.mjs")).exists(),
      ),
      false,
    );
    await page.locator("#wallet-password").focus();
    await page.locator('[data-pin-key="clear"]').click();
    for (const digit of "604281")
      await page.locator(`[data-pin-key="${digit}"]`).click();
    await expect(page.locator("#wallet-password")).toHaveValue("604281");
    await page.locator('[data-pin-key="backspace"]').click();
    await expect(page.locator("#wallet-password")).toHaveValue("60428");
    await page.locator('[data-pin-key="1"]').click();
    await page.locator("#wallet-pin-confirm").fill("999999");
    await page.locator("#wallet-create").click();
    assert.equal(
      await page.evaluate(async () =>
        (await import("/browser-wallet.mjs")).exists(),
      ),
      false,
    );
    await page.locator("#wallet-pin-confirm").focus();
    await page.locator('[data-pin-key="clear"]').click();
    for (const digit of "604281")
      await page.locator(`[data-pin-key="${digit}"]`).click();
    const audit = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    assert.deepEqual(
      audit.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          summary: n.failureSummary,
        })),
      })),
      [],
    );
    assert.ok(
      await page
        .locator("#browser-wallet-dialog")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    );
    await page.locator("#wallet-create").click();
    await expect(page.locator("#wallet-seed-words li")).toHaveCount(24, {
      timeout: 60000,
    });
    const phrase = (
      await page.locator("#wallet-seed-words li").allTextContents()
    ).join(" ");
    const original = await page.evaluate(
      async () => (await import("/browser-wallet.mjs")).active().address,
    );
    await confirmRecoveryWord(page);
    await page.locator("#wallet-seed-saved").check();
    await page.locator("#wallet-confirm-seed").click();
    await expect(page.locator("#wallet-seed-panel")).toBeHidden();
    assert.equal(
      await page.evaluate(async () =>
        (await import("/browser-wallet.mjs")).unlockMethod(),
      ),
      "pin",
    );
    await page.locator("#wallet-lock").click();
    await enterWalletCredential(page, "999999");
    await page.locator("#wallet-unlock").click();
    await expect(page.locator("#wallet-message")).toContainText(
      "Could not unlock",
    );
    await page.locator("#wallet-password").fill("");
    await page.locator("#wallet-password").focus();
    for (const digit of "604281") await page.keyboard.press(`Numpad${digit}`);
    await expect(page.locator("#wallet-password")).toHaveValue("604281");
    await page.keyboard.press("Enter");
    await expect(page.locator("#wallet-ready-panel")).toBeVisible({
      timeout: 30000,
    });
    const other = await context.newPage();
    await other.goto(origin);
    await other.waitForFunction(() => document.body.dataset.ready === "true");
    await other.evaluate(async () => {
      await (await import("/browser-wallet.mjs")).unlock("604281");
    });
    await openSettings(page);
    await page.locator("#wallet-change-pin").click();
    await enterWalletCredential(page, "730194");
    await page.locator("#wallet-save-pin").click();
    await expect(page.locator("#wallet-message")).toContainText("PIN saved");
    await expect
      .poll(() =>
        other.evaluate(async () =>
          (await import("/browser-wallet.mjs")).active(),
        ),
      )
      .toBeNull();
    assert.equal(
      await page.evaluate(async () => {
        const w = await import("/browser-wallet.mjs");
        w.lock();
        try {
          await w.unlock("604281");
          return false;
        } catch {
          return true;
        }
      }),
      true,
    );
    await page.evaluate(async () => {
      await (await import("/browser-wallet.mjs")).unlock("730194");
    });
    // Build an older password record without exposing its keys or phrase in evidence.
    await page.evaluate(async () => {
      const w = await import("/browser-wallet.mjs"),
        backup = await w.backup("synthetic legacy device password");
      await w.deleteWallet();
      await w.restore(backup, "synthetic legacy device password");
    });
    assert.equal(
      await page.evaluate(async () =>
        (await import("/browser-wallet.mjs")).unlockMethod(),
      ),
      "password",
    );
    await page.reload();
    await page.waitForFunction(() => document.body.dataset.ready === "true");
    await page.locator("#browser-wallet-button").click();
    await expect(page.locator("#wallet-password-label")).toHaveText(
      "Original device password",
      { timeout: 10000 },
    );
    await expect(page.locator("#wallet-keypad")).toBeHidden();
    await enterWalletCredential(page, "synthetic legacy device password");
    await expect(page.locator("#wallet-password")).toHaveValue("synthetic legacy device password");
    assert.equal(await page.locator("#wallet-password").evaluate(el=>el.checkValidity()),true);
    await page.locator("#wallet-unlock").click();
    await expect(page.locator("#wallet-ready-panel")).toBeVisible({timeout:30000});
    await openSettings(page);
    await page.locator("#wallet-change-pin").click();
    await enterWalletCredential(page, "730194");
    await page.locator("#wallet-save-pin").click();
    await expect(page.locator("#wallet-message")).toContainText("PIN saved");
    assert.equal(
      await page.evaluate(
        async () => (await import("/browser-wallet.mjs")).active().address,
      ),
      original,
    );
    await openSettings(page);
    await page.locator("#wallet-delete-choice").click();
    await expect(page.locator("#wallet-delete-confirm")).toBeDisabled();
    await page.locator("#wallet-delete-cancel").click();
    await expect(page.locator("#wallet-ready-panel")).toBeVisible();
    assert.equal(
      await page.evaluate(
        async () => (await import("/browser-wallet.mjs")).active().address,
      ),
      original,
    );
    assert.equal(
      await page.evaluate(async () => {
        const w = await import("/browser-wallet.mjs");
        localStorage.setItem(
          "hauntboard-pending",
          '{"operation":"pending-fixture"}',
        );
        try {
          await w.deleteWallet();
          return false;
        } catch {
          return await w.exists();
        } finally {
          localStorage.removeItem("hauntboard-pending");
        }
      }),
      true,
    );
    assert.equal(
      await page.evaluate(async () => {
        const w = await import("/browser-wallet.mjs"),
          config = await (await fetch("/api/config")).json(),
          n = await import("/network-profile.mjs"),
          key = `hauntboard-private-post:${n.networkKey(config)}:fixture`;
        localStorage.setItem(key, "{}");
        try {
          await w.deleteWallet();
          return false;
        } catch {
          return await w.exists();
        } finally {
          localStorage.removeItem(key);
        }
      }),
      true,
    );
    await other.evaluate(async () => {
      await (await import("/browser-wallet.mjs")).unlock("730194");
    });
    await page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const request = indexedDB.open("hauntboard-browser-wallet-v1", 1);
          request.onsuccess = () => {
            const db = request.result,
              tx = db.transaction("wallet", "readwrite");
            tx.objectStore("wallet").put(
              { marker: "other-network" },
              "other-network",
            );
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
          };
        }),
    );
    await page.locator("#wallet-delete-choice").click();
    await page.locator("#wallet-delete-ack").check();
    await page.locator("#wallet-delete-confirm").click();
    await expect(page.locator("#wallet-create-choice")).toBeVisible();
    assert.equal(
      await page.evaluate(async () =>
        (await import("/browser-wallet.mjs")).exists(),
      ),
      false,
    );
    await expect
      .poll(() =>
        other.evaluate(async () =>
          (await import("/browser-wallet.mjs")).active(),
        ),
      )
      .toBeNull();
    assert.equal(
      await page.evaluate(
        () =>
          new Promise((resolve) => {
            const request = indexedDB.open("hauntboard-browser-wallet-v1", 1);
            request.onsuccess = () => {
              const db = request.result,
                read = db
                  .transaction("wallet")
                  .objectStore("wallet")
                  .get("other-network");
              read.onsuccess = () => {
                db.close();
                resolve(read.result?.marker);
              };
            };
          }),
      ),
      "other-network",
    );
    await page.locator("#wallet-create-choice").click();
    await enterWalletCredential(page, "604281");
    await page.locator("#wallet-create").click();
    await expect(page.locator("#wallet-seed-words li")).toHaveCount(24, {
      timeout: 60000,
    });
    assert.notEqual(
      await page.evaluate(
        async () => (await import("/browser-wallet.mjs")).active().address,
      ),
      original,
    );
    await page.evaluate(async () => {
      await (await import("/browser-wallet.mjs")).deleteWallet();
    });
    await page.reload();
    await page.waitForFunction(() => document.body.dataset.ready === "true");
    await page.locator("#browser-wallet-button").click();
    await page.locator("#wallet-recover-choice").click();
    await page.locator("#wallet-recovery-input").fill(phrase);
    await enterWalletCredential(page, "730194");
    await page.locator("#wallet-expected-address").fill(original);
    await page.locator("#wallet-restore").click();
    await expect(page.locator("#wallet-ready-panel")).toBeVisible({
      timeout: 60000,
    });
    assert.equal(
      await page.evaluate(
        async () => (await import("/browser-wallet.mjs")).active().address,
      ),
      original,
    );
    assert.ok(
      !sent.some(
        (body) =>
          body.includes(phrase) ||
          body.includes("604281") ||
          body.includes("730194"),
      ),
    );
    await page.locator('[data-close="browser-wallet-dialog"]').click();
    await expect(page.locator("#wallet-password")).toHaveValue("");
    await expect(page.locator("#wallet-pin-confirm")).toHaveValue("");
    reports.push({
      engine,
      origin,
      checkedAt: new Date().toISOString(),
      status: "WALLET_PIN_RESET_PASSED",
      checks: {
        sixDigitsRequired: true,
        confirmationRequired: true,
        keypadEditing: true,
        hardwareNumpadAndEnter: true,
        wrongPinRejected: true,
        pinChangeKeepsWallet: true,
        legacyPasswordMigration: true,
        pendingDeletionBlocked: true,
        cancelKeepsWallet: true,
        otherNetworkPreserved: true,
        otherTabsLock: true,
        newWalletHasNewAddress: true,
        deletedWalletRecoverableWithPhrase: true,
        secretsNotSent: true,
        axeViolations: 0,
      },
    });
  } finally {
    await browser.close();
  }
}
await mkdir("hauntboard/evidence", { recursive: true });
await writeFile(
  "hauntboard/evidence/wallet-pin-reset.json",
  JSON.stringify(reports, null, 2) + "\n",
);
console.log(JSON.stringify(reports));
