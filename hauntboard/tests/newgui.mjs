// Actual frontend, Tari key derivation and encrypted browser storage; simulated
// read-only provider. No chain submissions, faucet requests, or public funds.
import { chromium, firefox, webkit, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { enterWalletCredential, confirmRecoveryWord } from "./gui-helpers.mjs";

const root = fileURLToPath(new URL("../web/", import.meta.url));
const origin = "http://localhost:8797";
const board = `component_${"a".repeat(64)}`;
let writes = 0;
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, origin).pathname;
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "GET") { writes++; res.writeHead(403); res.end('{}'); return; }
    if (path.startsWith("/api/")) {
      res.setHeader("Content-Type", "application/json");
      if (path === "/api/config") res.end(JSON.stringify({ board, network: "localnet", networkByte: 16, resetIdentity: "newgui-fixture", profile: "local", posterPrivacy: false, label: "Isolated UI fixture", provider: "Simulated read-only provider", csrf: "fixture", faucetEnabled: false }));
      else if (path === "/api/board") res.end(JSON.stringify({ address: board, version: 1, threads: [] }));
      else { res.writeHead(503); res.end(JSON.stringify({ error: "Provider unavailable in isolated UI fixture" })); }
      return;
    }
    const name = path === "/" ? "index.html" : path === "/about" ? "about.html" : path === "/forums" ? "forums.html" : path.slice(1);
    if (!/^(?:[a-z0-9-]+\.(?:html|css|mjs|wasm)|vendor\/[a-z0-9_-]+\.(?:mjs|wasm))$/.test(name)) { res.writeHead(404); res.end(); return; }
    res.setHeader("Content-Type", name.endsWith(".wasm") ? "application/wasm" : name.endsWith(".css") ? "text/css" : name.endsWith(".html") ? "text/html" : "text/javascript");
    res.end(await readFile(root + name));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((resolve) => server.listen(8797, "0.0.0.0", resolve));
