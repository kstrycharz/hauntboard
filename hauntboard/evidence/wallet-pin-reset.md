# Wallet PIN and browser reset — October 7, 2026

The owner requested a six-digit PIN with keypad/numpad entry and a setting to delete the browser wallet and create another. This is implemented in the local frontend and deployed with the coordinated forum changes.

## Behavior

- Create and recover ask for a six-digit PIN and matching confirmation. Leading zeroes are retained. The masked fields accept keyboard input, hardware numpad digits and Enter, or the on-screen keypad with Clear and Backspace.
- Wallet settings offers Change PIN for an unlocked wallet. Changing the PIN re-encrypts the same wallet, preserving its address, recovery phrase and coin state. Other tabs receive a wallet-change notification and lock.
- Existing password-protected records remain readable. Their unlock screen asks for the original password; after unlocking, Set six-digit PIN migrates them without creating a different wallet.
- Delete wallet from this browser is available in Wallet settings, including while locked. A separate confirmation requires acknowledgement that the recovery phrase is needed to restore access. Keep wallet cancels. Set up a new wallet next is selected by default, opening PIN setup after deletion.
- Deletion removes only the saved wallet record for the configured network/reset, clears the active signer and wallet UI, invalidates an unused review and locks other tabs. Other network records and sealed-thread keys are retained. Posting/funding journals with unresolved outcomes prevent deletion. No on-chain funds or posts are erased. Recovering the original phrase restores its address; creating a new wallet generates a different identity.

The PIN is a local device credential, separate from the 24-word recovery phrase and optional original Tari seed passphrase. Storage continues to use PBKDF2-SHA256 with 600,000 iterations and AES-GCM; credential-mode metadata is authenticated alongside the network/address. PINs and phrases do not go to the server. The requested six-digit PIN has lower entropy than the former password; the recovery phrase remains the wallet recovery credential. This change does not add a server-side PIN account or change Tari derivation/signing.

## Coordinated release

The chat “Implement delivery plan” was adding categories and a forum explanation page concurrently. Shared edits and deployment were paused by agreement; the complete snapshot was built in `/home/ubuntu/hauntboard/pin-build`, separate from the earlier shared build directory. The release retains those forum changes. No contract publication or new public transaction was needed.

| Item | Value |
|---|---|
| Release | `hauntboard-esmeralda-beta:0.6.4-gui` |
| Immutable image | `sha256:e5c08d722a730fa45df408563bd889c5872c6be9a247f9133e67ca06c6216227` |
| Previous running image | `sha256:527f5d31e45cabe516aa0e9d46526a82852910bf569d858ee9d19aa5c59128c7` |
| Origin | [Hauntboard HTTPS beta](https://payroll-levels-sensitivity-bit.trycloudflare.com/) |
| Deployment script | [deploy-wallet-pin.sh](../deploy/deploy-wallet-pin.sh) |
| Previous environment | `/home/ubuntu/hauntboard/releases/0.5.0/.env.before-gui-0.6.4` |

The guarded deployment changes only the app image and recreates app/preview. The existing tunnel, network manifest and operation volumes are retained. Rollback restores the above environment backup and runs `docker compose --env-file .env -f compose.tunnel.yaml -f compose.beta.yaml up -d --no-deps app preview` from the existing release directory. This restores the earlier password-based GUI; it does not erase browser records. Browser wallets using PINs should use the PIN-capable client or phrase recovery rather than relying on an older client's password-only interface.

## Verification

[wallet-pin.mjs](../tests/wallet-pin.mjs) passed in Chromium and Firefox against the isolated, testnet-connected candidate. It checks short-PIN rejection, confirmation mismatch, keypad editing, hardware numpad/Enter, wrong PIN, PIN rotation, legacy-password migration, cancellation, blocked deletion with pending journals, other-network preservation, cross-tab locking, replacement wallet identity, phrase recovery after deletion and secret non-transmission. The PIN dialog passes automated axe A/AA checks at mobile width. The cross-tab test suppresses visibility locking in the test harness to isolate the wallet-change notification; production visibility locking stays enabled.

Forum checks passed both browsers at mobile and desktop widths. Nine grouped GUI fixture regressions passed in both browsers; those use simulated providers/submissions and do not prove chain posting. Both required WASM modules passed the image build guard. Tests run in the pinned server Playwright container; no Docker Desktop interaction, public posts, spending or faucet claims are involved.

Sanitized reports are saved alongside this record: [PIN/reset checks](wallet-pin-reset.json), [live asset/layout checks](gui-live.json), [GUI fixtures](gui-regression.json), [Chromium forum checks](forums-chromium.json) and [Firefox forum checks](forums-firefox.json). CI includes the new check but was not run here. Three-person usability and physical-mobile acceptance remain outstanding.

Post-deployment verification: both browsers passed the full PIN/reset suite and forum checks through the live HTTPS origin. The live layout/accessibility suite passed widths 320–1440 with zero page errors, overflow or automated board violations. Six frontend files and both WASM modules match the local workspace hashes. Readiness returned ready. See the timestamped JSON reports above. Screenshot of blank PIN setup: [keypad](wallet-pin-keypad-chromium.png).

