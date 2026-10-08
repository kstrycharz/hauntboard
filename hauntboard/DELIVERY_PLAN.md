# Hauntboard testnet delivery plan — VPS and Docker

Baseline: October 6, 2026. Owner: Kyle. Delivery target: public testnet beta hosted on one Linux VPS using Docker Compose, plus a portable local client. This document governs delivery sequencing and supersedes conflicting older proposed limits or wallet deferrals in PIVOT_PROJECT_PLAN.md. The original baseline is a planning/source review; fresh implementation evidence is linked below. Public beta delivery remains unaccepted.

October 6 owner clarification: the intended first version is a publicly readable imageboard with private poster identity. Secret-thread content encryption does not satisfy that requirement. The current schema-3 candidate records the transaction signer and the browser fee path touches a persistent owned account, so it must not be published or accepted as an anonymous-posting release. Resolve the poster privacy design and measure its exposure before freezing a new contract candidate. See [poster privacy review](POSTER_PRIVACY.md).

## First-version scope and fresh privacy evidence

The owner has now selected poster privacy as the primary technical investigation. First-version acceptance is **public threads/replies, no stored author identity, participant-owned native stealth fee posting and encrypted wallet recovery**. Sealed invitations and participant tips remain preserved demo features and are outside the first-version shipping path. This supersedes older sealed-thread/tip acceptance requirements below; historical baselines remain useful evidence, not current release scope.

A separate schema-4 contract stores no author fields and rejects sealed modes. Five native tests pass on released engine 0.45.0, including maximum history and signer-independent retry behavior. Actual isolated-localnet posting uses maintained Tari stealth cryptography, no persistent owner signature and no named account input. Chromium and Firefox verify public reads without a wallet, coin recovery, stale-tab state preservation, change quarantine and lost-response reconciliation. See [POSTER_PRIVACY.md](POSTER_PRIVACY.md), [public contract release](template-public/RELEASE.md) and [GitHub generation](deploy/GITHUB.md).

The new candidate supersedes the schema-3 artifact for publication. Public readiness fails closed until schema-4 public compatibility and poster-privacy evidence are explicitly recorded. The native engine is 0.45.0; the running isolated test network is 0.43.0. Actual Esmeralda participant posting verification, hosted CI and full operational acceptance remain open. Publication and hosted beta evidence are now recorded below. No complete anonymity or post unlinkability claim is made.

## Smart contract consulting update — October 7

The [contract review and fix register](docs/smart-contract-review.md) defines SC-01 through SC-08, their priorities, invariants and exit tests. This pass reviewed source and recorded evidence; it did not rerun contract tests or execute transactions. The active backlog and release gates below now follow public schema 4, participant-owned native stealth fees and seed-phrase recovery. Older baseline observations remain historical.

Existing [Esmeralda deployment evidence](evidence/esmeralda-deployment.md) records contract publication, board creation and a hosted beta; [public recovery evidence](evidence/esmeralda-public-wallet-recovery.json) records a same-address, same-funds fresh-browser recovery. Public posting privacy verification remains open. Neither record establishes full release acceptance. Prefer inspecting an owner-created confirmed posting transaction to creating new public test content.

## Implementation status — reconciled October 7

Fresh evidence and remaining acceptance gaps: [implementation record](evidence/delivery-implementation.md). Deployment artifacts: [VPS runbook](deploy/RUNBOOK.md), `../compose.hauntboard.vps.yaml`, `../compose.hauntboard.client.yaml`, `../infra/docker/hauntboard.Dockerfile`. These do not imply a public deployment.

