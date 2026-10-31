# Sapient: resolve all five Hauntboard integration blockers

Historical proposal. Superseded by the user's decision to use unchanged stock Sapient; see [the implemented integration](stock-sapient-posting.md). No wallet fork or upstream remediation is required for that selected scope.

Prepared October 30, 2026. Status: implementation plan; fixes and acceptance evidence pending. This plan supersedes the future-work estimates in [the original integration plan](sapient-wallet-project-plan.md). The deployed connection-only integration remains unchanged.

## Outcome and scope

Deliver Sapient as Hauntboard's recommended wallet on tested compatible devices, with private-fee posts/replies, isolated posting change, restart-safe transaction recovery, explicit network/reset binding, and existing room-administration authority. All five blockers must pass before declaring this remediation complete. Retaining browser-wallet room administration is an interim measure, not completion of blocker five.

Keep the current browser wallet available throughout implementation and after release. Preserve existing boards, templates, rooms, invitations, registry authority, wallet records and pending operations. Do not migrate keys or funds to enable this integration. Contract changes are not planned; a demonstrated native co-signing limitation triggers a separate design review rather than an implicit authority migration.

The baseline is Hauntboard `9c7063c592b3072b91267cd86c586032426cef01`, Sapient `e2f7bf9772faa35c4bce55f5e2b741a37b38a36c` (0.6.17), and its resolved `@chironbuilder/ootle-sdk` 0.1.30. These are reviewed versions, not a claim about the latest release or installed store binary. [Recorded findings](sapient-wallet-implementation.md) identify the code paths. The [pinned provider types](https://github.com/chironbuilds/tari-wallet/blob/e2f7bf9772faa35c4bce55f5e2b741a37b38a36c/src/lib/messages.ts) establish the existing request boundary. Recheck upstream commits, SDK provenance and distribution at kickoff.

## Ownership and delivery route

There are three deliverables: an SDK change, a Sapient extension/provider change, and a Hauntboard integration. A VPS release can ship only the third; it cannot upgrade users' installed extension.

Prefer upstream-compatible changes with small reviewable patches. First identify the SDK's maintained source repository and reproducible package build; the npm package name alone does not establish a supported editable source tree. Develop against pinned source/lockfiles. If upstream acceptance or distribution is delayed, a maintained fork may support an explicitly opt-in test build, with distinct identity, license notices, reproducible artifacts and an update/security owner. Do not represent that fork as the official store release. Production promotion requires a supported distribution route, not merely working local code. No upstream message or publication is part of this planning change.

| Area | Responsible role | Deliverable |
|---|---|---|
| SDK | Wallet engineer | Signing mode, output policy, prepare/sign/seal lifecycle, native identity and co-signing primitives |
| Extension | Wallet engineer | Versioned provider protocol, approval UI, durable journal, recovery and network checks |
| Hauntboard | Application engineer | Adapter/controller, operation locks, action validation, recovery UX and room co-signing |
| Verification | Independent reviewer + QA | Native transaction inspection, fault-injection evidence and extension artifact review |
| Release | Maintainer/operator | Supported extension build, gated application release, VPS verification and rollback |

## Work package 1: remove persistent signing from ordinary posts

**Problem:** the reviewed generic private-fee route adds the fee signer while retaining the account signer.

Add an explicit, versioned posting authorization policy in the SDK. It must select the exact allowed signer set for an eligible operation: fresh transaction signer plus required one-time fee authorization, with no persistent owner transaction signature or named account input for ordinary posts/replies. Do not globally remove the account signer from generic execution: account withdrawals and other authorized actions still require it. Reuse native Tari signing/proof implementations and the behavior already exercised by Hauntboard's `stealth-fee.mjs`.

The extension must reject requests that require account authority while requesting the posting policy. Resolve and review the complete fee/main instruction layout before signing. Disable any retry that changes the approved transaction or silently adds an account signer. Required administrative authority is a separate declared signer policy; room administration cannot claim the same unlinkability as an ordinary post.

**Acceptance:** inspect serialized native post, reply and sealed-post transactions; persistent owner key/signature and named account input are absent, fee authorization is valid, and funded execution succeeds. Negative tests reject instructions needing undeclared authority. Regression tests prove ordinary account operations remain authorized correctly. Capability flags or UI mocks alone do not close this item.

## Work package 2: enforce posting-change isolation in the wallet

**Problem:** fee change enters the extension's general spendable ledger, outside Hauntboard's control.

Add a wallet-enforced output classification and selection policy. Posting change becomes `quarantined`; coin selection for subsequent private posts must exclude it, including after restart, rescan, fee-only commit, account switch and recovery. Store classification by wallet/account, network/reset and output identity. Write reservations and resulting change classification durably; record spent fee inputs and quarantine change even if the main phase fails.

Keep an encrypted, recoverable memo/classification mechanism compatible with native output scanning where feasible. A seed-only restore or imported account with incomplete history must not label unknown outputs posting-ready. Provide a separate recovery status and a way to restore policy records. Any deliberate use/release of quarantined funds is a separately reviewed operation with a clear linkage explanation; ordinary posting must never silently recycle them. Exhausted eligible funds produce a funding-required state, not policy relaxation. Quarantine can reduce available funds and does not remove the funding graph or timing exposure.

**Acceptance:** two consecutive posts cannot select the first post's change; test selection through every applicable generic/private-fee route, concurrent tabs, restart, scan, backup/restore and fee-only commit. Test lost classification metadata and insufficient eligible funds. No bypass through a different provider method or SDK retry is allowed.

## Work package 3: durable original transaction identity and recovery

**Problem:** a worker can stop after transmission but before recording the result, leaving no durable original native transaction identity for Hauntboard.

Split transaction preparation from network submission. After final co-signing/sealing, compute the native transaction ID locally using the supported Tari implementation. Before any network send, atomically commit the exact signed bytes, native ID, request/operation ID, approved action digest, network/reset binding, fee ceiling, signer policy and input reservations in the extension's durable storage. Verify that a successful storage commit precedes the transport call; if storage is unavailable, do not send.

Hauntboard creates and persists a logical operation ID before requesting approval. The extension scopes idempotency to origin, account, network/reset and operation ID; an identical request returns the existing record, while different action bytes conflict. Support lookup by operation ID as well as request ID so a lost create response is recoverable. Only the originating authorized site can read its records. Store sensitive payloads under appropriate local protection and exclude them from logs.

Use lifecycle states such as `awaiting approval`, `prepared`, `submitting`, `unknown`, `accepted`, `rejected` and `fee committed / main failed`. Prepared means the complete signed envelope and native ID are durable. On restart, reconcile the original ID and reservations. Transport errors, missing receipts, timeouts and request exceptions remain unresolved; they do not authorize a new spend. Exact-byte retransmission is permitted only after confirming native network idempotency semantics, and retains the same identity. A replacement requires a resolved original outcome, accounted fees and a fresh explicit review. No hidden fee-spending replacement attempts.

Hauntboard stores the mapping and locks the logical operation across tabs and both wallet adapters. Switching wallets never restarts an unknown operation. Extension uninstall/storage loss remains a residual risk: provide an encrypted recovery export where supported and retain the known native ID in Hauntboard; never interpret missing local data as chain rejection.

**Acceptance:** terminate the worker before/after durable commit, before send, during send, after chain acceptance and before acknowledgement; lose create/submit responses; repeat requests concurrently; restart browser; fail the indexer; retain receipts while transaction bodies disappear. Every transmitted operation has a recoverable original ID, exact bytes and reservations. At most one distinct submitted transaction is authorized per approval. Fee-only outcomes preserve spent inputs and quarantine. Recovery performs no replacement spending.

## Work package 4: bind the actual network/reset context

**Problem:** a network name cannot distinguish successive Esmeralda resets.

Define a versioned network-context response carrying network name/byte, explicit reset identity, and available verifiable chain context. Hauntboard's reset string is operator-pinned: merely echoing a dApp-supplied label is not verification. During the initial protocol spike, identify the native chain/checkpoint/genesis or other independently checkable anchor actually supported by the selected SDK/indexer. Do not invent an unavailable genesis API.

If a native reset identifier is unavailable, define an explicitly operator-pinned profile and verify the expected deployed board/template/registry identities and state against the wallet's selected backend before allowing signing. Document that this is configured provider validation, not independent consensus verification. An ambiguous mapping keeps writes blocked. Bind the resulting profile digest into the local approval/journal contract and use the native transaction's supported network domain. Do not claim an app-only reset label is consensus-enforced.

Recheck context immediately before signing and submission. Network/backend changes invalidate unsigned approvals and prevent sending prepared transactions to a different profile. Recover existing transactions against their original profile. Namespace output ledgers, reservations, request records and operation locks by reset.

**Acceptance:** same network name with a different reset is rejected, as are wrong network byte, wrong target/template, stale context and a backend change after review. A matching string without checked backing context fails. Test old pending operations across a reset without sending them to the new chain.

## Work package 5: preserve room-admin authority through co-signing

**Problem:** existing room registry operations require a separate browser-held admin signer, and the reviewed interface cannot accept that signature.

Prototype the native signing protocol first. Establish precisely what each signer commits to and whether the SDK can assemble signatures independently without changing the signed message. Use the same native signing machinery as the current `extraSigners` path. Never implement custom cryptography or export the registry private key to the extension.

The proposed flow is: extension resolves inputs, fee and final action; Hauntboard validates the complete canonical transaction and expected registry action; the browser signs only with the existing registry authority; the extension verifies the declared public key/signature, completes its required signatures, seals, computes final identity and journals before sending. If native signature assembly requires another ordering or rounds, document and test that protocol before adoption. Prepared co-signing data and the final sealed native ID are distinct; only the latter is a submission identity.

Bind co-signing to origin, request, network/reset, expected registry/component, exact arguments, fee ceiling and expiry. Reject any instruction/input/fee/network mutation after the admin review. Limit public keys and signatures to the operation that needs them. Do not add the registry signer to ordinary posts. Maintain existing invitation, recovery and authority ownership semantics.

**Acceptance:** create/register, grant, revoke and supported registry updates succeed with the existing authority; wrong/missing admin signatures and mutated transactions fail. Test restart during co-signing and recovery after submission. Existing room backups still work; private keys never cross the provider boundary. If native co-signing is not feasible, this blocker stays open pending an explicit revised architecture decision.

## Proposed protocol contract

Names below describe new requirements, not APIs available today. Prefer extending existing request methods with a versioned schema over exposing arbitrary signing to websites.

| Protocol element | Required semantics |
|---|---|
| Capabilities/profile | Explicit protocol version and supported authorization, quarantine, durability, network-context and co-signing policies |
| Approval request | Origin-scoped operation ID, account, checked profile digest, canonical action digest, exact fee bound and policy requirements |
| Prepared co-signing response | Canonical transaction data, declared signer set, review digest and expiry; no seed/view/admin secrets |
| Submit | Idempotent against approved operation and final sealed bytes; fails if required guarantees are unsupported |
| Recovery lookup | By operation/request ID; original native ID, durable state, fee/main result and receipt references |

Capability claims are necessary but insufficient. Maintain tested protocol/artifact compatibility and reject unsupported versions. A provider-controlled version string is not cryptographic attestation of extension provenance; retain artifact review and state this trust limit. No spend-method allowlist expansion in `sapient-wallet.mjs` until these behaviors exist and pass tests.

## Implementation sequence and effort

Estimates are engineer-days including targeted tests, not promised calendar dates. They replace the earlier 9–16 day estimate, which excluded most wallet-side remediation.

| Milestone | Effort | Dependency and exit condition |
|---|---:|---|
| M0: source/protocol/native feasibility | 3–5 | Pin SDK/extension builds; prove native signer assembly, identity computation and network binding design; choose supported distribution route |
| M1: signer policy and output isolation | 5–8 | M0; work packages 1–2 pass SDK/native fixtures and recovery tests |
| M2: durable request lifecycle | 5–8 | M0; work package 3 passes worker/storage/transport fault injection, integrates M1 ledger |
| M3: network context | 2–4 | M0; work package 4 gates preparation, signing, submission and recovery |
| M4: room co-signing | 4–7 | M0 feasibility, M1–M3 primitives; work package 5 passes native authority tests |
| M5: Hauntboard adapter and UX | 4–6 | Protocol stable; shared action/controller, cross-wallet operation locks, review/status/recovery and room flows implemented |
| M6: independent review and real execution | 4–6 | M1–M5; inspect native bodies, execute authorized tests and verify installed artifact |
| M7: distribution and VPS rollout | 1–2 | All gates green; limited beta, verified release/rollback and operational handoff |

**Total: 28–46 engineer-days**, plus upstream review, extension distribution and any remediation found in independent review. Allow roughly 6–10 working weeks for one engineer with reviewer availability; external waits can extend this. Separate wallet/application contributors can overlap work once the protocol is stable, but should not shortcut the dependency gates. Record a go/no-go at M0; unresolved native signing or network binding gets a named technical decision, not a cosmetic removal of the blocker.

Hauntboard change targets: `web/sapient-wallet.mjs`, `web/wallet-options.mjs`, a wallet controller/operation journal, `web/app.mjs`, `web/room-manager.mjs`, and existing native identity/fee/ledger helpers where reuse is valid. Extend provider unit tests, GUI tests, room tests and release CI. Run SDK, Node, Rust and browser toolchains in containers. Mock-provider tests establish app behavior; real extension/native tests establish integration behavior.

## Release, VPS and rollback

Keep current production spending gates closed while building. Produce pinned SDK/extension artifacts and a compatibility matrix before application promotion. Verify actual installed extension builds on supported Chromium; separately retain Firefox/mobile/browser-wallet fallback. An unsupported extension remains connection-only with actionable version information.

Use three stages: internal test artifact, limited opt-in desktop beta, then recommended wallet for compatible new users. Preserve existing wallet selections. Capture full transaction evidence promptly before body retention expires, excluding keys and sealed plaintext. Ordinary posts must pass all relevant signing, isolation, recovery and reset gates; full remediation additionally requires room-admin parity. Preserve honest compatibility/privacy flags until their own evidence requirements pass.

Funded public-chain validation requires explicit target network/reset, test account and maximum budget under repository instructions. Plan isolated localnet testing first if the extension can support it; public Esmeralda acceptance remains separate. Site deployment authorization does not supply a chain-spending budget.

For the existing VPS at `hauntboard.taritracker.com`: release through the tested main/release/private-deploy pipeline; back up environment, network manifest, current image and operations volume; verify any manifest migration explicitly. Preserve board/template/registry/reset and all pending records. Check readiness, exact public JS/CSS assets, extension connection, posting review and recovery behavior. Site smoke tests must not create paid transactions automatically. A VPS health check alone does not close a wallet gate.

Rollback disables new Sapient request creation/recommendation while retaining lookup/recovery for existing requests and preserving journals/output labels. Use a compatible prior image or forward fix; schema migrations must remain readable by the rollback recovery path. Never roll back output classifications by restoring stale spend state, replay unknown requests through the browser wallet, or delete pending operations.

## Completion evidence and remaining risks

Maintain one evidence row per blocker containing SDK/extension/app commits, artifact hashes, exact network/reset, test IDs, transaction/receipt references where applicable, reviewer and outcome. A blocker closes only with its acceptance evidence. Publish a release decision distinguishing source review, simulated tests, native execution and public-network results.

Success means all five acceptance sets pass, supported users can post and administer existing rooms using Sapient, interrupted operations recover without duplicate spending, and the VPS serves the verified app without losing state. The fallback remains available for unsupported devices; it is not the resolution of an open blocker.

Residual risks remain: site access to browser-held room authority and fallback wallet keys; compromised extension updates; restored wallets missing historical privacy labels; provider/indexer trust; funding ancestry and timing linkage; and public immutable post metadata. Quarantine and signer changes reduce specific linkage, not all linkage. Document these honestly instead of promising anonymity. Upstream maintenance and extension distribution are ongoing dependencies with named owners.
