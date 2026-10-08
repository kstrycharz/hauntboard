# Hauntboard — on-chain message board pivot

### October 7 smart contract consulting update

Use the [current delivery plan](hauntboard/DELIVERY_PLAN.md) and [contract review/fix register](hauntboard/docs/smart-contract-review.md) for active work. First-version scope is public schema-4 content without stored author keys, participant-owned native stealth fee posting and seed-phrase recovery. Sealed threads and tips below are historical demo scope. Recorded evidence now includes [Esmeralda publication and hosted beta](hauntboard/evidence/esmeralda-deployment.md) and [public phrase recovery](hauntboard/evidence/esmeralda-public-wallet-recovery.json); participant posting privacy verification and full release acceptance remain open. The review adds prioritized authorization, retry/fee, concurrency, capacity, recovery and artifact-verification gates. Historical localnet results below do not establish those gates.

### October 6 VPS delivery and wallet scope decision

The owner confirmed a VPS deployment using Docker, with **built-in wallet generation and recovery required in this testnet iteration**. [The VPS delivery plan](hauntboard/DELIVERY_PLAN.md) is the current execution backlog and release gate reference. It distinguishes existing localnet wallet evidence from outstanding public-testnet compatibility, participant-owned private tips, HTTPS deployment and operational acceptance. Its current schema-3 limits and delivery decisions supersede older proposed limits and wallet deferrals below. Public deployment has not been performed.

Prepared for Kyle on October 5, 2026. Working name: **Hauntboard**. Status: **functional localnet PoC implemented and verified**. The owner subsequently authorized implementation through a working proof of concept. See [hauntboard/README.md](hauntboard/README.md) and its evidence for the actual result. The milestones below remain the broader public-release roadmap; local proof does not establish public Esmeralda deployment. `PROJECT_PLAN.md` preserves the previous Hauntbox implementation and its evidence.

### October 6 paged-conversation upgrade

Schema 3 is deployed on the existing isolated localnet. Threads now support **2,048 posts (2,047 replies)** in **128 on-chain pages of 16 posts**, with full payloads retained and stable global reply references. The original schema-2 board, demo wallets, browser wallets and secret-key stores are preserved; previous boards remain accessible through the board chooser and retain their original limit.

Five native engine tests passed, including all 2,048 positions with 4,096-byte reply envelopes, capacity rejection, old-page retries, identity/parent checks and immutable page access rules. The live paging acceptance test passed public and sealed conversations with 36 posts each, browser-signed rollover, independent companion replies, verified page recovery, cross-page reply references and Load older replies after reload. Source and protocol details are in `hauntboard/schema3.md`; local evidence is in `hauntboard/evidence/paging.json` and `engine.json`. The GitHub workflow now includes the paging gate. Public deployment remains outside this localnet proof.

### October 5 implementation record

- Original board/thread contract published and instantiated on a new isolated Tari localnet with separate wallet/data volumes; immutable access rules, full post bytes and permissionless signer admission.
- Hosted-style primary client on localhost:8280 and independent local client on localhost:8281, with separate demo wallets and indexers; no application content database.
- Four native engine tests passed, including full-capacity 4 KiB envelopes, independent signers, exact retries, conflicting reuse, bounds and parent/mode validation.
- Real Chromium journeys passed: public posts, independent replies, encrypted-thread invitation/decryption/reload, wrong-key/tamper/context rejection, encrypted backup round trip, native private tip receive and transaction inspection, HTML escaping, mobile layout and CSRF rejection.
- Actual outage proof passed: primary website/indexer/wallet stopped, fresh browser recovered full public/encrypted history and confirmed a new encrypted reply through the independent client.
- Lost successful submission response recovered after reload without duplicating a post. Firefox invitation/decryption/key reload and native wallet scan passed.
- **Measured scope correction:** 64 maximum-size posts exceeded the tested WASM memory budget. The working limit is **32 posts per thread**, 4,096 serialized bytes per envelope. Schema 2 uses primitive locator/parent state to avoid an observed BOR optional-address round-trip difference in the deployed local runtime.
- The PoC uses local demo wallet companions. Public individual wallet onboarding, browser-controlled signing, public Esmeralda deployment, public-release fee/latency budgets and human usability trials remain open. Source/bootstrap identity, transactions, screenshots and sanitized results are in `hauntboard/evidence/`.