| ID | Status | Current result / remaining gate |
|---|---|---|
| NET-01 | In progress | Both public providers verified the published schema-4 board; public faucet funding and phrase recovery are recorded. Freeze exact runtime/client/artifact identity and finish participant posting compatibility evidence. |
| WAL-01 | In progress | Browser phrase creation, native derivation and public faucet funding are recorded. Public participant fee-spend/posting acceptance remains open; verify SC-02/04 without exposing keys. |
| WAL-02 | In progress | Recorded fresh-browser public phrase recovery verifies the same address and funds. Pending-operation recovery, scan limits, concurrent devices and post-recovery public posting remain acceptance work under SC-08. |
| NET-02 | In progress | Schema-4 publication and board creation are confirmed in recorded Esmeralda evidence. Five native tests are recorded. Public posting/rollover/fee evidence and expanded SC-03/05/06/07 validation remain open; no automatic republication. |
| PRIV-01 | Evidence ready locally | Native one-time stealth fee spending omits persistent owner key/account; no-author schema 4, Chromium/Firefox recovery and quarantine pass. Actual Esmeralda proof remains open. Tips are outside V1. |
| OPS-01 | In progress | Non-root application image, HTTPS Compose/proxy, independent loopback client profile, provider/origin validation, request bounds and distinct health routes implemented; read-only image smoke passes. Hosted beta smoke evidence is recorded; full VPS operational acceptance remains open. |
| OPS-02 | In progress | Durable exclusive operation claims, bounded relay admission, encrypted journal backup/restore tests and runbook implemented. Reconciliation/retention worker, off-host transport, monitoring integration, replacement-host/rollback drills and observed soak remain open. |
| UX-01 | In progress | Edited GUI plan implemented and deployed; Chromium/Firefox GUI regressions, live responsive/accessibility checks and native wallet flows pass. See [GUI implementation evidence](evidence/gui-implementation.md). Three participant trials and a physical mobile-browser session remain open. |
| REL-01 | In progress | Delivery-preparation archive/checksums and additional CI gates prepared. Registry digest, actual hosted CI, public evidence and owner acceptance remain open. |

No row is Accepted. The next ready work is the local contract test expansion and reconciliation cases in SC-03 through SC-08, plus read-only inspection of a confirmed participant posting transaction when available. Existing deployment funding authorization does not automatically authorize new public test posts or additional spending. Registry/backup/alert configuration and full hosted operational acceptance remain open.

Historical preparation record (before schema-4 publication; unset locators below are not current status): About includes a responsive block diagram of browser, relay, provider/validators and board/thread/post-page storage. The first-version schema-3 contract was rebuilt, all five native engine tests passed, and its checksummed WASM/source package and `evidence/contract-release.json` were prepared. Public locators remain explicitly unset. The live provider probe now records 0.45.0 runtime, proof verification and four matching validators, and readiness enforces a pinned provider runtime. This strengthens NET-01/NET-02 preparation without claiming public compatibility or publication.

Owner follow-up confirms the single-Linux-VPS/Compose small-beta starting plan and requests a growth architecture. Exact host/domain details remain unprovided. All accepted message content stays on chain throughout the scaling stages below.

## Scope decision

Built-in wallet generation AND recovery are mandatory in this iteration. Visitors must be able to create, back up, lock/unlock and recover their own testnet wallet inside the app, fund it through a proven testnet flow and sign posts. An external wallet or shared demo identity cannot replace that acceptance criterion. Keep participant keys/passwords in the browser; the VPS is not their custodian. Mainnet is disabled.

October 7 owner instruction supersedes file-based onboarding: offer **Create wallet** and **Recover with seed phrase**, with no wallet download/upload controls. The implemented format is a 24-word Hauntboard BIP39 phrase backed by released native Tari key derivation; it differs from native Tari CipherSeed. Fresh-browser native output recovery and real signed posts pass locally in Chromium and Firefox with a different device password. Preserve existing randomly generated wallet records; they cannot be converted to phrases without changing identity. Native CipherSeed interoperability is not established; it is not a V1 requirement for the explicitly labeled Hauntboard phrase format. Secret-thread key recovery belongs to the preserved legacy demo, outside the public first-version path. Recorded public phrase/fund recovery has since passed; participant public posting verification remains separate. See [wallet recovery](wallet-recovery/README.md).

