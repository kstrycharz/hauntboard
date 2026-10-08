import { chromium, firefox, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const origin = process.env.GUI_ORIGIN;
assert.ok(origin, "GUI_ORIGIN is required");
await mkdir("hauntboard/evidence", { recursive: true });
const reports = [];
for (const [engine, launcher] of Object.entries({ chromium, firefox })) {
  const browser = await launcher.launch();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/browser-submit", (route) => route.abort());
    await page.route("**/api/faucet-submit", (route) => route.abort());
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.body.dataset.ready === "true", {
      timeout: 30000,
    });
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `Overflow at ${width}`,
      );
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    const audit = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    assert.deepEqual(
      audit.violations.map((v) => v.id),
      [],
    );
    await page.screenshot({
      path: `hauntboard/evidence/gui-live-desktop-${engine}.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: `hauntboard/evidence/gui-live-mobile-${engine}.png`,
      fullPage: true,
    });
    await expect(
      page.getByRole("button", { name: "Wallet", exact: true }),
    ).toBeVisible();
    assert.deepEqual(errors, []);
    const assets = [];
    for (const name of [
      "index.html",
      "app.mjs",
      "style.css",
      "mobile.css",
      "crypto.mjs",
      "browser-wallet.mjs",
      "transaction-identity.wasm",
      "wallet-recovery.wasm",
    ]) {
      const response = await page.request.get(
        `${origin}/${name === "index.html" ? "" : name}`,
      );
      assert.ok(response.ok(), name);
      if (name.endsWith('.wasm')) {
        assert.match(response.headers()['content-type'], /application\/wasm/);
        assert.ok(WebAssembly.validate(await response.body()), name);
      }
      const actual = createHash("sha256")
        .update(await response.body())
        .digest("hex");
      const expected = createHash("sha256")
        .update(await readFile(`hauntboard/web/${name}`))
        .digest("hex");
      assert.equal(actual, expected, `Served source mismatch: ${name}`);
      assets.push({ name, sha256: actual });
    }
    reports.push({
      engine,
      origin,
      checkedAt: new Date().toISOString(),
      widths: [320, 390, 768, 1024, 1440],
      axeViolations: 0,
      pageErrors: 0,
      assets,
      status: "LIVE_GUI_PASSED",
    });
  } finally {
    await browser.close();
  }
}
await writeFile(
  "hauntboard/evidence/gui-live.json",
  JSON.stringify(reports, null, 2) + "\n",
);
console.log(JSON.stringify(reports.map(({ assets, ...report }) => report)));
