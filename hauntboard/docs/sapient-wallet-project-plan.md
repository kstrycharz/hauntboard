# Hauntboard: Sapient primary wallet implementation plan

Follow-up: [the five-blocker remediation plan](sapient-remediation-plan.md) specifies wallet/SDK changes, full room-admin parity, acceptance evidence and revised estimates. Its future-work scope and estimates supersede those below; the historical fallback decision remains accurate.

Prepared October 30, 2026. Status: fallback decision implemented after P0 source review found promotion blockers. See [implementation findings and shipping behavior](sapient-wallet-implementation.md). The phases below remain the roadmap for a future spending integration after upstream gaps are resolved; funded-chain validation has not been performed.

## Decision

Make **Sapient the recommended wallet for compatible desktop users**, through its injected Tari provider. Retain the current Hauntboard browser wallet as an explicitly selected fallback for unsupported browsers/devices, missing provider capabilities, and operations that Sapient cannot safely authorize. Promote Sapient only after privacy, transaction recovery, and compatibility gates pass. If those gates fail, ship the current wallet as the default and record the failed gate and residual risks.

Integrate the extension rather than copying its seed custody into Hauntboard or replacing the application with the wallet repository. Reading the board remains wallet-free. Existing schema-4 boards, post formats, invitation backups, wallet records, and pending operations must survive the change.

The initial target remains the configured **Esmeralda testnet/reset**. Mainnet and participant deposits are outside scope. This document authorizes no deployment, contract publication, or funded transaction.

## Evidence and baseline

