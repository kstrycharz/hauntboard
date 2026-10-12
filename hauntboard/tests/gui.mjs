import AxeBuilder from "@axe-core/playwright";
import { enterWalletCredential } from "./gui-helpers.mjs";
// Deterministic frontend regression tests. Wallets, providers and submissions are
// explicitly simulated here; these checks do not establish chain compatibility.
import { chromium, firefox, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
const web = fileURLToPath(new URL("../web/", import.meta.url));
const origin = "http://localhost:8796";
const boardAddress = `component_${"a".repeat(64)}`,
  threadAddress = `component_${"b".repeat(64)}`,
  slowAddress = `component_${"c".repeat(64)}`;
const transactionId = "d".repeat(64),
  operationId = "e".repeat(64);
const phrase = Array.from({ length: 24 }, (_, i) => `fixtureword${i + 1}`).join(
  " ",
);
const payload = (body) =>
  Array.from(
    new TextEncoder().encode(
      JSON.stringify({
        v: 1,
        title: "A fixture conversation",
        name: "Ghost",
        body,
      }),
    ),
  );
const thread = () => ({
  address: threadAddress,
  board: boardAddress,
  mode: 0,
  title: "A fixture conversation",
  uid: Array(16).fill(1),
  version: 1,
  schema: 4,
  postCount: 3,
  capacity: 2048,
  nextBefore: null,
  pages: [],
  posts: [
    {
      index: 0,
      parent: null,
      epoch: 1,
      payload: payload("Opening fixture post"),
    },
    { index: 1, parent: 0, epoch: 2, payload: payload("First fixture reply") },
    { index: 2, parent: 1, epoch: 3, payload: payload("Second fixture reply") },
  ],
});
const ref = (address) => ({
  address,
  title:
    address === slowAddress ? "Slow fixture thread" : "A fixture conversation",
  mode: 0,
  uid: Array(16).fill(1),
});
const walletStub = `
let wallet=null,call,confirmed=true,scanComplete=true;
export function configure(c,api){call=api;}
export function active(){return wallet;}
export async function exists(){return sessionStorage.getItem('gui-fixture-wallet')==='saved';}
export async function unlockMethod(){return 'pin';}
export async function changePin(){}
export async function deleteWallet(){wallet=null;sessionStorage.removeItem('gui-fixture-wallet');}
export function needsPhraseConfirmation(){return Boolean(wallet)&&!confirmed;}
export async function create(){sessionStorage.setItem('gui-fixture-wallet','saved');wallet={address:'fixture-address',account:null};confirmed=false;return {...wallet,phrase:${JSON.stringify(phrase)}};}
export async function unlock(){wallet={address:'fixture-address',account:null};return wallet;}
export async function recover(){sessionStorage.setItem('gui-fixture-wallet','saved');wallet={address:'fixture-address',account:null};scanComplete=false;return {...wallet,scan:{complete:false}};}
export async function inspectRecovery(){return {address:'fixture-address'};}
export function postingPreparationStatus(){return {pending:false};}
export async function confirmPhrase(){confirmed=true;}
export async function recoveryPhrase(){return ${JSON.stringify(phrase)};}
export async function verifyCredential(){}
export function lock(){wallet=null;}
export function faucetStatus(){return {claimed:false,pending:false};}
export function fundScanStatus(){return {complete:scanComplete};}
export function privateFunds(){return {ready:1,quarantined:2,reserved:0};}
export async function privateBalance(){return {ready:'1000000',quarantined:'2000000',reserved:'0',revealed:'0',total:'3000000'};}
export async function balance(){return '1000000';}
export async function syncPrivateFunds(){scanComplete=true;return {complete:true};}
export async function review(body){return {...await call('/api/quote',body),browser:true,privateFee:true};}
export async function submit(quote){return call('/api/browser-submit',{operation:quote.operation});}
export async function transaction(id){return call('/api/transaction?id='+id);}
export async function requestTestFunds(){return {faucet:true};}
export async function fund(){return {};}
export async function importIncoming(){return {};}
`;
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, origin).pathname;
    const name = path === "/" ? "index.html" : path.slice(1);
    if (
      ![
        "index.html",
        "app.mjs",
        "pin-entry.mjs",
        "crypto.mjs",
        "style.css",
        "mobile.css",
      ].includes(name)
    ) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.setHeader(
      "Content-Type",
      name.endsWith(".html")
        ? "text/html"
        : name.endsWith(".css")
          ? "text/css"
          : "text/javascript",
    );
    res.end(await readFile(web + name));
  } catch {
    res.writeHead(500);
    res.end();
  }
});
await new Promise((resolve) => server.listen(8796, "0.0.0.0", resolve));
const report = {
  scope:
    "Simulated providers/wallet/submissions; actual frontend assets; no public writes or funds",
  checks: [],
  browsers: {},
};
async function fixture(browser, options = {}) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const state = {
    submits: 0,
    quotes: 0,
    unknown: false,
    indexing: false,
    delay: null,
    failFeed: false,
    reject: false,
  };
  if (options.saved)
    await context.addInitScript(() =>
      sessionStorage.setItem("gui-fixture-wallet", "saved"),
    );
  if (options.pending)
    await context.addInitScript(
      ({ boardAddress, threadAddress, operationId }) => {
        if (!sessionStorage.getItem("gui-pending-seeded")) {
          localStorage.setItem(
            "hauntboard-pending",
            JSON.stringify({
              operation: operationId,
              kind: "reply",
              thread: threadAddress,
              board: boardAddress,
              browser: true,
            }),
          );
          sessionStorage.setItem("gui-pending-seeded", "yes");
        }
      },
      { boardAddress, threadAddress, operationId },
    );
  await context.route("**/browser-wallet.mjs", (r) =>
    r.fulfill({ contentType: "text/javascript", body: walletStub }),
  );
  await context.route("**/api/**", async (r) => {
    const url = new URL(r.request().url()),
      path = url.pathname;
    const json = (body, status = 200) =>
      r.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (path === "/api/config") {
      if (options.configGate) await options.configGate;
      if (options.failConfig)
        return json({ error: "Fixture config unavailable" }, 503);
      return json({
        network: "esmeralda",
        profile: options.demo ? "local" : "public",
        posterPrivacy: !options.demo,
        networkByte: 38,
        resetIdentity: "fixture",
        testnetBeta: true,
        faucetEnabled: true,
        board: boardAddress,
        label: "Ghost A",
        provider: "Fixture provider",
        csrf: "fixture",
      });
    }
    if (path === "/api/board") {
      if (state.failFeed)
        return json({ error: "Fixture feed unavailable" }, 503);
      return json({
        address: boardAddress,
        version: 1,
        threads: options.full
          ? Array.from({ length: 128 }, () => ref(threadAddress))
          : options.slow
            ? [ref(slowAddress), ref(threadAddress)]
            : [ref(threadAddress)],
      });
    }
    if (path === "/api/thread") {
      if (url.searchParams.get("address") === slowAddress) {
        if (options.slowGate) await options.slowGate;
        return json({ error: "Fixture thread unavailable" }, 503);
      }
      if (state.indexing)
        return json({ error: "Fixture indexer catching up" }, 503);
      const view = thread();
      if (state.submits && !state.unknown && state.body?.kind === "reply") {
        view.posts.push({
          index: 3,
          parent: state.body.parent,
          epoch: 4,
          nonce: state.body.nonce,
          payload: state.body.payload,
        });
        view.postCount = 4;
      }
      return json(view);
    }
    if (path === "/api/quote") {
      state.quotes++;
      state.body = r.request().postDataJSON();
      return json({
        operation: operationId,
        id: "fixture-quote",
        maxFee: "123000",
        mode: 0,
        browser: !options.demo,
        privateFee: !options.demo,
      });
    }
    if (path === "/api/browser-submit" || path === "/api/submit") {
      state.submits++;
      if (state.unknown) return r.abort();
      return json({ transactionId });
    }
    if (path === "/api/operation")
      return json(state.unknown ? { status: "uncertain" } : { transactionId });
    if (path === "/api/transaction")
      return json({
        status: state.reject ? "Rejected" : "Accepted",
        fee: "123000",
      });
    return json({ error: "Unknown fixture endpoint" }, 404);
  });
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
    console.error(`Fixture runtime error: ${error.message}`);
  });
  await page.goto(origin);
  return { context, page, state, errors };
}
async function ready(page) {
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
  await expect(page.locator(".thread-link").first()).toBeVisible();
}
async function unlock(page) {
  await page.locator("#browser-wallet-button").click();
  await enterWalletCredential(page, "604281");
  await expect(page.locator("#wallet-ready-panel")).toBeVisible();
  await page.locator('[data-close="browser-wallet-dialog"]').click();
}
async function compose(page) {
  await page.locator("#new-thread").click();
  await page.locator("#thread-title").fill("Exact reviewed title");
  await page.locator("#thread-body").fill("Exact reviewed body 🕯");
  await page.locator("#compose-form button[type=submit]").click();
}
try {
  for (const [name, engine] of Object.entries({ chromium, firefox })) {
    const browser = await engine.launch();
    const checks = [];
    try {
      let release;
      const configGate = new Promise((r) => (release = r));
      let f = await fixture(browser, { configGate });
      await expect(f.page.locator("#wallet-button")).toBeHidden();
      await expect(f.page.locator("#keys-button")).toBeHidden();
      await expect(f.page.locator("[data-filter=secret]")).toBeHidden();
      await expect(f.page.locator("#new-thread")).toBeDisabled();
      release();
      await ready(f.page);
      await expect(f.page.locator("#network-label")).toHaveText(
        "Esmeralda testnet",
      );
      await f.context.close();
      checks.push("No unsupported features before configuration");
      f = await fixture(browser, { failConfig: true });
      await expect(f.page.locator("#identity")).toHaveText(
        "Wallet unavailable",
      );
      await expect(f.page.locator("#new-thread")).toBeDisabled();
      await expect(f.page.locator("#wallet-button")).toBeHidden();
      await f.context.close();
      checks.push("Configuration failure closes posting");
      f = await fixture(browser);
      await ready(f.page);
      await compose(f.page);
      await expect(f.page.locator("#wallet-entry")).toBeVisible();
      await f.page.locator("#wallet-create-choice").click();
      await enterWalletCredential(f.page, "604281");
      await expect(f.page.locator("#wallet-seed-words li")).toHaveCount(24);
      await f.page.locator("#wallet-seed-saved").check();
      await f.page.locator("#wallet-seed-check").fill("wrong");
      await expect(f.page.locator("#wallet-confirm-seed")).toBeDisabled();
      const label = await f.page
          .locator("#wallet-seed-check-label")
          .textContent(),
        index = Number(label.match(/word (\d+)/)[1]);
      await f.page.locator("#wallet-seed-check").fill(`fixtureword${index}`);
      await f.page.locator("#wallet-confirm-seed").click();
      await expect(f.page.locator("#thread-body")).toHaveValue(
        "Exact reviewed body 🕯",
      );
      await f.page.locator("#compose-form button[type=submit]").click();
      await expect(f.page.locator("#review-content-body")).toHaveText(
        "Exact reviewed body 🕯",
      );
      await expect(f.page.locator("#review-fee-label")).toHaveText(
        "Network fee · paid in full",
      );
      await f.page.locator("#review-edit").click();
      await f.page.locator("#thread-body").fill("Edited body");
      await f.page.locator("#compose-form button[type=submit]").click();
      await expect(f.page.locator("#review-content-body")).toHaveText(
        "Edited body",
      );
      assert.equal(f.state.quotes, 2);
      assert.equal(f.state.submits, 0);
      await f.context.close();
      checks.push(
        "Wallet onboarding returns draft; word check; exact review; editing requotes",
      );
      f = await fixture(browser, { saved: true });
      await ready(f.page);
      await unlock(f.page);
      await expect(f.page.locator("#wallet-balance-value")).toHaveText(
        "3 test TARI",
      );
      await f.page.locator(".thread-link").click();
      await expect(f.page.locator("#conversation-title")).toBeFocused();
      await f.page
        .locator("#reply-body")
        .fill("Reply under lost acknowledgement");
      await f.page.locator("#reply-form button[type=submit]").click();
      f.state.unknown = true;
      await f.page.locator("#confirm-publish").click();
      await expect(f.page.locator("#operation-panel")).toHaveAttribute(
        "data-state",
        "unknown",
      );
      await f.page.locator("#browser-wallet-button").click();
      await expect(f.page.locator("#operation-panel")).toBeAttached();
      await f.page.locator('[data-close="browser-wallet-dialog"]').click();
      await f.page.reload();
      await expect(f.page.locator("#operation-panel")).toHaveAttribute(
        "data-state",
        "unknown",
      );
      await expect(f.page.locator("#check-operation")).toBeVisible();
      assert.equal(f.state.submits, 1);
      f.state.unknown = false;
      f.state.indexing = true;
      await f.page.locator("#check-operation").click();
      await expect(f.page.locator("#operation-panel")).toHaveAttribute(
        "data-state",
        "indexing",
      );
      await expect(f.page.locator("#check-operation")).toBeVisible();
      assert.equal(f.state.submits, 1);
      f.state.indexing = false;
      await f.page.locator("#check-operation").click();
      await expect(f.page.locator("#operation-panel")).toHaveAttribute(
        "data-state",
        "confirmed",
      );
      assert.equal(f.state.submits, 1);
      await f.context.close();
      checks.push(
        "Lost acknowledgement survives reload; accepted/indexing distinct; no duplicate sends",
      );
      f = await fixture(browser, { saved: true });
      await ready(f.page);
      await unlock(f.page);
      await f.page.locator(".thread-link").click();
      await f.page.locator("#reply-body").fill("Rejected fixture reply");
      await f.page.locator("#reply-form button[type=submit]").click();
      f.state.reject = true;
      await f.page.locator("#confirm-publish").click();
      await expect(f.page.locator("#operation-panel")).toHaveAttribute(
        "data-state",
        "rejected",
      );
      await expect(f.page.locator("#reply-body")).toHaveValue(
        "Rejected fixture reply",
      );
      assert.equal(
        await f.page.evaluate(() => localStorage.getItem("hauntboard-pending")),
        null,
      );
      await f.context.close();
      checks.push("Rejected submission retains draft");
      let releaseSlow;
      const slowGate = new Promise((r) => (releaseSlow = r));
      f = await fixture(browser, { slow: true, slowGate });
      await ready(f.page);
      await expect(f.page.locator(".thread-preview")).toContainText([
        "Opening fixture post",
        "Loading conversation…",
      ]);
      releaseSlow();
      await expect(
        f.page.getByRole("button", { name: "Retry this thread" }),
      ).toBeVisible();
      f.state.failFeed = true;
      await f.page.locator("#refresh").click();
      await expect(f.page.locator("#sync-time")).toContainText(
        "Refresh failed",
      );
      await expect(f.page.locator(".thread-preview").first()).toContainText(
        "Opening fixture post",
      );
      await f.context.close();
      checks.push("Progressive feed and retained stale rows");
      f = await fixture(browser, { demo: true });
      await ready(f.page);
      await f.page.locator("[data-filter=public]").click();
      await expect(f.page.locator("[data-filter=public]")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await f.page.locator(".thread-link").click();
      await expect(f.page.locator(".post-body")).toContainText([
        "Opening fixture post",
        "First fixture reply",
        "Second fixture reply",
      ]);
      await f.page.getByRole("link", { name: "In reply to post 2" }).click();
      await expect(f.page.locator("#post-1")).toBeFocused();
      await f.page
        .locator("#post-1")
        .getByRole("button", { name: "Reply", exact: true })
        .click();
      await expect(f.page.locator("#reply-excerpt")).toHaveText(
        "First fixture reply",
      );
      await f.page.locator("#cancel-reply").click();
      await expect(f.page.locator("#reply-target")).toBeHidden();
      await f.page.goBack();
      await expect(f.page.locator("#board-view")).toBeVisible();
      await expect(f.page.locator("[data-filter=public]")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await f.page.locator(".row-side summary").click();
      await f.page
        .getByRole("button", { name: "Hide on this device", exact: true })
        .click();
      await expect(f.page.locator(".thread-link")).toHaveCount(0);
      await f.page.getByRole("button", { name: "Undo", exact: true }).click();
      await expect(f.page.locator(".thread-link")).toHaveCount(1);
      await f.page.locator("#new-thread").click();
      await f.page.locator("#thread-body").fill("🕯".repeat(1200));
      await expect(f.page.locator("#compose-space")).toContainText("over");
      await f.page.locator('input[name=mode][value="1"]').check();
      await f.page.locator('[data-close="compose-dialog"]').click();
      await expect(f.page.locator("#discard-secret")).toBeVisible();
      await f.page.locator("#keep-draft").click();
      await expect(f.page.locator("#thread-body")).toHaveValue(
        "🕯".repeat(1200),
      );
      await f.context.close();
      checks.push(
        "History/filter restoration, parent focus, reply cancel, local hide undo, Unicode limit, sealed dismissal",
      );
      f = await fixture(browser);
      await ready(f.page);
      await f.page.locator("#browser-wallet-button").click();
      await f.page.locator("#wallet-recover-choice").click();
      await expect(f.page.locator("#wallet-account-index")).toBeHidden();
      await f.page.locator("#wallet-recovery-input").fill(phrase);
      await enterWalletCredential(f.page, "604281");
      await f.page.locator("#wallet-restore").click();
      await expect(f.page.locator("#wallet-readiness")).toContainText(
        "incomplete",
      );
      await f.page.locator("#wallet-sync-funds").click();
      await expect(f.page.locator("#wallet-readiness")).toContainText(
        "Funds are available",
      );
      await f.context.close();
      checks.push(
        "Advanced recovery collapsed; incomplete sync differentiated",
      );
      f = await fixture(browser);
      await ready(f.page);
      for (const width of [320, 390, 768, 1024, 1440]) {
        await f.page.setViewportSize({ width, height: 900 });
        assert(
          await f.page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `Overflow at ${width}`,
        );
        await expect(f.page.locator(".thread-row").first()).toBeVisible();
        const first = await f.page.locator(".thread-row").first().boundingBox();
        assert(first.y < 900, `Feed below fold at ${width}`);
        await f.page.locator("#new-thread").click();
        assert(
          await f.page
            .locator("#compose-dialog")
            .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        );
        await f.page.locator('[data-close="compose-dialog"]').click();
      }
      await f.page.setViewportSize({ width: 1280, height: 900 });
      await f.page.evaluate(() => (document.body.style.zoom = "2"));
      assert(
        await f.page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "Overflow at 200% layout zoom",
      );
      await f.page.evaluate(() => (document.body.style.zoom = "1"));
      const accessibility = await new AxeBuilder({ page: f.page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      assert.deepEqual(
        accessibility.violations.map((v) => ({
          id: v.id,
          targets: v.nodes.map((n) => n.target),
        })),
        [],
      );
      await f.page.setViewportSize({ width: 390, height: 844 });
      await f.page.locator("#menu-button").click();
      await expect(f.page.locator("#menu-button")).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      await f.page.keyboard.press("Escape");
      await expect(f.page.locator("#menu-button")).toBeFocused();
      await expect(f.page.locator("#menu-button")).toHaveAttribute(
        "aria-expanded",
        "false",
      );
      await mkdir("hauntboard/evidence", { recursive: true });
      await f.page.screenshot({
        path: `hauntboard/evidence/gui-mobile-${name}.png`,
        fullPage: true,
      });
      await f.page.setViewportSize({ width: 1440, height: 1000 });
      await f.page.screenshot({
        path: `hauntboard/evidence/gui-desktop-${name}.png`,
        fullPage: true,
      });
      assert.deepEqual(f.errors, []);
      await f.context.close();
      checks.push("Responsive widths and mobile menu keyboard");
      report.browsers[name] = { checks, status: "PASSED" };
      console.log(
        `${name}: ${checks.length} GUI scenarios passed (simulated chain)`,
      );
    } finally {
      await browser.close();
    }
  }
  report.status = "GUI_FIXTURE_REGRESSIONS_PASSED";
  report.checkedAt = new Date().toISOString();
  await writeFile(
    "hauntboard/evidence/gui-regression.json",
    JSON.stringify(report, null, 2) + "\n",
  );
} finally {
  server.close();
}