Other required V1 scope: public threads/replies, schema-4 history, accurate transaction states, local hide/filter controls, independent local-client recovery and public HTTPS access. Preserve legacy schema-2/3 history; sealed threads and tips are outside V1 acceptance. Images, native installers, mainnet, account-based cloud key recovery, selective secret-member revocation and optional sponsorship are outside the critical path.

## Historical October 6 baseline (not current status)

| Area | Evidence already present | Remaining release gap |
|---|---|---|
| Contracts | Schema 3; 128 threads/board, 128 pages/thread, 16 posts/page, 2,048 posts/thread; 4,096-byte envelopes; five recorded engine tests | Public runtime compatibility, publication and measured fees/latency; concurrent public writes |
| Public/sealed UI | Recorded localnet journeys, page rollover, second-client decryption and outage recovery | HTTPS public-network repeat, mobile usability, stale-provider handling |
| Embedded wallet | Chromium and Firefox recorded generation, local faucet account, local signing, encrypted export, wrong-password rejection and clean-browser restore/sign | Network-aware storage/address/signing, real testnet funding, recovery hardening and account rediscovery |
| Tips | Local demo companions send/scan native stealth outputs | Participant-owned receive address, supported private spend/scan path; no hosted shared-wallet fallback |
| Packaging | Local PowerShell launcher, bundled assets/checksums and CI workflow | Immutable deployable application image, Linux VPS Compose, actual hosted CI, release tag |
| Operations | Local volumes and transaction journals | Readiness, abuse bounds, monitoring, off-host backup/restore, rollback and soak evidence |

Source anchors: `web/browser-wallet.mjs`, `server.mjs`, `lib/chain.mjs`, `schema3.md`, `../compose.hauntboard.yaml`, `../.github/workflows/hauntboard.yml`. Recorded evidence: `evidence/browser-wallet.json`, `browser-wallet-firefox.json`, `paging.json`, `engine.json`, `outage.json`, `recovery.json`. These artifacts were inspected; their tests were not rerun for this planning pass.

Historical implementation gaps identified October 6 (use the reconciled status and SC register above to determine remaining work):

- Browser encryption metadata, IndexedDB record, address derivation, transaction builders and provider network all assume localnet/network byte 16. Replace these through a validated network profile, preserving existing wallets; do not simply disable the network checks.
- Server provider/host allowlists and POST origin checks are local-only. `ORIGIN` in Compose does not currently control those checks. Production requires one validated canonical HTTPS origin and explicit trusted-proxy handling.
- Public startup must work without demo companion credentials. Exclude companion quote/sign/wallet-inspection routes and local factory-reset/Clear-Site-Data behavior from the public profile.
- The relay currently shares a global signing lock and writes per-operation files. Define bounded concurrency, journal capacity/retention and reconciliation before multi-user exposure. A request timeout is not proof of rejection.
- Restore currently permits replacing the saved wallet; unlock is outside the create/restore Web Lock. Add non-destructive replacement behavior and cross-tab coordination. Validate recovered account ownership before allowing spending.
- A backup taken before funding contains no account locator. Recover/discover an existing account and pending funding result before offering another account/funding operation. Test expired signed envelopes and pre-funding backups.
- Posting uses a fixed local maximum fee. Replace this with tested estimation, explicit bounded review and re-review on changed state. Do not auto-increase a user's authorized maximum.
- No readiness route exists in the current companion server. Container-running and chain-ready must be distinct statuses.

## Architecture decision

```text
User browser
  encrypted local wallet + secret-thread keys + local signing
        |
        | HTTPS: public reads, ciphertext/public posts, signed transactions
        v
VPS: Docker Compose
  TLS reverse proxy (public 80/443)
        -> Hauntboard web + restricted provider/transaction relay (private)
               -> compatible public-testnet provider
               -> optional privately exposed self-hosted indexer
  persistent TLS state + minimal transaction journal + deployment manifests
  bounded logs/metrics + encrypted off-host operational backups

Independent local client -> separately operated compatible provider -> same contracts
```