### October 6 browser-wallet and About implementation

**Release preparation / owner-requested factory reset:** the synthetic localnet and demo-wallet data were reset, and a new empty board was published for an end-user walkthrough. Both origins clear previous browser storage once on the next full navigation. Fresh-start tests passed on both ports in Chromium and Firefox without publishing posts. A local PoC distribution now includes a tested PowerShell launcher, stop/restart instructions, bundled contract/browser assets, frozen source, retained licenses, a hash manifest and an archive checksum. Public Esmeralda and internet hosting remain separate release gates; no public shipping claim is made.

- Browser-created owner/view keys, password-encrypted local storage, real localnet faucet account creation and funding, chain-read fee balance, and browser-controlled public/sealed board signing implemented. Chromium and Firefox verified the contract author matches the browser owner's public key, without calling demo-wallet signing endpoints.
- Encrypted wallet backup, wrong-password rejection, reload locking/unlocking, clean-browser restoration and a reply signed by the recovered owner passed. A sealed browser-wallet submission with a deliberately lost success response reconciled after reload without a duplicate post.
- About page explains post flow, on-chain public bytes / encrypted envelopes, off-chain key and draft storage, immutable publication, exposed metadata, current localnet limits, live board/template identity and independent-client inspection. Chromium/Firefox navigation, mobile and offline cases passed.
- Dedicated container-based GitHub workflow added for native contract, frozen SDK build/audit, browser wallets, About, encrypted content, private tips, independent outage and recovery gates. Local test evidence is recorded; no Git remote is configured here, so no hosted CI run or external CD deployment is claimed.
- Browser signing is complete for the isolated localnet PoC. Public Esmeralda compatibility/deployment, browser-native stealth tip scanning/spending, public fee/latency budgets and human usability trials remain public-release work.

**Pitch:** A haunted message board whose posts live on Tari Ootle. Read public threads, share encrypted secret threads, and send native private testnet tips. Use our website or run the same client locally against the same contracts.

**Recommendation:** proceed with a bounded, text-first prototype. The pivot directly addresses the owner's requirement that a central customer database and operator API must not control access to the product. A plain public forum is a weak fit for the privacy theme; encrypted threads plus a verified native stealth transfer give the entry a clearer case. This is a product judgment, not a prediction of the Council vote.

## 1. Contest fit and delivery constraints

