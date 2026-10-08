# GUI implementation and deployment — October 7, 2026

The edited [GUI plan](../../GUI.md) is implemented in the current Hauntboard frontend and deployed at [the HTTPS beta](https://payroll-levels-sensitivity-bit.trycloudflare.com). UX-01 remains in progress because engineering checks do not establish human usability acceptance.

## Missing transaction module repair — 0.6.1-gui

The user reported `ENOENT` for `/app/hauntboard/web/transaction-identity.wasm` after the initial GUI deployment. Both 0.6.0-gui and its 0.5.9 base lacked this artifact. Initial wallet/layout verification did not exercise transaction identity and missed the packaging defect. This supersedes the initial deployment identity below.

The current deployed image is **`hauntboard-esmeralda-beta:0.6.1-gui`**, immutable ID `sha256:527f5d31e45cabe516aa0e9d46526a82852910bf569d858ee9d19aa5c59128c7`. The module was rebuilt from the local `hauntboard/transaction-identity/` source in the server Rust container `sha256:9cfd6ee624f965823bc42a1e97325b40da62b5f581c30dcea9b5fcb48aec9b83`. A stale lockfile was corrected to the manifest's existing pinned `tari_hashing = 6.0.1-pre.2`; Tari transaction 0.43.0 and BOR 0.16.2 remain pinned. The generated module and corrected lockfile are saved locally.

Transaction module SHA-256: `21de1772618576ca2cf980e8dc4c416350e1f88a299874f449adbe9b995d2bef`. Lockfile SHA-256: `31614c8fc3508d485ebda2b819b716ded031af6a7c815d9c0496d2d92f42b519`.

Both Dockerfiles now fail the build when either required WASM module is missing or invalid, or when transaction-identity exports are absent. Both CI jobs now build the transaction module before application/browser checks. CI has not been executed here. [Native identity regression evidence](transaction-identity-repair.tap) passes stable identity, malformed-input rejection, maximum-epoch extraction and equality with an already confirmed public board-creation transaction. The old test called an SDK function that was not exported; it now uses the SDK's supported sealed-JSON encoding API.

[Live GUI verification](gui-live.json) was rerun after repair in Chromium and Firefox, checking both WASM responses for successful HTTP status, `application/wasm`, valid modules and equality with local hashes, alongside the earlier layout/accessibility checks. Readiness remains ready. No public submissions or spending occurred. The new [repair deployment script](../deploy/deploy-gui-repair.sh) retains the tunnel and operation volumes; `.env.before-gui-0.6.1` contains the previous environment. That immediate previous GUI image still lacks the artifact; the initial base also lacks it, so either rollback restores the known module defect.

## Result

- Compact profile-aware header, readable feed, progressive row loading, individual retry and preserved content when providers fail.
- Explicit Create / Recover / Unlock wallet entry points, separate password and recovery steps, selected-word confirmation, collapsed advanced import options and a ready balance distinguished from reserved or quarantined outputs. Wallet setup returns to the preserved posting draft.
- Exact-content review with quote invalidation after editing, clear fee semantics and UTF-8 serialized byte limits. Publication remains gated by configured capabilities and wallet readiness.
- Persistent submission states distinguish preparation, review, submitted, unknown, indexing, rejected and confirmed. Reload reconciles the existing operation; a pending operation cannot cause an automatic second send. Confirmation requires the resulting content to be readable.
- History and filter restoration, parent-post jumps, reply sorting and cancellation, local hide with Undo, accessible dialog labels, keyboard focus and responsive controls. Secret demo drafts remain transient and have an explicit dismissal choice.
- Public schema-4 beta controls match the configured profile. Sealed invitations and tips remain local demo features, outside the public first-version path.

Source is retained locally under `hauntboard/web/`, with updated browser checks under `hauntboard/tests/`. Native wallet derivation, cryptography and recovery artifacts are inherited from the prior release; this pass adds a scan-status accessor without replacing those algorithms. The server source adds the missing static route for `output-ledger.mjs`, required by the existing wallet import.

## Initial 0.6.0 deployment identity and recovery (superseded above)

Server: `ubuntu@192.168.1.200`. Compose project: `hauntboard-tunnel`. Active release directory: `/home/ubuntu/hauntboard/releases/0.5.0`.

| Item | Value |
|---|---|
| GUI image tag | `hauntboard-esmeralda-beta:0.6.0-gui` |
| Running immutable image | `sha256:26331c00e454c96cbbccf6d3d3290823a3e48f2facebca9ff013b98f3e9a523f` |
| Verified base image, 0.5.9 | `sha256:3ce7aaeb4597b2d7100f48a6f06c0a166cb8c70ff4fedf54f199cef253f31cca` |
| Readiness after deployment | `/health/ready` returned `{"status":"ready"}` |
| Server build source | `/home/ubuntu/hauntboard/gui-build` |
| Previous environment backup | `/home/ubuntu/hauntboard/releases/0.5.0/.env.before-gui-0.6.0` |

The [GUI Dockerfile](../deploy/Dockerfile.gui) overlays local frontend and server source on the verified base. The [build script](../deploy/build-gui.sh) checks the base identity. The [deployment script](../deploy/deploy-gui.sh) checks the reviewed previous and candidate identities, backs up the environment and rolls back on failed readiness. It is a guarded one-time release script; a second execution after deployment intentionally fails its previous-image check.

Only app and preview services were recreated. The existing tunnel, network manifest and durable operation volumes were retained. To roll back from the release directory, restore `.env.before-gui-0.6.0` to `.env`, then run `docker compose --env-file .env -f compose.tunnel.yaml -f compose.beta.yaml up -d --no-deps app preview`. Preserve the tunnel and volumes.

## Verification and evidence boundaries

All toolchain verification ran in Docker on the server. Docker Desktop was not needed. Browser tooling used `mcr.microsoft.com/playwright:v1.63.0-noble@sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27`, with Playwright 1.63.0 and axe-core Playwright 4.10.2.

| Check | Outcome and scope |
|---|---|
| [GUI regression suite](gui-regression.json) | Nine grouped scenarios passed in Chromium and Firefox against actual frontend assets with simulated providers, wallets and submissions. Includes reload reconciliation, rejection/draft retention, exact review, retry, navigation, Unicode limits, secret dismissal, incomplete scans, keyboard menu and 200% layout zoom. Fixture checks do not prove chain compatibility. |
| [Live GUI verification](gui-live.json) | Both browsers passed widths 320, 390, 768, 1024 and 1440, zero horizontal overflow and zero page errors. Automated axe WCAG A/AA checks reported zero violations on the live board view. Six frontend assets and both WASM modules match the local source SHA-256 hashes. This is not a comprehensive accessibility certification. |
| Native wallet creation | [Chromium](native-wallet-create-chromium.json) and [Firefox](native-wallet-create-firefox.json) passed against the live HTTPS deployment. Standard CipherSeed, mandatory phrase confirmation and same-address recovery; phrases not sent to the server. |
| Native wallet import | [Chromium](native-wallet-import-chromium.json) and [Firefox](native-wallet-import-firefox.json) passed official fixture derivation, encrypted seed passphrase, account indices 0/7, mobile viewport import, mismatch preservation and existing recovery compatibility against the live deployment. |
| Balance UI | [Chromium](wallet-balance-chromium.json) and [Firefox](wallet-balance-firefox.json) passed live desktop/mobile layout, lock/reload/unlock and unavailable-provider behavior with unfunded generated wallets. |
| Output ledger | Three existing unit checks passed for scan resume beyond 1,000 outputs, reserved/quarantined funds, capacity checkpoints and unverified/cursor rejection. |
| Syntax | All uploaded browser test modules passed Node syntax checks. |

Live checks generated unfunded wallets and read public chain state. No public posts, spending or faucet claims were performed in this pass. Public posting privacy, full operational acceptance and hosted CI execution remain separate delivery gates. Earlier chain suites were not rerun here.

Public screenshots: [desktop](gui-live-desktop-chromium.png), [mobile](gui-live-mobile-chromium.png). Simulated content screenshots are named `gui-desktop-*` and `gui-mobile-*`; they are fixture evidence. Recovery words and private test vectors are excluded from these evidence files.

## Remaining acceptance

Run the plan's three first-time participant trials and a physical mobile-browser session, recording confusion and assistance without capturing secrets. Confirm comprehension of recovery, permanent publication, fee payment and unknown-outcome reconciliation. Automated viewport checks and simulated submissions do not substitute for these trials.

## Current coordinated release — 0.6.4-gui

[Wallet PIN/reset evidence](wallet-pin-reset.md) supersedes the above deployment identity: the current combined release adds six-digit PIN and wallet reset controls while preserving the other chat's forum/category work. Image: sha256:e5c08d722a730fa45df408563bd889c5872c6be9a247f9133e67ca06c6216227. Both WASM artifacts remain present. The original GUI and 0.6.1 repair records above are historical.