Use a small multi-container Compose stack on one VPS. Build the web/server image ahead of deployment; no source bind mount or toolchain compilation on the VPS. Pin application and infrastructure image digests. Keep chain content authoritative; no PostgreSQL content database is needed for Hauntboard. Any cache must be rebuildable.

Start with external compatible providers if P0 proves them usable; include a self-hosted indexer only if required. Do not carry the single-validator local chain into the public deployment. A provider on the same VPS is useful operationally but does not satisfy independent availability by itself. Browser trust in provider responses remains explicit.

Only the TLS edge has public application ports. SSH is restricted operational access. Wallet RPC, indexer administration and runtime secrets stay private. Use non-root application containers, read-only root filesystems where compatible, dropped capabilities, bounded request bodies/timeouts, log rotation, memory/CPU limits, restart policies and health checks. No Docker socket in the application. No third-party scripts or telemetry reading wallet material.

Planning capacity assumption, not a measured requirement or purchase recommendation: small invited beta, one x86-64 Linux VPS, roughly 2 vCPU/4 GiB RAM and 40 GiB SSD for the edge/app/relay only. Re-size from actual load tests. A self-hosted indexer requires separate sync/storage/RAM measurements before committing the host specification. OS, actual host resources, DNS, tester count and provider availability remain inputs.

## Growth architecture: scale around authoritative on-chain content

The storage invariant holds at every stage: full public message text and thread/page relationships live in schema-4 chain state without author keys. Legacy schema-3 boards retain encrypted envelopes and author references. Wallet keys, secret-thread keys and unpublished drafts remain local. Optional caches, search indexes and transaction journals are derived or operational data; losing them must not lose accepted posts. The VPS is an access point, not the authority for content or authorship.

| Stage | Deployment change | Trigger and acceptance |
|---|---|---|
| 1. Invited testnet beta | Single VPS, TLS edge, one app/relay container, compatible external provider plus independently usable alternate; small bounded cache | Establish traffic, p95 latency, provider lag, conflict rate, fees, RAM/disk and CPU baseline. Prove VPS outage recovery. |
| 2. Read growth | CDN for hashed static assets; separate read service if needed; bounded shared chain-state cache; scale/index provider capacity | Repeated read latency or provider throttling after pagination/request deduplication. Confirm higher cache hit rate and lower upstream load without stale state being presented as current. |
| 3. Availability and write growth | Two app/relay hosts across failure domains behind a load balancer; separate indexer resources; durable shared transaction-operation store; bounded workers | Uptime requirements demand host redundancy or relay queues remain saturated. Kill one instance during submissions: reconcile one logical operation with no lost status or duplicate financial intent. |
| 4. High activity | Additional board instances and better board discovery; partition read/search workers by board; investigate a versioned contract change only for measured hot-thread contention | Existing boards near capacity or contract conflicts dominate despite spare server capacity. Keep every old address/history accessible; prove new contracts and migration/discovery behavior before adoption. |

Container boundaries should permit these changes without another frontend rewrite. Launch with Compose; adopt an orchestrator only when multi-host rollout, scheduling and failure recovery requirements justify its operational cost. Container replication on one VPS does not provide host-failure availability.

### Read path

- Cache by network/reset identity, expected template/schema, component address and version. Store raw verified-provider chain responses/public text/ciphertext; never cache decrypted secret content on the server. Label provider trust accurately; the current browser does not independently verify consensus proofs.
- Keep completed pages by observed version; revalidate mutable board/thread metadata and active pages. Fetch on navigation and use bounded polling, shared request deduplication and backoff. Add event-driven invalidation only after checking actual provider support; reconcile with current state regardless.
- Preserve explicit freshness and provider status. A cached page is not proof that the latest write confirmed. Provider disagreement or network reset invalidates assumptions; never combine different network identities under one cache key.
- Public search can become a rebuildable index later. Secret search/decryption stays on-device. There is no requirement to copy every message into a central SQL database for the release.
- CDN responses must never include wallet, operation-status, personalized or decrypted data. Pin reviewed client artifacts and hashes: distributing frontend code is also distributing the code that handles participant keys.