Upstream reviewed at commit [`e2f7bf9772faa35c4bce55f5e2b741a37b38a36c`](https://github.com/chironbuilds/tari-wallet/tree/e2f7bf9772faa35c4bce55f5e2b741a37b38a36c), manifest/package version **0.6.17**. This is the reviewed source version, not verification of the Chrome Web Store binary or its availability on every device.

| Finding | Evidence | Planning consequence |
|---|---|---|
| Sapient exposes `window.tari`, provider announcements, account-change events, and persisted transaction requests | [Injected provider source](https://github.com/chironbuilds/tari-wallet/blob/e2f7bf9772faa35c4bce55f5e2b741a37b38a36c/src/content/inject.ts), [provider reference](https://github.com/chironbuilds/tari-wallet/blob/e2f7bf9772faa35c4bce55f5e2b741a37b38a36c/docs/integration/provider-api.md) | Add a provider adapter and capability checks; do not infer support from a wallet name |
| Generic instruction requests accept `feeType: "private"` plus `enforceFeeType: true`; private fees require a suitable local account | [Request types](https://github.com/chironbuilds/tari-wallet/blob/e2f7bf9772faa35c4bce55f5e2b741a37b38a36c/src/lib/messages.ts), [background implementation](https://github.com/chironbuilds/tari-wallet/blob/e2f7bf9772faa35c4bce55f5e2b741a37b38a36c/src/background/index.ts) | This is the preferred posting route; test actual transaction signatures, inputs, and change behavior before claiming equivalent privacy |
| Submission is claimed atomically, but a service-worker interruption can strand a request in `submitting`; execution exceptions become `failed` | [Submission implementation](https://github.com/chironbuilds/tari-wallet/blob/e2f7bf9772faa35c4bce55f5e2b741a37b38a36c/src/background/index.ts), [transaction lifecycle](https://github.com/chironbuilds/tari-wallet/blob/e2f7bf9772faa35c4bce55f5e2b741a37b38a36c/docs/architecture/transaction-lifecycle.md) | Request status is not authoritative proof of chain rejection. Do not follow the documentation's suggestion to recreate a stranded request until the original outcome is resolved |
| SDK execution documents reactive submission retries | [Transaction lifecycle](https://github.com/chironbuilds/tari-wallet/blob/e2f7bf9772faa35c4bce55f5e2b741a37b38a36c/docs/architecture/transaction-lifecycle.md) | Inspect the exact transitive SDK and measure attempts/fees; one approval must not silently authorize unbounded replacement spends |
| Chrome Manifest V3 extension; minimum Chrome version 111 | [Manifest](https://github.com/chironbuilds/tari-wallet/blob/e2f7bf9772faa35c4bce55f5e2b741a37b38a36c/manifest.json) | Treat Chromium as the first extension target; Firefox, Safari, mobile, and embedded contexts require separate support decisions |
| MIT license and published self-audit material | [License](https://github.com/chironbuilds/tari-wallet/blob/e2f7bf9772faa35c4bce55f5e2b741a37b38a36c/LICENSE), [security review](https://github.com/chironbuilds/tari-wallet/blob/e2f7bf9772faa35c4bce55f5e2b741a37b38a36c/SECURITY_AUDIT.md) | Preserve notices for reused code; self-audits do not establish an independent security audit |

Local source baseline: Hauntboard commit `a401746335f0371d281d3a7bb558d62b3f4b18df`, plus existing untracked receipt evidence reviewed read-only. The current browser SDK manifest pins Ootle/indexer/secret-key-wallet **0.11.1** and WASM **0.47.0**. Sapient's manifest declares Ootle packages **^0.10.0**, WASM **^0.47.0**, and `@chironbuilder/ootle-sdk` **^0.1.30**. Resolve the upstream lockfile and transitive implementation in the spike; shared WASM numbers do not prove ABI or network compatibility. Older architecture documentation lists historical 0.7.0/0.43.0 pins and must not drive this integration.

Local source entry points:

- [Browser wallet](../web/browser-wallet.mjs): custody, recovery, balance scanning, review, submission, and additional room-admin signer.
- [Stealth fee builder](../web/stealth-fee.mjs): ephemeral fee signer, no persistent owner transaction signature on the posting path, reviewed fee ceiling, posting-change memo.
- [Output ledger](../web/output-ledger.mjs), [transaction identity](../web/transaction-identity.mjs), and [relay](../lib/relay.mjs): spend tracking and recovery.
- [Application](../web/app.mjs) and [room manager](../web/room-manager.mjs): direct browser-wallet coupling that must be routed through a wallet controller.
- [Network profile](../web/network-profile.mjs): network byte and reset namespace.
- [Room access guide](room-access.md): separate room-access recovery and administration lifecycle.
- Locally reviewed October 30 receipt evidence (separate, uncommitted investigation): transaction bodies can be unavailable while committed receipts remain available. One recorded independent value-proof check failed; do not present provider `verified: true` as independent proof verification.

## Target architecture and responsibilities

Introduce a small wallet controller with two adapters:

1. **Sapient / injected Tari adapter:** discover/select a provider, connect, check network and capabilities, request transaction approval, submit once, and reconcile. Seed storage, private signing material, coin selection, and wallet recovery stay in the extension.
2. **Existing browser-wallet adapter:** wrap the current implementation and retain its local custody, PIN/phrase recovery, output ledger, durable signed-envelope relay, and supported room-admin signing.

Both adapters consume the same canonical Hauntboard action: target component/template, exact encoded arguments, post UID/nonce, parent/page context, network/reset, maximum fee, and reviewed payload fingerprint. Share contract instruction construction where practical; keep signing/submission mechanics adapter-specific. Bind quotes to provider instance, account, network/reset, exact action, and expiry. Account/network changes invalidate unsigned reviews.

The companion continues serving configuration, board reads, receipts, and current-wallet relay traffic. Sapient submits through its own provider; the existing server journal cannot be claimed to protect an extension transaction that never passes through it. A server shadow record is not a substitute for persisting the exact signed transaction inside the signer.

Do not add the remotely hosted connector script to the first release merely to obtain Sapient: the extension already injects its provider. Tari Universe embedding is an optional later scope, with separate origin/CSP review and a pinned connector asset if adopted. Preserve the page's current framing policy until embedding is deliberately supported.

Proposed modules: `web/wallet-controller.mjs`, `web/wallet-adapters/sapient.mjs`, `web/wallet-adapters/browser.mjs`, and `web/wallet-operations.mjs`. These are implementation targets, not files created by this plan.

## User flow and fallback policy

| Situation | Product behavior |
|---|---|
| First wallet choice on a compatible desktop | Recommend **Connect Sapient**; offer **Use browser wallet** alongside it |
| Existing browser-wallet user | Preserve their selection and saved wallet; offer Sapient without migrating funds or importing words |
| Extension missing | Offer the verified installation link and the current wallet; browsing still works |
| Extension locked, connection rejected, or view access declined | Explain the relevant state; retain the selected wallet; no automatic second-wallet prompt |
| Wrong network or unsupported reset | Block signing until the configured profile is verified |
| Private fees unavailable or cannot be enforced | Offer the current wallet explicitly; do not switch posting to a transparent fee |
| Transaction submitting, outcome unknown, or receipt not yet found | Show **Check transaction status** and retain original identity; block a replacement submission through either adapter |
| Operation requires an unsupported room-admin signer | Before spending, explain that this action needs the browser wallet; preserve Sapient for supported actions |

Never request a Sapient seed in Hauntboard. Connecting does not transfer the existing browser wallet's funds. Keep balances clearly attached to the selected wallet. Sapient's password, Hauntboard's device PIN, and room-access recovery code remain distinct credentials.

Private balance visibility is optional and separately consented. A withheld balance is **hidden**, not zero. Posting should not require broad private-view permission if the wallet can privately select a fee output itself. If an amount is displayed, distinguish revealed funds, private funds, and verified posting readiness; a total balance alone does not establish readiness.

Public posts remain public and persistent. Sealed-room payloads are encrypted in Hauntboard before the wallet request, with titles and metadata still public. Wallet recovery does not restore room invitation keys, pending operations, or all privacy bookkeeping.

## Work packages and estimates

Estimates are engineering effort for one developer familiar with this repository, with reviewer/QA help at the gates. They are not calendar commitments. Execute sequentially where dependencies apply; upstream changes and public-chain authorization can extend elapsed time.

| Phase / owner | Effort | Deliverable | Acceptance / dependency |
|---|---:|---|---|
| P0: compatibility and safety spike / integration engineer | 2–3 days | Pinned compatibility matrix, exact API/SDK review, minimal extension harness, go/no-go record | Must resolve private-fee signing, change selection, ambiguous submission, reset verification, and room-admin limitations before primary promotion |
| P1: adapter boundary / frontend engineer | 1–2 days | Wallet controller, shared action representation, existing-wallet wrapper | Existing posting/recovery/room tests still pass; no contract changes; depends on P0 design |
| P2: Sapient connection and wallet UX / frontend engineer | 1–2 days | Discovery, connect/disconnect, capability checks, optional balances, explicit selection and install/fallback flow | Correct behavior on rejection, lock, account change, unsupported device, and network mismatch; depends on P1 |
| P3: posting and reconciliation / integration engineer | 2–4 days | Private-fee post/reply requests, persistent operation mapping, receipt lookup, interruption recovery | No silent transparent fee or replacement spend; fee-only commit and restart tests pass; depends on P0/P2 |
| P4: rooms and recovery compatibility / integration engineer + reviewer | 1–2 days | Sealed-post parity, admin-operation routing, backup/restore guidance | No lost invitations, recovery material, or pending registry operations; unsupported signer boundary explicit |
| P5: release verification and staged rollout / QA + maintainer | 2–3 days | Browser/extension evidence, authorized chain evidence, release checklist, rollback artifact | All promotion gates pass; restore and fallback demonstrated |

**Planning total: 9–16 engineer-days** for a gated first release with the existing wallet retained for unsupported room administration. Full Sapient room-admin parity or signer-side durability changes require a separate estimate after P0. Set a hard checkpoint at the end of P0: if a blocking gap requires uncertain upstream work, keep the browser wallet primary and record Sapient as experimental or deferred. This avoids making the Hauntboard release depend on an unbounded wallet rewrite.

## P0 questions that determine feasibility

1. **Exact posting request.** Exercise generic `instructions` with `feeType: "private"`, `enforceFeeType: true`, bounded `maxFee`, and validated component inputs. Use the wallet to build fee proofs; do not pass Hauntboard's raw stealth fee instruction or secrets into the provider. Check nested argument encoding, thread creation, replies, page rollover, and stale inputs against the actual deployed ABI.
2. **Privacy parity.** Inspect full signed transactions before body retention removes them: no persistent owner signature or named account input on ordinary posting, expected fee UTXO authorization, correct fee/main layout, and bounded fee. A private-fee capability flag alone does not establish these properties. Check if automatic fee coin selection can reuse posting change. Hauntboard currently quarantines it; an app-only blacklist cannot constrain a wallet that does not expose coin-selection controls. Require an enforceable wallet policy or retain the current wallet for this privacy mode.
3. **Durability and retries.** Inspect resolved `@chironbuilder/ootle-sdk` code and all error paths. Determine when the native transaction ID and exact envelope are persisted relative to network submission, how a restarted worker recovers them, and whether a `failed` request can still have spent a fee or committed. Establish an aggregate fee/attempt bound. If signer-side identity is unavailable after an ambiguous send, obtain an upstream fix or defer primary promotion. Do not work around it by recreating requests or falling back to another wallet.
4. **Network identity.** `tari_getNetwork` returns a network name, while Hauntboard pins a reset namespace too. Verify a trusted configured network/reset marker, expected board/template, and selected provider context; name matching alone is insufficient. If the wallet does not expose enough context, define and test a suitable handshake before enabling writes.
5. **Room administration.** Current registry writes use `extraSigners: [registrySigner]`, a browser-held room-admin key independent of the funding wallet. The reviewed public generic request type has no equivalent external co-signer/envelope interface. Treat full parity as unproven. Initial release routes these actions explicitly to the current wallet before constructing a spend. An upstream co-signing proposal must preserve room-admin authority and review the final instruction layout; do not export admin secrets to the extension or silently bind administration to a persistent wallet account.
6. **Distribution and providers.** Verify actual installed store version, package provenance, extension permissions, dependency lockfile, configured indexers, and supported browsers. Match tested capabilities to the installed artifact. Runtime capability checks remain necessary because consumer extension updates cannot be pinned by Hauntboard.

## Transaction lifecycle and recovery contract

Use `tari_createTransactionRequest` → `tari_getTransactionRequest` → `tari_submitTransactionRequest`, with one explicit user approval in the wallet. Immediately persist the returned request ID. Record a local operation ID and exact logical action before request creation so that a lost create response is recoverable as an unresolved approval flow rather than an invitation to create duplicates.

Journal the adapter/provider identity, account, network/reset, target, nonce/UID, payload fingerprint, review version, fee ceiling, request ID, native transaction ID when available, timestamps, and final receipt. Keep plaintext sealed content and secrets out of diagnostics; journal sensitive action data only under the existing appropriate local protection. Preserve the exact signed envelope at the signing boundary when the provider supports it; do not fabricate parity where it does not.

Model application states as `draft → reviewed → approval pending → approved → submitting → outcome unknown / committed / rejected → indexed`. A wallet's `submitted` is not application finality. A wallet's `failed`, a timeout, a provider 404, or an expired local request after execution started is not proof of chain rejection.

Reconciliation checks the original request and native transaction, then available permanent receipts and expected board/thread state. A matching post nonce/payload can establish that the intended post exists; it cannot identify every fee charged by hidden retry attempts. A receipt that establishes commitment does not reconstruct missing signatures or independently prove posting privacy. Record full privacy evidence promptly and retain public transaction/receipt artifacts with hashes.

On unknown outcomes, freeze replacement spending for that operation across adapters. A definitively rejected transaction can still have committed its fee phase: reconcile spent fee inputs/change first, display actual charges, then obtain fresh review for a new attempt. Preserve the original intent and evidence. On account change, keep the original operation tied to its old account; invalidate only unsigned reviews. On reload, resume status lookup without new approval/spending.

## Risk register

Ratings indicate launch priority, not measured probabilities.

| Risk | Severity / path | Mitigation and residual exposure |
|---|---|---|
| Wallet request loses native identity after ambiguous submission; duplicate fee spend on retry | Critical / Sapient | Promotion blocker until signer-side persistence/recovery is proven; preserve request ID, block replacement across adapters. A frozen unknown operation is safer but may need manual resolution |
| Automatic retries commit fees repeatedly or reuse committed fee change | High / Sapient | Inspect exact SDK, record attempt IDs and fees, bound total charge, test fee-only commit. Requires wallet support where app cannot enforce policy |
| Persistent signature/account input or automatic change reuse weakens poster unlinkability | High / Sapient | Inspect real transactions and consecutive posts; require enforceable privacy controls. Do not claim anonymity on either path |
| Room-admin co-signing unavailable | High / Sapient | Explicit operation-specific current-wallet route. Full replacement requires additional wallet API/security work; do not change registry authority casually |
| Site compromise reads an unlocked browser wallet's keys or tampers with signing | High / current-wallet fallback | Retain CSP, reviewed dependencies/assets, local locking, and client-only secrets. Same-origin execution remains a larger custody exposure than moving seed custody into an extension |
| Six-digit PIN and copied encrypted browser data permit offline guessing | High / current-wallet fallback | Review actual KDF and unlock protections, offer stronger credentials where appropriate, explain local-device scope. UI attempt limits alone do not protect a copied database |
| Browser storage eviction, profile reset, or incomplete backup loses operational state | High / current-wallet fallback | Test recovery and encrypted backups, retain pending journals, distinguish seeds from room keys and change quarantine state. Seed recovery alone does not restore every pending intent/privacy label |
| Indexer omissions, bounded scan, missing transaction bodies, or proof mismatch | High / both | Preserve receipt-aware reconciliation, bounded/resumable scans and evidence. Distinguish provider assertions from independent verification; unresolved proof failures remain visible |
| Malicious or vulnerable extension update / transitive dependency change | High / Sapient | Verify installation source/version and reviewed source/lockfile; capability gate, staged rollout, kill switch. Hauntboard cannot pin automatic consumer extension updates |
| Recovery words derive a different address/account across implementations | High / both | No automatic seed migration. If a user independently imports, verify seed format, passphrase, account index, address, and network with test fixtures. Connecting does not move funds |
| Unsupported browser/mobile or unavailable extension | Medium / Sapient | Explicit current-wallet fallback with supported-device guidance; test Firefox/mobile fallback separately |
| Wrong reset/network signs against incompatible state | High / both | Validate network/reset plus target ABI before signing, namespace all journals/storage, invalidate stale reviews |
| Fallback adds two balances and conflicting pending operations | High / both | Clear active-wallet label, separate storage namespaces, shared logical-operation lock, explicit selection; never automatic spend failover |
| Shared funding origin, public fee/timing, provider IP observations, and public post metadata | High / both | Accurate privacy copy; retain change isolation where supported. Neither wallet removes funding graphs, timing, provider trust, or public content exposure |

If Sapient is deferred, the fallback release note must explicitly retain the browser wallet's site-origin custody risk, PIN/offline-guessing concern, storage/recovery limitations, scan/provider dependence, and existing testnet verification limitations. Passing existing tests does not eliminate these risks.

## Verification and release gates

Run development toolchains, SDK builds, browser tests, and Tari binaries in containers under repository rules. Preserve named volumes and leave sibling Tari snapshots read-only. Use targeted tests for changed boundaries, plus existing wallet, transaction-identity, relay, sealed-room, and registry regression coverage. A mocked provider establishes UI/state behavior only.

Required acceptance evidence:

- Extension absent/late injection, multiple announced providers, locked wallet, rejection, disconnect, revoked view grant, account switch, and wrong network/reset.
- Real extension approval, enforced private-fee selection, native ABI arguments, fees displayed before signing, post/reply/page rollover, exact nonce reuse and conflicting retry rejection.
- Reload before approval, after approval, and during submission; service-worker restart during send; duplicate clicks/tabs; dropped acknowledgement; offline/lagging indexer; unavailable transaction body with surviving receipt.
- Definitive main-phase failure with committed fee/change; no automatic replacement; bounded wallet retry charges; original signed identity recovered after interruption.
- Consecutive posts inspected for owner signatures, account inputs, and fee-change ancestry. Retain exact tested artifact/source versions and full transaction evidence; mocks and balance recovery do not prove privacy.
- Existing browser-wallet create/import/unlock/backup/restore/PIN behavior, funds preparation, change quarantine, and pending operation preservation.
- Sealed-room read/post, access restore, invitation/grant/removal, extra-admin-signature routing, and recovery on another browser. Wallet words never substitute for the access backup/code.
- Chromium extension path and Firefox/mobile current-wallet fallback, including keyboard access and readable approval/status/error copy.

Funded tests require an explicitly authorized network, account, and maximum budget. Prefer isolated localnet where supported; the extension's documented network interface lists Esmeralda/Igor, so localnet support must be established rather than assumed. Public Esmeralda execution is a separate acceptance gate. No source review in this plan substitutes for it.

Promotion checklist: all critical risks resolved; no unexplained fee retry or privacy regression; stable recovery from unknown outcomes; privacy claims match evidence; room-admin limitation disclosed; current wallet remains available; deployed board/template/reset and pending operation formats preserved; independent reviewer signs off on results. Keep existing compatibility flags honest.

Roll out behind operator controls such as `sapientEnabled` and `recommendedWallet` (proposed names). Start with internal opt-in, then a limited desktop beta, then recommend Sapient to new compatible users. Preserve established users' wallet choice. Track only non-sensitive failure categories/version/capability results, without addresses, amounts, room identifiers, content, or keys.

Rollback: stop recommending/creating new Sapient requests, retain status recovery for existing requests, restore the previous application image if needed, and keep all wallet/relay/operation storage. Rollback cannot undo a chain spend, retract an immutable post, or cancel an already approved/submitted extension operation. Never prompt users to replay pending Sapient transactions through the browser wallet.

## Completion criteria

The project is complete when Hauntboard recommends Sapient on tested compatible devices, supported posts/replies pass real-chain privacy and recovery gates, unsupported operations/devices have a clear tested current-wallet path, and release documentation records exact versions, evidence, costs, and remaining risks. If the spike cannot establish these guarantees, completion of the fallback decision means retaining the current wallet as primary and documenting the concrete Sapient blockers; an experimental connection button alone is not completion of the primary integration.