const report = { scope: "Actual local wallet cryptography/storage; simulated provider; zero chain writes", checkedAt: new Date().toISOString(), browsers: {}, limitations: ["Physical iPhone Safari, VoiceOver, and observed human usability tasks require device/human verification."] };
await mkdir("hauntboard/evidence", { recursive: true });
const engines = process.env.NEWGUI_WEBKIT === "true" ? { chromium, firefox, webkit } : { chromium, firefox };
try {
  for (const [engine, type] of Object.entries(engines)) {
    const browser = await type.launch();
    let stage = "start";
    try {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      // Separate tabs remain visible for intentional cross-tab checks.
      await context.addInitScript(() => document.addEventListener("visibilitychange", (e) => e.stopImmediatePropagation(), true));
      const page = await context.newPage();
      const errors = [], requests = [];
      page.on("pageerror", (error) => errors.push(error.name));
      page.on("request", (request) => requests.push(request.postData() ?? ""));
      const checks = [];
      const ready = async () => expect(page.locator("body")).toHaveAttribute("data-ready", "true");
      const audit = async () => {
        const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
        assert.deepEqual(result.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })), []);
      };
      const fits = async () => {
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        const dialog = page.locator("dialog[open]");
        if (await dialog.count()) assert(await dialog.evaluate((d) => { const r = d.getBoundingClientRect(); return d.scrollWidth <= d.clientWidth + 1 && r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1; }));
      };
      await page.goto(origin); await ready();
      stage = "create-without-field-clicks";
      await page.locator("#browser-wallet-button").click();
      await page.locator("#wallet-create-choice").click();
      await audit();
      await page.locator("#browser-wallet-dialog").screenshot({ path: `hauntboard/evidence/newgui-pin-${engine}.png` });
      await page.keyboard.type("00428");
      assert.equal(await page.evaluate(async () => (await import("/browser-wallet.mjs")).exists()), false);
      await page.keyboard.press("Backspace");
      await expect(page.locator(".pin-dots .filled")).toHaveCount(4);
      await page.keyboard.type("81");
      await expect(page.locator("#wallet-password-label")).toHaveText("Confirm your PIN");
      await expect(page.locator(".pin-dots .filled")).toHaveCount(0);
      await audit();
      await page.keyboard.type("999999");
      await expect(page.locator("#wallet-pin-status")).toContainText("don’t match");
      assert.equal(await page.evaluate(async () => (await import("/browser-wallet.mjs")).exists()), false);
      await page.keyboard.type("004281");
      await page.keyboard.press("Enter");
      await expect(page.locator("#wallet-seed-words li")).toHaveCount(24, { timeout: 60000 });
      const phrase = (await page.locator("#wallet-seed-words li").allTextContents()).join(" ");
      const address = await page.evaluate(async () => (await import("/browser-wallet.mjs")).active().address);
      await confirmRecoveryWord(page); await page.locator("#wallet-seed-saved").check();
      await page.locator("#wallet-confirm-seed").click();
      await expect(page.locator("#wallet-ready-panel")).toBeVisible();
      await expect(page.locator("#wallet-ready-value")).toHaveText("0 test TARI");
      await expect(page.locator("#wallet-ready-posting")).toHaveText("0 test TARI");
      checks.push("Automatic create/confirm; leading zero; Backspace; mismatch retry; native phrase backup; separate balances");

      stage = "unlock-and-input-editing";
      await page.locator("#wallet-lock").click();
      await expect(page.locator("#wallet-password")).toBeVisible(); await expect(page.locator("#wallet-password")).toBeFocused();
      await page.keyboard.type("999999");
      await expect(page.locator("#wallet-pin-status")).toContainText("Incorrect PIN");
      await expect(page.locator("#wallet-password")).toBeVisible(); await expect(page.locator("#wallet-password")).toBeFocused();
      await page.locator('[data-pin-key="0"]').click();
      await page.keyboard.press("Numpad0");
      await page.keyboard.type("42");
      await page.locator('[data-pin-key="backspace"]').click();
      await page.keyboard.type("281");
      await expect(page.locator("#wallet-ready-panel")).toBeVisible({ timeout: 30000 });
      checks.push("Wrong PIN clears and refocuses; mixed keypad/hardware/numpad unlock without submit button");

      stage = "paste-and-key-repeat";
      await page.locator("#wallet-lock").click();
      await expect(page.locator("#wallet-password")).toBeVisible(); await expect(page.locator("#wallet-password")).toBeFocused();
      await page.locator("#wallet-password").evaluate((input) => { const clipboardData = new DataTransfer(); clipboardData.setData("text/plain", "004281004281"); const event = new Event("paste", { bubbles: true, cancelable: true }); Object.defineProperty(event, "clipboardData", { value: clipboardData }); input.dispatchEvent(event); });
      await expect(page.locator("#wallet-pin-status")).toContainText("Paste a six-digit PIN");
      await expect(page.locator(".pin-dots .filled")).toHaveCount(0);
      await page.locator("#wallet-password").evaluate((input) => input.dispatchEvent(new KeyboardEvent("keydown", { key: "1", code: "Digit1", repeat: true, bubbles: true, cancelable: true })));
      await expect(page.locator(".pin-dots .filled")).toHaveCount(0);
      await page.locator("#wallet-password").evaluate((input) => { const clipboardData = new DataTransfer(); clipboardData.setData("text/plain", " 004281 "); const event = new Event("paste", { bubbles: true, cancelable: true }); Object.defineProperty(event, "clipboardData", { value: clipboardData }); input.dispatchEvent(event); });
      await expect(page.locator("#wallet-ready-panel")).toBeVisible({ timeout: 30000 });
      checks.push("Paste is validated as one step; repeated held digits ignored");

      stage = "change-pin-cross-tab";
      const other = await context.newPage(); await other.goto(origin); await expect(other.locator("body")).toHaveAttribute("data-ready", "true");
      await other.evaluate(async () => (await import("/browser-wallet.mjs")).unlock("004281"));
      await page.locator("#wallet-settings summary").click();
      await page.locator("#wallet-change-pin").click();
      await enterWalletCredential(page, "730194");
      await expect(page.locator("#wallet-message")).toContainText("PIN updated", { timeout: 30000 });
      await expect.poll(() => other.evaluate(async () => (await import("/browser-wallet.mjs")).active())).toBeNull();
      await other.close();
      assert.equal(await page.evaluate(async () => (await import("/browser-wallet.mjs")).active().address), address);
      checks.push("PIN change preserves identity and locks other tabs");

      stage = "cancel-inflight-verification";
      await page.locator("#wallet-lock").click();
      await expect(page.locator("#wallet-password")).toBeVisible(); await expect(page.locator("#wallet-password")).toBeFocused();
      await page.evaluate(() => {
        const original = crypto.subtle.decrypt.bind(crypto.subtle);
        crypto.subtle.decrypt = async (...args) => { await new Promise((resolve) => { window.releaseCredential = resolve; }); crypto.subtle.decrypt = original; return original(...args); };
      });
      await page.keyboard.type("730194");
      await expect.poll(() => page.evaluate(() => typeof window.releaseCredential)).toBe("function");
      await page.keyboard.press("Escape");
      await page.evaluate(() => window.releaseCredential());
      await expect(page.locator("#browser-wallet-dialog")).not.toBeVisible();
      await expect(page.locator('[data-close="browser-wallet-dialog"]')).toBeEnabled({ timeout: 30000 });
      await expect.poll(() => page.evaluate(async () => (await import("/browser-wallet.mjs")).active())).toBeNull();
      await page.locator("#browser-wallet-button").click();
      await expect(page.locator("#wallet-password")).toBeVisible(); await expect(page.locator("#wallet-password")).toBeFocused();
      checks.push("Closing during verification ignores stale completion and locks the finished wallet");

      stage = "recovery-validation-and-review";
      await page.locator("#wallet-forgot-pin").click();
      await expect(page.locator("#wallet-forgot-panel")).toBeVisible();
      await page.locator("#wallet-forgot-recover").click();
      await page.locator("#wallet-recovery-input").fill("invalid seed");
      await page.locator("#wallet-recovery-next").click();
      await expect(page.locator("#wallet-message")).toContainText("24 recovery words");
      await page.locator("#wallet-recovery-input").fill(phrase);
      await page.locator("#wallet-expected-address").fill("wrong-address");
      await page.locator("#wallet-recovery-next").click();
      await expect(page.locator("#wallet-message")).toContainText("does not match");
      await page.locator("#wallet-expected-address").fill(address);
      await enterWalletCredential(page, "492708");
      await expect(page.locator("#wallet-recovery-review")).toBeVisible();
      await expect(page.locator("#wallet-recovery-consequence")).toContainText("in place of");
      assert.equal(await page.evaluate(async () => { const w = await import("/browser-wallet.mjs"); await w.unlock("730194"); const a = w.active().address; w.lock(); return a; }), address);
      await audit();
      await page.locator("#wallet-restore").click();
      await expect(page.locator("#wallet-ready-panel")).toBeVisible({ timeout: 60000 });
      assert.equal(await page.evaluate(async () => { const w = await import("/browser-wallet.mjs"); w.lock(); await w.unlock("492708"); return w.active().address; }), address);
      checks.push("Invalid phrase/address preserve saved wallet; recovery is validated before PIN; explicit review before replacement");

      stage = "legacy-password-migration";
      await page.evaluate(async () => { const w = await import("/browser-wallet.mjs"), backup = await w.backup("synthetic legacy device password"); await w.deleteWallet(); await w.restore(backup, "synthetic legacy device password"); w.lock(); });
      await page.reload(); await ready(); await page.locator("#browser-wallet-button").click();
      await expect(page.locator("#wallet-keypad")).toBeHidden();
      await enterWalletCredential(page, "synthetic legacy device password");
      await page.locator("#wallet-unlock").click(); stage = "legacy-password-unlocked";
      await expect(page.locator("#wallet-ready-panel")).toBeVisible({ timeout: 30000 });
      if (!(await page.locator("#wallet-settings").evaluate((el) => el.open))) await page.locator("#wallet-settings summary").click();
      stage = "legacy-password-change-pin"; await page.locator("#wallet-change-pin").click(); await enterWalletCredential(page, "004281");
      await expect(page.locator("#wallet-message")).toContainText("PIN updated", { timeout: 30000 });
      checks.push("Older password records remain usable and migrate to numeric PIN without identity change");

      stage = "layout-and-accessibility";
      await page.locator("#wallet-lock").click();
      await expect(page.locator("#wallet-password")).toBeVisible(); await expect(page.locator("#wallet-password")).toBeFocused();
      await expect(page.locator("#wallet-keypad")).toBeVisible();
      for (const [width, height] of [[320,568], [390,844], [768,1024], [1366,768], [844,390]]) {
        await page.setViewportSize({ width, height }); await fits(); await audit();
        const targets = await page.locator("[data-pin-key]").evaluateAll((buttons) => buttons.map((b) => b.getBoundingClientRect().height));
        assert(targets.every((height) => height >= 44), `PIN targets under 44px at ${width}: ${targets.join(",")}`);
        await page.locator("#browser-wallet-dialog").screenshot({ path: `hauntboard/evidence/newgui-pin-${engine}-${width}.png` });
      }
      await page.setViewportSize({ width: 1280, height: 900 });
      // At 200% browser zoom, a 1280x900 window has a 640x450 CSS viewport.
      await page.setViewportSize({ width: 640, height: 450 }); await fits();
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.keyboard.press("Tab");
      assert.equal(await page.evaluate(() => document.querySelector("dialog[open]").contains(document.activeElement)), true);
      await page.keyboard.press("Escape");
      await expect(page.locator("#wallet-password")).toHaveValue("");
      await page.setViewportSize({ width: 390, height: 844 });
      await fits();
      await expect(page.locator('[data-category="tari"]')).toBeVisible();
      await expect(page.locator('[data-category="pol"]')).toBeVisible();
      checks.push("PIN dialogs at five sizes and 200% zoom; 44px targets; accessibility scans; focus containment and clearing; visible mobile forum switcher");
      assert(!requests.some((body) => body.includes(phrase) || body.includes("004281") || body.includes("730194") || body.includes("492708")));
      assert.deepEqual(errors, []);
      assert.equal(writes, 0);
      report.browsers[engine] = { status: "PASSED", checks };
      await context.close();
      console.log(`${engine}: ${checks.length} new GUI scenarios passed; zero chain writes`);
    } catch (error) {
      // Never print Playwright input diagnostics that may contain recovery words.

      throw new Error(`New GUI checks failed at ${stage} (${engine}, ${error.name}); private input diagnostics omitted.`);
    } finally { await browser.close(); }
  }
  report.status = "NEW_GUI_PASSED";
  report.chainWrites = writes;
  await writeFile("hauntboard/evidence/newgui.json", JSON.stringify(report, null, 2) + "\n");
} finally { server.close(); }