### Write path and multi-instance correctness

- The browser constructs/reviews/signs each operation. The relay validates bounded transport and forwards signed envelopes to approved providers; it has no participant signing key. A queued request remains pending until authoritative chain confirmation.
- Before horizontal replicas, replace process-local CSRF/session/quote assumptions, global signing lock and file journals with replica-safe behavior. Use a shared durable store for minimal operation identity, exact-envelope fingerprint/transaction ID, status and worker leases. Redis may serve cache/rate limits; it must not be the only durable record of an uncertain transfer.
- Scope operation records to their owner/session capability and network; exclude private tip details from public logs/metrics and public-status endpoints. Signed tip envelopes, if persisted for retransmission, need restricted retention/access too.
- Atomic idempotency claims prevent two workers acting independently on one intent. Reconcile an uncertain transaction before building/signing another. Worker leases and at-least-once delivery do not imply exactly-once chain execution. Preserve contract-level nonce checks and user re-review on changed fees/content/state.
- Server rate limits protect the hosted service; they cannot prohibit direct on-chain posts from alternate clients. Use finite queues, 429/backoff and cost/budget controls. Keep the self-hostable client path.

### On-chain capacity and contention

Schema 4 bounds each board at 128 threads and each thread at 2,048 posts. A saturated board needs a new board instance; a full thread needs a continuation thread. Add clear capacity indicators and documented board creation/discovery before broad promotion. A future directory should store/discover board locators without becoming a mutable global component required for every reply.

Source review shows `create_thread` mutates the board registry, while `append` mutates thread metadata and its current page. More app servers therefore cannot remove a hot board/thread write conflict. Paging addresses bounded state size and read payloads; it does not establish unlimited parallel writes within one thread. Separate threads/boards reduce shared component writes, but actual throughput still depends on the deployed network and fee-account inputs. A single sponsored fee account could introduce another shared write bottleneck; participant-owned accounts avoid that particular central dependency.

The approximate maximum post-envelope payload for a completely full schema-4 board is 128 × 2,048 × 4,096 = 1 GiB, before metadata/replication/history. This is arithmetic capacity, not a tested full-board deployment or an affordability claim. Measure typical and maximum-envelope fees, full-page/rollover cost and storage growth. Bound spam/funding exposure; do not promise network retention through testnet resets.

Scale decisions use p95 read latency, cache hit rate, provider freshness/errors, submission queue age, confirmation time, state-conflict rate, per-operation fee and operating cost. User count alone is not a capacity forecast. Public provider/network guarantees and throughput remain unverified until NET-01 and staging measurements.

## Delivery backlog and responsibility

One builder can execute the engineering roles below. Roles are accountability assignments, not authorization to create parallel agents. Kyle owns infrastructure inputs, funding ceilings, release acceptance and external publication.

