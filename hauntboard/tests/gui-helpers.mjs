// Read a requested recovery word only inside the browser test. Never log it.
export async function enterWalletCredential(page, value = "604281") {
  await page.locator("#wallet-password").fill(value);
  if (await page.locator("#wallet-pin-confirm").isVisible())
    await page.locator("#wallet-pin-confirm").fill(value);
}
export async function confirmRecoveryWord(page) {
  const label = await page.locator("#wallet-seed-check-label").textContent();
  const index = Number(label.match(/word (\d+)/)?.[1]) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= 24)
    throw new Error("Recovery confirmation prompt was not available.");
  const word = await page
    .locator("#wallet-seed-words li")
    .nth(index)
    .textContent();
  await page.locator("#wallet-seed-check").fill(word);
}