The [October announcement](https://community.tari.com/t/october-build-contest-thread-spooky-secrets/396) asks for spooky atmosphere and demonstrations of Tari privacy. Our interpretation: make secret sharing the main demo, with the public board providing a familiar entry point. Browser encryption protects messages; native Tari stealth transfers demonstrate network privacy. Describe those as distinct mechanisms.

The [general rules and October 2 organizer clarification](https://community.tari.com/t/ootle-launch-date-and-launch-contest-rules/323) require new work, publicly available source under an OSI-approved license, and no code borrowed from other entries. The organizer explicitly permits development using coding agents and says new contracts/libraries can qualify when submitted as a new repository with new code. Keep dated provenance for reused Hauntbox work; prepare a focused new board repository at release with dependencies and reused modules identified, without presenting copied code as newly authored.

Submission requires a project description, public code/app link, owner-confirmed Tari prize address and public announcement on Bluesky or Reddit. Make one submission post and edit it for updates. Draft those artifacts during the release phase; actual external posting needs Kyle's explicit instruction. Recheck rules before submission.

- Hard cutoff: **November 1, 2026, 00:00 UTC**, which is **October 31 at 8:00 p.m. EDT** in New York.
- Internal submission target: **October 30 at 4:00 p.m. EDT**, giving 28 hours of buffer.
- Target network: verified **Esmeralda testnet**. Network reset and availability remain dependencies; do not promise permanent storage across a testnet reset.
- No production traffic or willingness to pay is established. Test the proposition with at least three people before expanding scope.

## 2. Product and scope

Borrow the familiar board interaction: board list, chronological threads, numbered posts, `>>post` references, simple pseudonymous participation and no required central account. Use original branding and a readable spooky visual style. A 4chan-inspired layout does not require an image upload feature for this release.

| Priority | Feature | Acceptance |
|---|---|---|
| Required | Public board and replies | Full text is recovered from contract state; no app database supplies missing content |
| Required | Encrypted secret threads | Authorized client decrypts chain-stored ciphertext; fresh client without the key cannot |
| Required | Direct user-controlled writes | A supported user wallet signs and submits without approval from the original app operator |
| Required | Hosted and local access | Same app build and contract addresses work via HTTPS and a documented localhost container |
| Required | Independent recovery | Fresh local cache rebuilds a board while original app API/database and hosted site are unavailable |
| Required for contest story | Native private testnet tip | Independent receiver detects and spends a real stealth output; public metadata is inspected |
| Required | Clear network and transaction state | Pending, confirmed, rejected, unknown and disconnected have different behavior |
| Required | Local hide/filter controls | Users can hide threads without pretending underlying chain bytes were deleted |
| Required | Recovery/export | Local identities and secret-thread keys can be restored with documented supported formats |
| Optional after gates | Installable PWA and optional sponsorship | Convenience improvements never become required for direct access |
| Later | Images, native desktop installers, private member management, full-text global search | Excluded from October critical path |

No token launch, NFT membership, DAO, custom anonymity protocol, timed decryption, automatic rewards, user deposits, or mainnet release. The prior curator reward queue is not part of the board MVP.

### Core journeys

1. **Read:** visit site, choose a board, open a public thread. Reading requires no account or wallet. Show last successful sync and provider status.
2. **Post:** connect/create a supported wallet, obtain testnet fee funds through a working supported flow, write a short post, review its public/secret mode and fee, sign, then wait for confirmation. Preserve the draft on failure. A display name of “Ghost” is not an anonymity guarantee.
3. **Share a secret:** create a secret thread, encrypt its title and body locally, publish only the encrypted envelope, then copy an invitation with the thread locator and a random decryption key. A second browser with that invitation can read the thread and encrypt a reply; writing still requires a funded signer.
4. **Tip:** optionally include an Ootle receive address inside a secret post. A reader decrypts it and initiates a separate native stealth transfer through the supported wallet. The board does not publish a tip amount, transaction link or public tip counter.
5. **Keep access:** start the local release, import the network/board locator and optional secret-thread key, select an independent compatible provider, rebuild the board, and submit a reply without using the original app backend.

All secret-thread members share one read/write encryption key in v1. It does not prove authorship or restrict contract admission. Anyone can submit bounded opaque bytes; clients treat undecryptable content as unavailable/invalid. Wallet authorization establishes transaction authorship only. No membership roster, selective revocation, forward secrecy or retroactive access removal is promised.

## 3. Meaning of “on chain”

**Store the actual public text or encrypted secret envelope in current contract state.** A content hash or URL alone does not satisfy this plan. Events are discovery hints, not the sole content store. Rebuilding must not require our event archive or private database.

| Data | Authoritative location | Consequence |
|---|---|---|
| Board metadata and thread addresses | Ootle component state | A known board can be enumerated without our server |
| Public posts | Ootle component state | Anyone retrieving state can read and retain them |
| Secret post bodies and titles | Encrypted bytes in Ootle component state | Key holders decrypt locally; chain observers still see activity |
| Signing keys and secret-thread keys | User-controlled local encrypted storage/backups | Never in contract arguments, public state, analytics or the app API |
| Read status, bookmarks, filters and caches | Local browser storage / optional local files | Disposable convenience data; export separately if desired |
| Search and feed ordering | Rebuilt client index | No central index determines canonical posts |
| Frontend code | Public source and downloadable build | Anyone can serve another copy |
| Private transfers | Native Tari transaction state and wallet | Separate from message content and contract authorization |

This is decentralization of application authority and content availability, subject to Tari and its read infrastructure being available. It is not offline consensus, a guarantee of universal replication, or independence from indexers. A hosted read proxy can solve CORS/HTTPS limitations, but must be replaceable or self-hostable. The local client is an app, not automatically a validating node. Document what the selected provider is trusted to report and whether response proofs are independently verified.

## 4. Proposed Ootle architecture

Proposed implementation, subject to P0 verification: Rust/WASM board and thread templates, a TypeScript/React shared frontend, maintained Tari client libraries, and optional local provider/wallet adapters. Pin versions to the actual tested public network. Build toolchains and tests inside containers; sibling Tari snapshots stay read-only.

```text
Hosted app OR the same app served on localhost
   |-- user's signing wallet and local encryption keys
   |-- disposable local board cache
   |-- configurable provider / replaceable proxy
          |-- Ootle board registry -> thread components -> full post bytes
          |-- native Tari private transfers
```

### Bounded contract design

Start with a **bounded board registry and one component per thread**, avoiding one ever-growing component for the whole service. Proposed initial limits, to be reduced if measurements demand it:

- 128 threads per board instance; full boards remain readable. New board instances can be created permissionlessly and opened by address. Automatic endless directory pagination is later work.
- 32 total posts per thread including the opening post (revised from 64 following actual WASM memory tests). At capacity, clients start a continuation thread; old state remains readable.
- 4,096 bytes per serialized post envelope, including encryption overhead and any embedded receive address. UI shows the real remaining payload budget; it is not 4,096 text characters.
- Short bounded public board labels; secret titles stay encrypted. No arbitrary HTML, files, embeds or remotely fetched images.
- A separate serialized-state ceiling leaves headroom for metadata. Verify the maximum populated thread fits, including every index and retry record.

The [current limits reference](https://ootle.tari.com/reference/limits/) lists a 1 MiB substate limit and 2 KiB event limit. These are documentation baselines, not evidence for the selected deployment. Test runtime limits before freezing sizes. With the implemented 32-envelope limit at 4 KiB, message payload alone is 128 KiB; serialization, authorization and indexes add to that. Fees at near-full capacity must be measured because appending may rewrite substantial component state. Consult the [fee reference](https://ootle.tari.com/reference/fees/) and actual dry runs, not a fixed per-post marketing price.

Conceptual interfaces (not yet verified SDK signatures):

| Component | Interface | Required behavior |
|---|---|---|
| Board | create board; create thread; list thread addresses | Fixed limits/schema; creation and registry insertion atomic; no spoofed foreign thread registration |
| Thread | append post; get metadata; list posts | Append-only accepted content; bounded envelope validation; deterministic post sequence |
| Both | public read paths | Current-state retrieval through supported provider APIs; pagination does not imply executing paid reads |

Use authenticated transaction signer context instead of a caller-supplied author key. Store network/schema/board/thread binding, payload mode, bounded client nonce, sequence, reply target and bytes as needed. Exact replay of `(signer, nonce)` within a thread returns the original post; reuse with different content fails. Transaction replay protection and application retry identity are separate checks. Creation retries must also reconcile the original result before creating another thread.

Validate referenced parents belong to the same thread, mode matches the thread, sizes/counts fit, and concurrency cannot overwrite another post. No post editing or deletion method in v1. Lock authority/access rules so an operator cannot later replace content or turn public append into operator-only append; verify this in the actual runtime rather than assuming the default owner configuration.

Read metadata/state after confirmed execution; never show a dry run, local draft, or queued submission as published. A timeout is an unknown outcome: resolve the transaction and nonce before resubmission. Conflict retries re-read state and preserve the same logical post identity. Do not blindly retry tips.

### Synchronization and bootstrap

The downloadable release contains a versioned network/board manifest with addresses and expected template identifiers. Also accept an explicit user-supplied board address; the bundled manifest is a convenience directory. Treat user-supplied locators as untrusted, verify network/template/schema, and fetch full current state from the configured provider.

Build a local cursor from observed component versions and post sequences. Fetch missing data, deduplicate by canonical address/sequence and validate reply relationships. On reconnect or provider change, reconcile against current state instead of trusting event delivery. Provider disagreement or stale state must produce an explicit status. A hash comparison against a single provider is not independent consensus verification.

Required recovery test starts with an empty cache and only the locator plus optional decryption key. It must recover all confirmed posts, including older posts, without relying on our hosted frontend, API, PostgreSQL or a prefilled export. Export is a separate recovery aid. Test a second independently operated read path or a user-run compatible indexer; two URLs to the same backend are not independent availability.

## 5. Privacy and key design

Use established browser cryptographic APIs/libraries: random 256-bit thread key, authenticated encryption, unique random nonces and a versioned envelope. Bind network, board, thread and logical post identity as authenticated context. Solve the first-post address binding explicitly in the design (allocated address or creation followed by first append); do not invent a circular derivation. Pad to a tested fixed envelope size where practical. Encryption and padding do not hide post counts, signatures, sizes of other records, timing or network requests.

Put invite keys in URL fragments or a separately copied secret field, never query strings or contract arguments. Immediately clear a consumed fragment from the visible URL/history where feasible; it is still accessible to page JavaScript, extensions, clipboard tools and anyone receiving the invite. Apply a restrictive CSP, no third-party analytics, no external content fetches, and no secret-bearing logging. An operator serving malicious JavaScript could steal keys; independent builds/local hosting reduce that trust, without eliminating device compromise.

| Observer | What may be visible |
|---|---|
| Public reader / chain observer | Public posts, opaque secret envelopes, board/thread relationships, transaction activity and signer linkage |
| Secret invite holder | All content encrypted under that thread key, including history; can copy it elsewhere |
| Website/provider operator | Requests, timing and potentially IP addresses; hosted frontend code is a trust boundary |
| Tip sender and recipient | Their own transfer details and intended recipient relationship |

Tari documents [privacy boundaries for application transactions](https://ootle.tari.com/concepts/privacy-in-applications/): private assets do not make every surrounding interaction private. Public-component calls can link signers; fees and timing remain visible. Accordingly, keep tips separate from post transactions, avoid publicly recording their linkage, and inspect the actual constructed transfers. Do not claim the board is anonymous because a wallet uses stealth outputs.

No encryption key is released on chain in v1. No timer automatically decrypts content. Lost keys mean lost access; shared keys cannot be recalled. Published ciphertext may remain available long-term and could become readable if the key later leaks. Publishing UI explains content persistence and distinguishes public text from encrypted content before signing.

## 6. Spam, moderation and operating limits

User-paid network fees and contract byte/count limits provide basic resource bounds. They do not solve Sybil spam, and a motivated user can fill a bounded board. Treat this as an explicit testnet beta limitation. Do not claim a browser throttle enforces global admission.

Offer local hide/mute and a default hosted-client filter policy. For MVP, locally bundle the policy with a visible version and let local users inspect/replace it. A hidden post remains on chain. Hosts can control their own presentation and optional sponsorship; they cannot promise erasure or decrypt secret threads without keys. If unacceptable spam emerges, stop promotion/sponsorship and deploy a revised, clearly identified board policy rather than claiming the old board is deleted.

Sponsorship is optional and deferred until direct writing works. Any sponsor needs a finite configured budget, replay protection, abuse controls and an honest “sponsorship unavailable” state. Direct funded clients must still work when the sponsor is offline. Do not carry the old mandatory operator signer into the new contract.

## 7. Reuse and transition

The existing plan reports local-chain application evidence, while public Esmeralda proof and complete browser wallet spending remain open. Reuse is conditional on new integration tests, not old completion labels.

| Existing Hauntbox work | Pivot action |
|---|---|
| React app, typography, accessible forms and PIN keyboard handling | Reuse appropriate components; replace inbox/curator navigation with boards and threads |
| Browser key storage and recovery | Reuse reviewed patterns; verify supported wallet interoperability and secret-thread exports separately |
| Native wallet integration, testnet funding and private-transfer evidence | Reuse adapters/test patterns; re-prove the end-user tip and fee path |
| Container builds, CSP, licensing and release evidence | Reuse with current versions and new build identity |
| Receipt-only room template | Replace with board/thread templates that actually retain full content |
| Central participant accounts, ciphertext database and operator-only admission | Remove from the board's critical path |
| Curator setup, reward queue and room-key ceremony | Freeze as legacy; simplify to user wallet, thread key and network settings |

Develop the board in a clearly isolated area of the current workspace, preserving existing wallet volumes, keys and uncommitted work. Do not reinterpret old plaintext/ciphertext records as new board posts or publish old content automatically. Record new contract addresses/schema versions. Before board implementation, update agent instructions to describe this scope and retain the existing protection for legacy submissions; new public posts must be explicitly user-authored for public publication.

Release layout target: templates, shared client/protocol module, web app, local launch configuration, tests and evidence. Avoid building a second frontend for desktop. The first local app is the same web app served on localhost from a container with documented wallet/provider connections. Windows native packaging is a later enhancement.

## 8. Milestones and acceptance gates

Dates are public-release targets assuming one primary builder and timely access to a compatible funded testnet wallet. Local PoC evidence now covers substantial parts of P0–P4; public deployment, individual wallet onboarding, measured public-network budgets and release/human gates remain open. Critical path: **P0 → P1 → P2 → P3 → P5**; P4 must also pass for the proposed contest privacy story. Do not add features if a gate slips.

| ID / target | Work package | Exit evidence |
|---|---|---|
| P0: Oct 6–8 | Feasibility and protocol ADR | Full-byte storage round trip, exact network/library versions, working signing path, independent provider discovery, fee/latency/state-size measurements and frozen schema |
| P1: Oct 9–12 | Board/thread contracts | Engine tests for bounds, authorship, immutable rules, parent validation, replay, full capacity and simultaneous appends; compatible public deployment proof |
| P2: Oct 13–17 | Public + secret web journeys | Real signed posts/replies, decryption in a second browser, wrong-key rejection, key backup recovery, clear pending/failure states |
| P3: Oct 18–21 | Local client and independent sync | Clean-cache recovery and direct reply while original services are unavailable; provider switch and restart recovery |
| P4: Oct 22–24 | Native privacy proof and usability | Real separate stealth tip, independent receive/spend, metadata inspection; three users complete core tasks with problems recorded/fixed |
| P5: Oct 25–28 | Release hardening and evidence | Reproducible web/local builds, actual HTTPS/browser checks, limits/load review, instructions, tagged source and demo video |
| Submit: Oct 29–30 | Contest package | Verified links, license/provenance, owner prize address, reviewed social/forum drafts and authorized publication before internal target |

### P0: first ready work package

Time-box to roughly two to three builder days. Produce an ADR and sanitized `docs/evidence/pivot/p0/` artifacts before building the full interface.

1. Verify the actual public network, compatible template/test harness/SDK releases, available provider transports, faucet/funding path and wallet signing capabilities. Existing address generation is not proof of posting capability. Choose a maintained browser signer if proven; otherwise a supported user-controlled wallet integration. Hosted browser mixed-content, CORS and local-daemon security must be tested.
2. Build a minimal bounded thread template and test encrypted and public envelopes at 1 KiB, 2 KiB and 4 KiB, with first, middle and last appends. Inspect actual encoded state and fee-enabled engine results.
3. With an approved testnet account and finite spend ceiling, publish/probe the same behavior publicly. Record estimated and actual fees, confirmation latency, failures, binary size, maximum state size and provider versions. This planning task does not authorize spending or publishing.
4. Recover complete bytes through an independent provider from an empty client cache; demonstrate a user-controlled write without our API. If public infrastructure is unavailable, local tests continue but public proof stays open.
5. Measure costs using `deployment + board/thread creation + sum(post fees at measured occupancy) + tip fees`. Set a finite test/release budget before additional public activity. No dollar-price or throughput promise until measured.
6. Freeze numerical latency/fee budgets and acceptance limits in the ADR using the results. Product baseline: public reading and draft entry stay responsive; submissions show pending state and recover after timeouts. Do not promise instant blockchain confirmation.

**P0 decision:** proceed only if full-byte recovery and direct posting are feasible at the chosen bounds. If storage costs are excessive, reduce envelope/thread caps or introduce tested bounded pages; do not silently move bodies to an operator database. If independent retrieval cannot be demonstrated, record the unmet decentralization gate. If native tips fail publicly, the board may still be useful, but its intended Tari-privacy contest claim remains incomplete. Cut images, installers, sponsorship, reactions and advanced search before cutting the core recovery proof.

### Meaningful validation

- Contract: unauthorized authority changes, oversized/empty/malformed envelopes, wrong thread mode, invalid parents, exact nonce retry versus conflicting reuse, capacity boundary, atomic failed creation and simultaneous writers.
- Crypto/client: nonce uniqueness, context tampering, wrong key, clean-browser recovery, no plaintext/key in outbound chain payloads/logs, and no executable HTML from posts.
- Transactions: rejection versus unknown outcome, stale state, reload while pending, reconciled retries, fee exhaustion and wrong network. Tip retries cannot duplicate payment.
- Availability: API/database/site unavailable, fresh cache, older posts, independent read path, direct reply, provider disagreement and testnet reset detection.
- UX: Chromium and Firefox, keyboard/mobile layout, fresh funded and unfunded wallet paths, supported recovery formats, invite sharing, disabled-action explanations and transparent testnet/simulation labels.
- Release: clean local launch using documented steps, correct build/contract identity, no private material in artifacts, HTTPS/CSP/WASM compatibility, and source/license availability.

## 9. Demo, positioning and completion

Three-minute proposed demo:

1. Open the public board and show a real confirmed ghost-story thread without signing in.
2. Create a secret thread, inspect its encrypted on-chain bytes, and open the invite in another browser. Show that a browser without the key cannot read it.
3. Send a separate native private testnet tip and show independent recipient evidence. Explain exactly which metadata remains public.
4. Make the original hosted services unavailable; launch the local client, rebuild from a known board address through an independent read path and post a reply.

Use prerecorded real-network evidence if infrastructure is unavailable during judging, with recording date/network clearly shown. A simulated tour is supplemental and never labeled live.

Suggested positioning: **“Hauntboard: spooky conversations stored on Tari, secret threads opened only by invite, and access that survives our website going offline.”** Qualify the final availability claim with the tested network/provider assumptions. “All post content on chain” is defensible only after full-state retrieval passes; “fully anonymous” and “uncensorable forever” are not claims in this plan.

Completion requires working hosted and local releases, recoverable full content, direct writes, encrypted-thread proof, native transfer proof, actual usability checks and the complete submission package. A new UI with the old central API still controlling posts does not complete this pivot.

## 10. Planning record and source references

Reviewed October 5, 2026: existing `PROJECT_PLAN.md`, `README.md`, `AGENTS.md`, `docs/adr/004-browser-wallet-recovery.md`, and the official sources linked above. Current official documentation may describe newer behavior than the repository's previously pinned 0.43.0 stack; P0 must resolve the deployment/version differences. Existing `PROJECT_PLAN.md` had uncommitted edits and is preserved apart from a navigation note.

PM review: compelling owner-aligned proposition; preserve text-first scope and prioritize the website-outage demo. Architect review: feasible direction, conditional on measured state cost, independent reads, direct signing and explicit privacy boundaries. No application code, network deployment, funds movement or service restart was performed for this planning request.