| ID | Priority / owner | Deliverable and acceptance | Dependency / planning effort |
|---|---|---|---|
| NET-01 | P0 / architect | Read-only public network/provider probe; record network identity, reset identity where available, tested SDK/WASM/runtime versions, provider API/CORS behavior and viable testnet funding flow. Freeze a versioned network manifest; reject mismatches. | First; 1–2 builder days |
| WAL-01 | P0 / wallet engineer | Embedded phrase creation/confirmation, password-encrypted local storage, lock/unlock, native funding and signing on target testnet. No secret/password in API, logs or server volume. Network/reset-separated storage; preserve localnet identities. | NET-01; 2–3 days |
| WAL-02 | P0 / wallet engineer + QA | Fresh-browser phrase recovery returns the same identity, discovers verified native outputs and signs a reply. Invalid phrase/wrong network/storage failure/concurrent-device races cannot erase a wallet or reuse uncertain inputs. Preserve quarantine and cover bounded scan/ledger behavior (SC-08). | WAL-01; 1–2 days |
| NET-02 | P0 / contract engineer | Reconcile the already published schema-4 artifact and board with their recorded hashes/receipts. Prove public writes, rollover, history retrieval, permission boundaries, conflict/retry behavior and measured fees (SC-01/03/05/06/07). A changed artifact requires a separately versioned deployment. | NET-01; 1–2 days, public funding dependency |
| PRIV-01 | P0 / wallet + contract engineer | Inspect actual participant native stealth fee posting on Esmeralda: no persistent owner signature or named-account input, no stored author, change quarantine and honest graph/timing/network limits. Include unknown fee-spend reconciliation (SC-02/04). | NET-01, WAL-01, NET-02; re-estimate after first inspected posting receipt |
| OPS-01 | P0 / platform engineer | Production image, `compose.hauntboard.vps.yaml`, environment example, HTTPS proxy, Linux deploy/update/rollback commands, network checks and liveness/readiness. Local-only signing/reset paths absent; restrict proxy upstreams and abuse. | Profile work after NET-01; 1–2 days |
| OPS-02 | P0 / platform + QA | Bounded relay concurrency/journal retention; off-host backup and replacement-host restore; versioned manifests; alerts; restart and rollback drills; 24-hour observed staging soak. | OPS-01; 1–2 days plus soak |
| UX-01 | P0 / PMO + QA | Three first-time testers complete phrase confirmation/recovery and public posting; inspect mobile flow and clarify permanent publication/testnet resets/fee visibility. Record and fix blocking confusion. | WAL-02 and staging; 1 day plus fixes |
| REL-01 | P0 / release engineer + Kyle | Actual CI on frozen release source, image digest, checksums, sanitized proof, local package, runbook, known limits and demo/contest drafts. Kyle accepts concrete release; deploy to named VPS when access is provided. | All gates; 1 day |

The historical full-delivery estimate was approximately 11–19 builder days plus external waits and incompatible-runtime work; it is not a current remaining-effort estimate. The original 11–19-day estimate predates completed implementation and the SC review; re-estimate remaining work against NET-02, PRIV-01 and SC-03 through SC-08. Do not use tips or sealed content as substitutes for participant-owned stealth fee posting. Built-in phrase generation and recovery remain required.

## Release gates and evidence

1. **Network:** exact identity and compatible versions recorded; wrong network/reset identity fails closed. Operator-funded publication budget is explicit. Faucet unavailable has an honest recoverable UI state.
2. **Wallet:** create -> confirm phrase -> fund -> post -> fresh browser -> recover using a new device password -> same identity and verified native funds -> post. Repeat with invalid phrase, wrong network/reset, scan continuation, ledger capacity, spent inputs, quarantined change, pending transaction, concurrent devices and storage failure. Keys/phrase/password never leave the browser; phrase recovery alone does not restore pending intent (SC-08).
3. **Contract/content:** schema-4 public threads/replies, 16-post rollover and full history; deny sealed mode; exact retries and conflicts, full board/thread limits, wrong-role calls, unauthorized page writes/rule updates, malformed inputs and direct read bounds. Concurrent rollover and rejected application execution leave no partial history/count drift (SC-03/05/06/07). Separate application rollback from charged fee effects.
4. **Poster privacy and fees:** actual target-testnet participant transactions inspected for persistent signer/account exposure and native fee authorization, with required fee, paid fee, ceiling and change recorded separately. Unknown outcomes preserve original envelope and input reservations; duplicate logical content does not justify a second fee spend. Never infer unlinkability from omitted author fields (SC-02/04).
5. **Independence:** original hosted service unavailable; fresh local client restores phrase wallet, retrieves accepted schema-4 history through an independent provider, validates template/schema/page linkage, and confirms a reviewed reply. Preserve old board access; never mix network/reset identities.
6. **VPS:** HTTPS/browser origin and CSP checks, ports audit, public demo-wallet routes absent, resource/abuse test, container restart and host restart without identity loss, image rollback and restore on replacement host. Application rollback never assumes a contract can be rolled back; preserve old addresses/schema compatibility.
7. **Operations:** 24-hour staging soak, no unresolved critical defects, bounded disk/log growth, useful alerts and tested runbooks. Initial proposed operational targets: restore service within 2 hours; operational backup age under 24 hours. Transaction safety cannot rely on these backups: reconcile chain outcomes before retrying. Participant backups remain user-held.
8. **Acceptance:** Chromium and Firefox real HTTPS journeys, mobile layout plus at least one real mobile-browser trial, three user trials, passing CI on release source and evidence manifest tied to source/image/contract hashes. No release claim based only on this plan or historical localnet evidence.

