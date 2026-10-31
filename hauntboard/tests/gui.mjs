import AxeBuilder from "@axe-core/playwright";
import { enterWalletCredential } from "./gui-helpers.mjs";
// Deterministic frontend regression tests. Wallets, providers and submissions are
// explicitly simulated here; these checks do not establish chain compatibility.
import { chromium, firefox, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
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
  pages: [`component_${"f".repeat(64)}`],
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
export function fundScanStatus(){return {complete:scanComplete};}
export function privateFunds(){return {ready:1,quarantined:2,reserved:0};}
export async function privateBalance(){return {ready:'1000000',quarantined:'2000000',reserved:'0',revealed:'0',total:'3000000'};}
export async function balance(){return '1000000';}
export async function syncPrivateFunds(){scanComplete=true;return {complete:true};}
export async function review(body){return {...await call('/api/quote',body),browser:true,privateFee:true};}
export async function submit(quote){return call('/api/browser-submit',{operation:quote.operation});}
export async function transaction(id){return call('/api/transaction?id='+id);}
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
        "sapient-wallet.mjs",
        "wallet-options.mjs",
        "network-profile.mjs",
        "vendor/wallet-sdk.mjs",
        "api-client.mjs",
        "faucet-client.mjs",
        "post-proof.mjs",
        "pin-entry.mjs",
        "crypto.mjs",
        "sealed-posts.mjs",
        "room-manager.mjs",
        "room-access-request.mjs",
        "room-vault.mjs",
        "room-keys.mjs",
        "key-registry.mjs",
        "vendor/hpke.mjs",
        "about.html",
        "about.mjs",
        "about.css",
        "forums.html",
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
  const state = options.state ?? {
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
  if (options.tari) await context.addInitScript(({ network, reject }) => {
    window.fixtureTariCalls = [];
    const listeners = new Map();
    window.fixtureTariAccountChanged = () => listeners.get('accountsChanged')?.([]);
    window.fixtureInstallTari = () => {
      const provider = {
        info: { name: 'Sapient fixture' },
        on(event, callback) { listeners.set(event, callback); return () => listeners.delete(event); },
        async request({ method }) {
          window.fixtureTariCalls.push(method);
          if (method === 'tari_getNetwork') return network;
          if (method === 'tari_requestAccounts') {
            if (reject) throw { code: 4001 };
            return [`component_${'ab'.repeat(32)}`];
          }
          if (method === 'tari_getCapabilities') return { supportsPrivateFees: true, transactionRequests: true, transactionResultLookup: true };
          if (method === 'tari_disconnect') return null;
          if (method === 'tari_createTransactionRequest') { window.fixtureTariRequest = arguments[0].params; return {requestId: 'fixture-sapient-request'}; }
          if (method === 'tari_getTransactionRequest') return {status: 'approved'};
          if (method === 'tari_submitTransactionRequest') return {transactionId: 'd'.repeat(64)};
          throw Error('Unexpected provider method');
        },
      };
      window.tari = provider; window.tariProviders = [provider, provider];
      window.dispatchEvent(new Event('tari:announceProvider'));
    };
  }, options.tari);
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
        posterPrivacy: options.demo ? null : "stealth-fee-v1",
        networkByte: 38,
        resetIdentity: "fixture",
        testnetBeta: true,
        board: boardAddress,
        label: "Ghost A",
        provider: "Fixture provider",
        csrf: "fixture",
        faucetEnabled: options.faucet === true,
      });
    }
    if (path === "/api/faucet-claim") {
      state.faucetClaims = (state.faucetClaims ?? 0) + 1;
      state.faucetReceipt = r.request().postDataJSON().receipt;
      return json({receipt: state.faucetReceipt, status: "queued", transactionId: null}, 202);
    }
    if (path === "/api/faucet-status") {
      assert.equal(r.request().postDataJSON().receipt, state.faucetReceipt);
      return json({receipt: state.faucetReceipt, status: state.faucetStatus ?? "queued", transactionId: null});
    }
    if (path === "/api/board") {
      if (state.failFeed)
        return json({ error: "Fixture feed unavailable" }, 503);
      return json({
        address: boardAddress,
        version: 1,
        threads: state.sealedOpening
          ? [
              {
                ...ref(threadAddress),
                uid: state.sealedOpening.uid,
                title: state.sealedOpening.title,
              },
            ]
          : options.full
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
      if (state.sealedOpening) {
        Object.assign(view, {
          title: state.sealedOpening.title,
          uid: state.sealedOpening.uid,
          postCount: 1,
          posts: [
            {
              index: 0,
              parent: null,
              epoch: 1,
              nonce: state.sealedOpening.uid,
              payload: state.sealedOpening.payload,
            },
          ],
        });
        if (state.sealedReply) {
          view.posts.push(state.sealedReply);
          view.postCount++;
        }
        return json(view);
      }
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
      if (options.sealed && state.body.kind === "thread")
        state.sealedOpening = structuredClone(state.body);
      if (options.sealed && state.body.kind === "reply")
        state.sealedReply = {
          index: 1,
          epoch: 2,
          nonce: state.body.nonce,
          parent: state.body.parent,
          payload: state.body.payload,
        };
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
  await page.goto(options.url ?? origin);
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
  if (!(await page.evaluate(() => document.querySelector('#wallet-faucet').hidden)))
    await expect(page.locator("#wallet-faucet")).toHaveText("Get 100 test tXTR");
  const tokenLink = page.getByRole("link", { name: "TariTracker.com faucet" });
  await expect(tokenLink).toHaveAttribute(
    "href",
    "https://testnet-faucet.taritracker.com/",
  );
  await expect(tokenLink).toHaveAttribute("rel", "noopener noreferrer");
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
      f = await fixture(browser, { saved: true, tari: { network: 'esmeralda' } });
      await ready(f.page);
      await f.page.locator('#browser-wallet-button').click();
      await f.page.locator('#sapient-options > summary').click();
      await expect(f.page.locator('#sapient-connect')).toBeDisabled();
      await f.page.evaluate(() => window.fixtureInstallTari());
      await expect(f.page.locator('#sapient-provider option')).toHaveCount(1);
      await f.page.locator('#sapient-connect').click();
      await expect(f.page.locator('#browser-wallet-dialog')).not.toBeVisible();
      await f.page.locator('#browser-wallet-button').click();
      await expect(f.page.locator('#sapient-status')).toContainText('Posts will use Sapient');
      assert.deepEqual(await f.page.evaluate(() => window.fixtureTariCalls), ['tari_getNetwork', 'tari_requestAccounts', 'tari_getCapabilities']);
      await expect(f.page.locator('#sapient-gates li')).toHaveCount(0);
      await expect(f.page.locator('#identity')).toHaveText('Sapient connected');
      await f.page.evaluate(() => window.fixtureTariAccountChanged());
      await expect(f.page.locator('#sapient-disconnect')).toBeHidden();
      await f.page.locator('#sapient-use-browser').click();
      await expect(f.page.locator('#sapient-options')).not.toHaveAttribute('open');
      await enterWalletCredential(f.page, '604281');
      await expect(f.page.locator('#wallet-ready-panel')).toBeVisible();
      assert.equal(f.state.submits, 0);
      assert.deepEqual(f.errors, []);
      await f.context.close();
      checks.push('Late injected wallet discovery, deduplication, capability check without private access/spending, account-change invalidation and current-wallet fallback');
      for (const scenario of [{ network: 'igor' }, { network: 'esmeralda', reject: true }]) {
        f = await fixture(browser, { tari: scenario });
        await ready(f.page);
        await f.page.evaluate(() => window.fixtureInstallTari());
        await f.page.locator('#browser-wallet-button').click();
        await f.page.locator('#sapient-options > summary').click();
        await f.page.locator('#sapient-connect').click();
        await expect(f.page.locator('#sapient-status')).toContainText(scenario.reject ? 'declined' : 'did not complete');
        assert.equal(f.state.submits, 0);
        assert(!(await f.page.evaluate(() => window.fixtureTariCalls)).some(m => /Submit|Transaction|ViewAccess/.test(m)));
        assert.deepEqual(f.errors, []);
        await f.context.close();
      }
      checks.push('Wrong-network and rejected external connections preserve the browser-wallet path without spending');
      f = await fixture(browser, {tari: {network: 'esmeralda'}});
      await ready(f.page);
      await f.page.evaluate(() => window.fixtureInstallTari());
      await f.page.locator('#browser-wallet-button').click();
      await f.page.locator('#sapient-options > summary').click();
      await f.page.locator('#sapient-connect').click();
      await expect(f.page.locator('#browser-wallet-dialog')).not.toBeVisible();
      await f.page.locator('.thread-link').click();
      await f.page.locator('#reply-body').fill('Stock Sapient fixture reply');
      await f.page.locator('#reply-form button[type=submit]').click();
      await expect(f.page.locator('#review-wallet')).toHaveText('Sapient wallet');
      await expect(f.page.locator('#review-signing')).toContainText('Approve in Sapient');
      await f.page.locator('#confirm-publish').click();
      await expect.poll(() => f.page.evaluate(() => JSON.parse(localStorage.getItem('hauntboard-pending'))?.id)).toBe(transactionId);
      const request = await f.page.evaluate(() => window.fixtureTariRequest);
      assert.equal(request.kind, 'instructions');
      assert.equal(request.instructions[0].CallMethod.method, 'append');
      assert.equal(request.feeType, 'private');
      assert.equal(request.enforceFeeType, true);
      assert.equal(request.maxFee, '1000000');
      assert.equal((await f.page.evaluate(() => window.fixtureTariCalls)).filter(m => m === 'tari_submitTransactionRequest').length, 1);
      assert.deepEqual(f.errors, []);
      await f.context.close();
      checks.push('Stock Sapient connects and approves a native SDK-built reply without a browser wallet; pending request and transaction identity persist');
      f = await fixture(browser, {saved: true, faucet: true});
      await ready(f.page);
      await unlock(f.page);
      await f.page.locator('#browser-wallet-button').click();
      await f.page.locator('#wallet-faucet').click();
      await expect(f.page.locator('#wallet-faucet-status')).toContainText('queued');
      assert.equal(f.state.faucetClaims, 1);
      await f.page.reload();
      await ready(f.page);
      await f.page.locator('#browser-wallet-button').click();
      await enterWalletCredential(f.page, '604281');
      f.state.faucetStatus = 'uncertain';
      await expect(f.page.locator('#wallet-faucet-status')).toContainText('reconciling', {timeout: 15000});
      f.state.faucetStatus = 'confirmed';
      await expect(f.page.locator('#wallet-faucet-status')).toContainText('100 test tXTR confirmed', {timeout: 15000});
      assert.equal(f.state.faucetClaims, 1, 'Reload and uncertain reconciliation must not create another payment.');
      await f.page.setViewportSize({width: 390, height: 844});
      await f.page.locator('.wallet-faucet').scrollIntoViewIfNeeded();
      await f.page.screenshot({path: `hauntboard/evidence/faucet-api-${name}.png`});
      assert.equal(f.errors.length, 0);
      await f.context.close();
      checks.push('Faucet claim, reload, uncertain reconciliation and confirmation use one receipt; mobile attribution is linked');
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
        // A feed refresh can replace the row between visibility and geometry
        // reads. Retry the measurement without weakening the above-fold check.
        await expect.poll(async()=>{
          const first=await f.page.locator(".thread-row").first().boundingBox();
          return Boolean(first&&first.y<900);
        },{message:`Feed below fold at ${width}`}).toBe(true);
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
      await f.page.goto(`${origin}/about.html`);
      await expect(f.page.locator("#getting-started-profile")).toContainText("sealed");
      await expect(f.page.locator("#secrets")).toContainText("no key revocation or author authentication");
      await expect(f.page.locator("#storage")).toContainText("public title/category and encrypted body");
      await expect(f.page.locator("#about-deployment-copy")).toContainText("sealed bodies require an invitation key");
      await f.page.goto(`${origin}/forums.html`);
      await expect(f.page.locator("main")).toContainText("public category and title");
      await expect(f.page.locator("main")).toContainText("There is no key revocation or author authentication");
      await f.page.setViewportSize({ width: 390, height: 844 });
      assert(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.deepEqual(f.errors, []);
      await f.context.close();
      checks.push("Responsive widths, mobile menu keyboard and accurate privacy help copy");
      // Real WebCrypto and key storage; wallet/provider execution remains simulated.
      f = await fixture(browser, { saved: true, sealed: true });
      await ready(f.page);
      await unlock(f.page);
      const sentBodies = [];
      f.context.on("request", (request) => {
        if (request.method() === "POST")
          sentBodies.push(request.postData() ?? "");
      });
      await f.page.locator("#new-thread").click();
      await f.page.locator('input[name=mode][value="1"]').check();
      await f.page.locator("#thread-title").fill("Public sealed title");
      await f.page
        .locator("#thread-body")
        .fill("SYNTHETIC-SEALED-OPENING-BODY");
      await f.page.locator("#thread-category").selectOption("tari");
      assert.equal(
        await f.page.evaluate(() =>
          sessionStorage.getItem("hauntboard-compose-draft"),
        ),
        null,
      );
      await f.page.locator("#compose-form button[type=submit]").click();
      await expect(f.page.locator("#review-copy")).toContainText(
        "title, category",
      );
      assert.equal(f.state.submits, 0, "Review never submits a transaction.");
      assert.equal(
        f.state.body.mode,
        0,
        "Sealed envelopes use the unchanged schema-4 byte payload ABI.",
      );
      f.state.unknown = true;
      await f.page.locator("#confirm-publish").click();
      await expect(f.page.locator("#operation-panel")).toHaveAttribute(
        "data-state",
        "unknown",
      );
      f.state.unknown = false;
      await f.page.reload();
      await expect(f.page.locator("#posts .post-body")).toHaveText(
        "SYNTHETIC-SEALED-OPENING-BODY",
      );
      assert.equal(
        f.state.submits,
        1,
        "Lost acknowledgement reconciliation never resubmits.",
      );
      const invitation = await f.page.evaluate(
        async ({ address, board }) => {
          const { loadKey } = await import("/crypto.mjs");
          const { invitationUrl } = await import("/sealed-posts.mjs");
          return invitationUrl(
            { address, board },
            await loadKey(address),
            location.origin,
          );
        },
        { address: threadAddress, board: boardAddress },
      );
      const invitationKey = new URLSearchParams(
        new URL(invitation).hash.slice(1),
      ).get("key");
      await unlock(f.page);
      await f.page.locator("#reply-body").fill("SYNTHETIC-SEALED-REPLY-BODY");
      assert.equal(
        await f.page.evaluate(
          (address) => sessionStorage.getItem(`hauntboard-reply-${address}`),
          threadAddress,
        ),
        null,
      );
      await f.page.locator("#reply-form button[type=submit]").click();
      await expect(f.page.locator("#review-dialog")).toBeVisible();
      await f.page.locator("#confirm-publish").click();
      await expect(f.page.locator("#posts .post-body")).toHaveCount(2);
      assert(
        !sentBodies.some(
          (body) =>
            body.includes("SYNTHETIC-SEALED") || body.includes(invitationKey),
        ),
        "Plaintext and invitation key never enter requests.",
      );
      assert.deepEqual(f.errors, []);
      const observer = await fixture(browser, {
        state: f.state,
        url: `${origin}/?thread=${threadAddress}`,
      });
      await expect(observer.page.locator("#posts .post-body")).toHaveCount(0);
      await expect(observer.page.locator(".locked-copy").first()).toContainText(
        "invitation",
      );
      await expect(observer.page.locator("#reply-form")).toBeHidden();
      await expect(observer.page.locator("#posts").getByRole("button", { name: "Reply", exact: true })).toHaveCount(0);
      const recipient = await fixture(browser, {
        state: f.state,
        url: invitation,
      });
      await expect(recipient.page.locator("#posts .post-body")).toHaveCount(2);
      assert.equal(new URL(recipient.page.url()).hash, "");
      await recipient.page.reload();
      await expect(recipient.page.locator("#posts .post-body")).toHaveCount(2);
      const wrong = new URL(invitation);
      const params = new URLSearchParams(wrong.hash.slice(1));
      params.set("key", "A".repeat(43));
      wrong.hash = params.toString();
      await recipient.page.goto(wrong.href);
      await expect(recipient.page.locator("#flash")).toContainText("incorrect");
      assert.equal(
        await recipient.page.evaluate(
          async (address) => (await import("/crypto.mjs")).loadKey(address),
          threadAddress,
        ),
        invitationKey,
        "A bad invitation cannot replace a saved valid key.",
      );
      const encryptedReply = f.state.sealedReply.payload;
      f.state.sealedReply.payload = payload("ATTACKER PUBLIC REPLY");
      await recipient.page.goto(`${origin}/?thread=${threadAddress}`);
      await expect(recipient.page.locator("#posts .post-body")).toHaveCount(1);
      await expect(recipient.page.locator(".locked-copy")).toContainText(
        "Unencrypted message",
      );
      f.state.sealedReply.payload = encryptedReply;
      await observer.page.setViewportSize({ width: 390, height: 844 });
      assert(
        await observer.page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await observer.page.screenshot({
        path: `hauntboard/evidence/sealed-locked-${name}.png`,
        fullPage: true,
      });
      assert.deepEqual(recipient.errors, []);
      await observer.context.close();
      await recipient.context.close();
      await f.context.close();
      checks.push(
        "Sealed creation/reply; actual encryption; no plaintext/key requests or drafts; lost acknowledgement; fresh reader locked; invitation decrypts and survives reload",
      );
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
  report.sourceHashes = Object.fromEntries(
    await Promise.all(
      [
        "hauntboard/web/app.mjs",
        "hauntboard/web/sapient-wallet.mjs",
        "hauntboard/web/wallet-options.mjs",
        "hauntboard/web/sealed-posts.mjs",
        "hauntboard/web/crypto.mjs",
        "hauntboard/web/about.mjs",
        "hauntboard/web/forums.html",
        "hauntboard/tests/gui.mjs",
      ].map(async (path) => [
        path,
        createHash("sha256")
          .update(await readFile(path))
          .digest("hex"),
      ]),
    ),
  );
  await writeFile(
    "hauntboard/evidence/gui-regression.json",
    JSON.stringify(report, null, 2) + "\n",
  );
} finally {
  server.close();
}
