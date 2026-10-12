// Read a requested recovery word only inside the browser test. Never log it.
import { expect } from "@playwright/test";
export async function enterWalletCredential(page, value = "604281") {
  const input = page.locator("#wallet-password");
  if (!/^\d{6}$/.test(value)) {
    await input.fill(value);
    return;
  }
  if (await page.locator("#wallet-recover-panel").isVisible()) {
    await page.locator("#wallet-recovery-next").click();
    await page.locator('#browser-wallet-dialog[data-step="recover-pin"]').waitFor();
  }
  const setup = ["create", "change-pin", "recover-pin"].includes(await page.locator("#browser-wallet-dialog").getAttribute("data-step"));
  // The app owns focus. This helper deliberately never selects a PIN field.
  await expect(input).toBeVisible();
  await expect(input).toBeFocused();
  await page.keyboard.type(value);
  if (setup) {
    await page.locator("#wallet-password-label").filter({ hasText: "Confirm your PIN" }).waitFor();
    await expect(input).toBeFocused();
    await page.keyboard.type(value);
  }
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