Load-test initial candidate: 20 simultaneous readers and 5 active writers with bounded queues. Report measured p50/p95 read/confirmation latency, failures and resource use; establish acceptable thresholds after the public baseline. Network confirmation latency is a measured dependency, not a VPS performance guarantee.

## Calendar and PMO control

All dates below are targets in America/New_York, subject to the effort and network gates above.

- October 6–8: NET-01, native stealth fee compatibility review, configuration/architecture freeze.
- October 9–15: embedded testnet wallet and recovery, public contract proof, deployable image/HTTPS profile.
- October 16–21: participant stealth fee posting/privacy evidence and contract fix validation, provider outage recovery, VPS operations and integration fixes.
- October 22–24: user trials, load review, restore/rollback and staging soak; feature freeze.
- October 25–28: release candidate, evidence, docs and demonstration. Fix release blockers only.
- October 29–30: verified public links and contest artifacts; internal submission target October 30, 4 p.m. EDT.

The general contest rules specify cutoff at the first day of the following month, 00:00 UTC: for October, November 1 at 00:00 UTC / October 31 at 8 p.m. EDT. Recheck the October-specific announcement before submitting; it was inaccessible to the research tool during this review. No social/forum post is sent by this plan.

Track each backlog row as Not started / In progress / Evidence ready / Accepted / Blocked. Only mark Accepted against the stated artifact and exit test. End each working session with changed status, evidence links, remaining risks and the next executable item. Reforecast dates after a failed capability gate; optional polish absorbs schedule pressure before required wallet/recovery/privacy work.

## Handoff package and owner inputs

Release package: immutable application image/digest; production Compose and env example; public network/contract manifest; Linux install/update/rollback/backup/restore runbook; portable same-network client; phrase-wallet recovery guide and separately labeled legacy secret-key recovery guide; passing evidence bundle; license/provenance; release notes and demo script. These are requested deliverables, not files already implemented by this planning pass.

Needed from Kyle for environment-specific deployment: VPS OS/architecture/resources and access method, domain/DNS, expected tester count, intended image registry/repository, alert/backup destinations, and bounded testnet publication/test funding. These inputs do not block local implementation or read-only compatibility checks. Actual public spending needs the named target and budget under the repository's existing release rule.

## References checked

- [Tari wallet setup](https://ootle.tari.com/guides/setup-a-wallet/): public funding/wallet workflow reference; does not prove this browser wallet is compatible.
- [Tari stealth transfers](https://ootle.tari.com/guides/stealth-resources/): maintained transfer guidance; implementation capability must be measured against pinned versions.
- [Tari fees](https://ootle.tari.com/reference/fees/): use simulation and actual receipts rather than extrapolating local fees.
- [Docker Compose production guidance](https://docs.docker.com/compose/how-tos/production/): separate production configuration and operational concerns.
- [Tari architecture](https://ootle.tari.com/concepts/architecture/) and [state/execution](https://ootle.tari.com/concepts/state-and-execution/): distinguish indexer serving capacity from validator execution and component-state coordination. Hauntboard contention conclusions also follow from `template/src/lib.rs`.
- [Contest rules](https://community.tari.com/t/ootle-launch-date-and-launch-contest-rules/323): public source/license, description, prize address, announcement link and UTC cutoff.

