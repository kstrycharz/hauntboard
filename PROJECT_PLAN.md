# Hauntbox — project and delivery plan

**Seal your story. Prove it arrived. Reward it privately.**

Prepared October 2, 2026 for Kyle. Target: Tari's October **Spooky Secrets** contest. Working product name: **Hauntbox**. This is an implementation specification for coding agents, reviewed through architect and PM perspectives. It optimizes for a compelling, verifiable entry; a Council vote cannot be guaranteed.

**Product:** a haunted submission room. Visitors submit an encrypted ghost story or secret answer, receive an Ootle inclusion receipt, and can receive a native stealth testnet reward from the curator. A privacy inspector explains exactly what each party can see. The initial public release is a production-engineered **Esmeralda testnet beta**, with sponsor-controlled reward funds and one operator/curator. Mainnet funds are outside the October release.

## 1. Frontend proof of concept — accepted M1 baseline

### PM and architect review — October 2, 2026

**Decision:** accept M1 as the interactive frontend milestone. Preserve the haunted-post-office visual identity, guided journey, privacy inspector, and explicit failure states. This is a completed product prototype, not a working privacy MVP or public-testnet release. This paragraph records the M1 review baseline. Subsequent implementation status is recorded below; M2a has now passed locally, while M2b public proof remains open.

The review inspected the frontend/domain code, template compilation probe, milestone reports, and desktop/mobile screenshots. All seven unit tests were rerun in Docker and passed. The M1 evidence reports 22 passing Chromium/Firefox tests; that full suite was not rerun during this review. No external user comprehension trials have been completed.

**Execution priority:** close M2 feasibility → deliver one real end-to-end submission/reward flow → prove recovery and transaction correctness → polish from user evidence. Hold additional feature expansion. Completed screens are not a proxy for completion of the highest-risk integration work. The dated roadmap below remains a planning target, not evidence of feasibility.

**Baseline housekeeping — completed October 2:** reviewed untracked files and secret/ignore boundaries, saved local commit `bdfb77201d83c4db4b90732a479eb76209b4241e` and tag `m1-accepted`, and recorded provenance limitations in `docs/source-baseline.md`. This preserves the received evidence; it does not retroactively prove every earlier artifact was generated from that commit. External publication remains subject to the existing release authorization boundary.

### Focused product follow-up

- While only the simulated experience is available, make **Try the guided demo** the primary entrance action. Keep the permanent mock label and sample-text guidance.
- Separate participant completion from the curator demonstration. A real participant finishes with a saved submission, accurate anchoring status, and a downloadable receipt; opening and rewarding belong to the curator. In the tour, label the role transition explicitly as **View the curator demo**. Do not imply that a visitor can open other submissions.
- Keep the candle metaphor alongside a plain explanation of an **optional testnet reward**. For live rewards, display a readable token denomination with exact integer base-unit conversion; retain base units in technical details and never use floating-point currency arithmetic.
- Run three first-time-user comprehension trials on the mock before live UX implementation, including a mobile-width journey. Record uncoached completion, time to complete, confusion, and whether each person understands who can read the story, what a receipt proves, and that rewards are discretionary. Target at least two uncoached completions and all three explaining the content/payment privacy distinction; fix blocking misunderstandings and retest. These trials can proceed while M2 is blocked without starting backend feature work.
- Test the value statement: **“Submit a private story, keep verifiable proof that it arrived, and optionally receive a private reward.”** Ask whether proof of arrival is useful and why; treat usefulness as an unvalidated product hypothesis rather than inferring demand from visual quality.

Keep this follow-up bounded to clarity and observed usability issues. Preserve M1 acceptance; track new work separately. Early trials supplement, rather than replace, live release trials and the M6 operational gates.

**Original M1 brief, retained as acceptance context / P0 / October 2–4 / estimated 12–18 engineering hours; completed October 2.** Build a polished, clickable frontend mockup before implementing services or contracts. A visitor should understand the app within 30 seconds and complete the guided story in under three minutes. This first deliverable is a runnable interface, not only a landing page or static design file. The review follow-ups above govern subsequent changes.

### M1 brief for the design/frontend agent

Build a React + TypeScript + Vite app in apps/web, using a small, consistent CSS token system and accessible UI primitives. Use deterministic fixtures and a typed mock adapter; no wallet, account, database, or network is required. Add a Docker dev/build workflow at this milestone. All package installation happens inside the build/dev container.

Design direction: an elegant haunted post office. Ink-black and midnight plum surfaces, parchment text, candle amber primary actions, restrained spectral mint confirmation states, a wax-seal motif, and generous whitespace. Use a readable serif for headings and a clean sans serif for controls. Self-host fonts with compatible licenses. Use lightweight CSS/SVG decoration; motion must respect reduced-motion preferences. Avoid a generic crypto trading dashboard. The main verbs are **Enter room**, **Seal submission**, **Check receipt**, **Open envelope**, and **Send private reward**.

| Screen | Required behavior | Important state |
|---|---|---|
| Room entrance | Explain the three actions, show one featured Halloween prompt, expose the guided demo | Persistent “Mock demo — no funds move” banner |
| Submission desk | Enter up to 2,000 UTF-8 bytes of text; optional same-network payout address; show a privacy preview | Empty, oversized, invalid address, encrypting, sealed |
| Sealed receipt | Show the mock envelope digest, mock inclusion status, downloadable sample receipt | Clearly marked fixture; no fake live explorer link |
| Curator inbox | Switch to a fictitious curator, open one envelope, choose a discretionary reward | Locked key, unreadable envelope, opened, selected |
| Reward confirmation | Show recipient, amount, network, fee estimate, custody explanation, deliberate confirmation | Declined, pending, confirmed, unknown outcome |
| Privacy inspector | Compare public observer, curator, and operator views of the same synthetic record | Native payment privacy and app encryption labeled separately |
| Recovery and outage | Show lost curator key, network unavailable, delayed receipt, unavailable wallet | Useful next action; never a false success |

Required interactions: complete a submission; switch demo roles; simulate decrypting; simulate a reward; inspect the public representation; reset fixtures. Use component states and routing that the live adapters can reuse. Small-screen layout must support 360 px width; desktop target 1440 px. All forms have labels, keyboard focus, readable validation, and status announcements. Do not rely on colors alone.

**Acceptance evidence:** screenshots of every core screen, a short walkthrough recording, and a browser test covering the whole fixture journey. Record evidence under docs/evidence/m1/. Verify 360/768/1440 px layouts, keyboard-only completion, reduced motion, and contrast. The mock must run with a documented Docker Compose command from a fresh checkout.

**PM review:** Can a first-time visitor describe the value without understanding blockchain? Does the reveal feel memorable? Does every loading/error state explain the next action?

**Architect review:** Are mock identifiers unmistakable? Is the future wallet API hidden behind an adapter? Does the design avoid promising anonymity, automatic escrow, or timed decryption?

**Exit:** a runnable mock, evidence, and an implementation-ready screen inventory. Fix concrete usability issues before integrating the backend. Do not make a second approval request for routine styling decisions; use this brief.

## 2. Product strategy and contest fit

### Why this concept

The contest asks for a strong demonstration of Tari privacy. Hauntbox gives the audience two understandable secrets: **the submission content** and **the reward**. Encryption protects the content; Tari protects native transfer values and stealth output ownership. An original Ootle template anchors submission integrity, so there is meaningful programmable-chain behavior as well as a payment.

The themed launch room is **“The Last Letter: send a two-sentence ghost story.”** A visitor seals a story, sees a cryptographic receipt, watches a curator open a synthetic example, then sees a real stealth reward arrive in an independent recipient wallet. The reusable product after Halloween is a private submission box for creative contests, community suggestions, and small research exercises. Do not position this beta as a high-risk whistleblowing service.

| Candidate considered | Attractive feature | Delivery risk | Decision |
|---|---|---|---|
| Sealed auction | Strong privacy narrative | Private bid comparison, escrow, and reveal fairness create a large security scope | Defer |
| Anonymous confession wall | Immediate theme recognition | Weak native Tari demonstration and public-content moderation burden | Reject for October |
| Private gift links | Strong visual demo | Bearer-link theft, redemption races, and recovery complicate the first release | Defer |
| Hauntbox | Secret submissions, chain receipts, native private rewards, clear demo | Wallet compatibility and honest metadata disclosure need early proof | Build |

These are product judgments, not an official judging rubric. Our internal priority is: demonstrated native privacy, understandable usefulness, reliable execution, thematic polish, then additional features. A small working product with inspectable evidence is more valuable than an ambitious incomplete system.

### Scope contract

**Must ship:** one operator/curator; multiple bounded rooms created by that operator; browser encryption; immutable room encryption-key fingerprint; encrypted envelope storage; an original Ootle receipt template; downloadable inclusion receipts; real native stealth rewards; an independent receiver-wallet demonstration; explicit custody/privacy statements; guided fixture demo; source, license, tests, deployment and recovery instructions.

**Nice after all release gates pass:** a second room theme, participant self-service receipt verification UI, extra languages, a recipient wallet setup guide, or a short read-only payment disclosure export. Cap additions at one small feature.

**Defer:** multi-tenant host signup, participant deposits, escrow, guaranteed prize pools, custom currencies, NFTs, public voting, private on-chain computation, timed decryption, ZK proofs written by this team, mobile apps, bridges, production L1 nodes, a bespoke browser wallet, and attachments. Text-only envelopes keep the security and storage surface small.

**Reward policy:** the curator may choose whether and whom to reward. A receipt is not a promise of payment. Never display an unfunded “guaranteed bounty.” Do not sell entries or charge entrants.

### Success measures

- Three independent trial users can explain the content/payment privacy distinction after using the demo; at least two complete submission without coaching.
- A judge can reach the guided demo from the landing page in one click, without an account or wallet.
- The release evidence contains successful room creation, encrypted submission anchoring, a real stealth transfer, recipient detection, and public-observer inspection.
- No fixture record appears as live evidence; no sensitive payload appears in public logs or browser telemetry.
- Every mandatory release gate in section 11 passes, with dated evidence.

## 3. Contest dates, eligibility, and delivery requirements

The [October thread](https://community.tari.com/t/october-build-contest-thread-spooky-secrets/396) confirms the theme and requires the announcement on **Bluesky or Reddit**. The [general rules](https://community.tari.com/t/ootle-launch-date-and-launch-contest-rules/323) set the monthly cutoff at the start of the following month in UTC.

| Item | Planned interpretation/action |
|---|---|
| Theme announcement | October 1, 2026; begin new project code after announcement |
| Hard cutoff | November 1, 2026 at 00:00 UTC = October 31 at 8:00 p.m. America/New_York (EDT) |
| Internal submission target | October 30 at 20:00 UTC = 4:00 p.m. EDT; 28-hour buffer |
| Ootle launch | Announced for November 11, 2026; demonstrate October work on verified testnet |
| Originality | New project implementation; no borrowing from other contest submissions; record dependency provenance |
| License | MIT for original project files; retain required dependency notices |
| Eligibility | Owner/team must confirm they are not Tari Council members or Tari Labs employees |
| Forum entry | One submission post, edited for updates; project discussion in a separate thread |
| Required links/data | Public source/app URL, project description, owner-supplied prize payment address, public Bluesky/Reddit announcement URL |

The announced prizes are 1,000,000 / 500,000 / 250,000 XTM. Keep the **contest payout address** distinct from app testnet Ootle addresses. Ask the owner to confirm the network/address requested by the organizers before submission. Never invent an address or substitute a faucet wallet. Rules do not explicitly resolve all AI-assisted authorship questions; disclose tools/provenance and have the owner check any organizer clarification without treating AI assistance as automatically disallowed.

## 4. Architecture decisions and facts already checked

### Evidence as of October 2

The supplied folders are source snapshots without visible .git directories; no commit SHA was established. They are useful API references, not proof of compatibility with the currently deployed testnet. Do not copy them into this repository.

| Finding | Local/official evidence | Consequence |
|---|---|---|
| Development snapshot is newer than the installed skill examples | L2 Cargo.toml says workspace 0.43.0; template_lib is 0.33.0; rust-toolchain.toml says 1.97.1 | Select a compatible released set at M2; do not hardcode skill examples 0.31/0.40 |
| Official setup guide presently names Esmeralda and lists wallet 0.42.0 | [Wallet setup](https://ootle.tari.com/guides/setup-a-wallet/) | Verify network and runtime RPC before implementation; local README still mentions Igor |
| Native stealth transfer RPC exists in the snapshot | clients/wallet_daemon_client/src/lib.rs and types.rs; bindings/src/types/wallet-types/StealthTransferRequest.ts | Preferred wallet boundary is an authenticated internal RPC adapter |
| WalletConnect surface lacks a direct stealth-transfer operation | applications/tari_walletd/web_ui/src/components/WalletConnectLink/WalletConnectLink.tsx | Do not assume a browser “connect wallet” button can perform the required transfer |
| Standard Ootle image contains indexer/validator binaries, not wallet/swarm | docker/README.md | Build a dedicated wallet runtime image from a verified release artifact or pinned source |
| No host toolchain installation is needed | Docker client and running server 29.4.0 were found | Use existing Docker for development and testing |
| Contract has an epoch query | crates/template_lib/src/consensus.rs: Consensus::current_epoch() | Use chain epochs for inclusion context; do not invent a contract UTC timestamp API |

Snapshot fingerprints for future agents to detect reference changes:

~~~text
L2 Cargo.toml SHA256:
4B73A82F487AE009966882B7C845C2396010CC62F2E6CB19A10A16F7DD2156AA
L2 bindings/src/types/wallet-types/StealthTransferRequest.ts SHA256:
61FF45150F92034459EAC6BC9DDD5CD9B913F48C9F80B2C7945ECA4E97068018
L2 applications/tari_walletd/web_ui/src/components/WalletConnectLink/WalletConnectLink.tsx SHA256:
D226FE826A00C8DA61BDDEAD83A13377C3CD77DC1EF7B62553525C6D579A0AA3
~~~

### M2: local capability and public-network feasibility gates

**October 5–6; 12–18 hours, maximum two working days.** The architect/integration agent must produce docs/evidence/m2/capabilities.md and docs/adr/001-network-wallet-versions.md with versions, checksums, exact requests, sanitized responses, and transaction IDs from the target network.

1. Pin a published wallet, template library, test harness, TypeScript bindings/client, Rust toolchain, and container images compatible with one network. Check registries and release notes; record the exact resolution in lockfiles. Do not use development tags or unverified git dependencies in release builds.
2. Run two independently keyed wallet containers, sender and receiver, with persistent named volumes. Fund only with faucet tokens. Confirm their network IDs match the indexer. Prove restart/unlock in a container without relying on the Windows OS keyring.
3. From already-created stealth inputs, make one native transfer with positive blinded recipient amount, zero revealed recipient amount, and concealed change. Inspect how fees are sourced and which signatures are visible. Public fees and transaction structure are expected. Receive and identify the output in the other wallet. Then spend it once to prove the recipient controls usable funds.
4. Include a short encrypted message memo and confirm recipient recovery. Keep the application memo under 120 UTF-8 bytes. The snapshot limits message bytes to 253 after encoding overhead; validate the selected release rather than assuming every advertised 255-byte payload fits.
5. Inspect the public transaction/substates, not merely wallet UI labels. Check for accidental plaintext amount/address/memo leakage, revealed input correlation, stable signer links, and logs. Produce a field-by-field privacy report. Redacted screenshots alone are insufficient.
6. Compile a minimal original receipt template with the selected matching test harness, publish through the wallet UI, create a component, invoke it, and query inclusion from the indexer. Resolve fee estimation and WASM size limits here.
7. Exercise dry-run, final receipt, failed transaction, expired credentials, and timeout responses. In the snapshot, StealthTransferResponse only returns transaction_id; fee estimates/results require further lookup. Document actual semantics.

**Funding revision — October 2:** follow [the funding and production migration plan](docs/funding-plan.md). Automated chain tests use faucet-origin funds. Use the official harness and a funded local-network faucet for repeatable testing, and a separate protected public-testnet workflow for live proof. The recorded public faucet read was empty; a claim has not been attempted. That observation does not block deterministic engineering or local testing. Implement FUND-01/TEST-01 next; public claim eligibility and funding belong to FUND-02. Keep public testnet funding faucet-only; do not fund the authentication-disabled preflight.

**M2a — local capability:** pinned compatible artifacts, engine tests, authenticated/local-isolated wallets, actual local faucet claim, concealed transfer and independent receiver spend, original receipt publication/call, and recovery evidence. Funding/test infrastructure and deterministic crypto/API/schema work may start with provisional interfaces now. After M2a passes, M3–M5 may proceed locally while public proof remains open.

**M2b — public proof:** repeat the native-privacy, receiver-spend, publication/call and observer checks on verified public Esmeralda with faucet-origin funds. This remains mandatory before public beta deployment and live capability claims. M2 is complete only when M2a and M2b pass. Neither startup/WASM compilation nor a local-only pass satisfies M2b.

**Go:** native privacy and template calls work on public testnet, receipts can be reconciled, and wallet containers restart safely.

**Fallback order:** use a compatible released wallet first; if its transfer RPC is insufficient, implement a narrow Rust ootle-rs adapter in a container using a verified compatible release. Cap this alternate spike at one extra day and cut optional polish. Do not recreate crypto primitives. Do not convert rewards to public transfers without explicitly redesigning the product claim.

**If the public gate cannot pass:** classify the exact funding/network failure, continue local faucet-funded testing and permitted engineering, prepare a request for official faucet replenishment, and re-evaluate the public release schedule. Sending that request requires explicit messaging authorization. Preserve localnet/recorded evidence labels. A public faucet outage must not turn unrelated tests red or a missing live check green; M2b remains unsatisfied.

### Chosen system

Default stack: **React/TypeScript/Vite web app + Node/TypeScript Fastify API and worker + PostgreSQL + a thin Tari wallet adapter + Rust receipt template + Caddy**, all deployed with Docker Compose on one VPS. Use a PostgreSQL jobs/outbox table before adding a separate queue service. Store bounded encrypted envelopes in PostgreSQL bytea, avoiding an object-storage service for this text-only release.

~~~mermaid
flowchart LR
  V[Visitor browser: encrypt text] --> P[HTTPS reverse proxy]
  H[Curator browser: decrypt locally] --> P
  P --> W[Static web app]
  P --> A[API: sessions, encrypted envelopes, receipts]
  A --> D[(PostgreSQL + outbox)]
  D --> J[Reconciliation and anchor worker]
  J --> R[Restricted Tari adapter]
  R --> F[Receipt wallet: fee funds only]
  R --> T[Reward wallet: capped testnet funds]
  F --> N[Ootle testnet + indexer]
  T --> N
  N --> C[Receipt template/component]
  N --> U[Independent recipient wallet]
~~~

The host browser holds the room decryption key. The operator controls service infrastructure and reward-wallet keys. The curator and operator may be Kyle in the first deployment, but these are separate trust roles in the privacy model. The server sees a selected reward's address and amount when the curator authorizes it. The app accepts no participant funds and holds no participant wallet keys.

The default public app does not require a wallet to submit a story. A visitor may include an existing testnet address inside the encrypted envelope to receive a reward. Show instructions for the official wallet; do not require judges to install it to try the fixture demo. A real independent recipient wallet is used in recorded/live evidence.

| Deployment option | Decision | Reason/tradeoff |
|---|---|---|
| One VPS, Compose, public HTTPS domain | Default | Reproducible containers, long-lived wallet/worker, simple same-origin browser policy; operator owns backups |
| Vercel frontend + container VPS | Optional after core works | Familiar frontend previews; adds origins and deployment coordination. Wallet/worker remain on VPS |
| Supabase managed database/auth | Optional if operations become the bottleneck | Reduces database operations; adds third-party metadata exposure and requires authorization/RLS testing |
| Full L1/L2 network in production | Excluded | App uses public testnet indexer; localnet containers are only a development fallback |
| Production Esmeralda wallet preparation | Implemented, release gates open | compose.beta.yaml uses Tari public indexers with separate WebAuthn wallets; optional loopback-only admin UIs; docs/runbooks/esmeralda-beta.md |

Use the owner's existing domain with an app subdomain chosen at deployment. Initial VPS sizing assumption: 2–4 vCPU, 4–8 GB RAM, 40–80 GB disk for the application and wallet services, not full nodes. Measure during M2; do Rust builds in CI or a build container. Reserve a provisional USD 50–100 monthly operating ceiling including backups, not a provider quote. Obtain current pricing and the owner's spend authorization before renting anything.

## 5. Privacy and security specification

### Claims the product may make

“Your submission is encrypted in your browser for this room's curator. Ootle records a fingerprint of the encrypted envelope. Rewards use Tari stealth transfers. The curator and reward operator can see the selected reward; public observers see fees and transaction structure.”

Tari's [privacy documentation](https://ootle.tari.com/concepts/privacy/) explains hidden amounts and stealth ownership alongside visible fees, signatures, and transaction graphs. Hauntbox must measure its own transaction behavior and publish the result. Browser encryption is an application feature; it must not be presented as confidential execution of arbitrary Rust template state.

| Information | Public visitor / chain observer | Curator browser | App/reward operator |
|---|---|---|---|
| Room prompt, public policy, key fingerprint | Visible | Visible | Visible |
| Submission plaintext | Hidden in normal operation | Decryptable on arrival | Encrypted storage; no decryption key in service configuration |
| Submission ID/digest and chain inclusion | Visible on chain | Visible | Visible |
| Entrant payout address | Not in public app records/receipt | Inside decrypted envelope | Visible if selected for payout |
| Reward amount / memo | Cryptographically hidden on chain if M2 passes | Visible | Visible to wallet service |
| Reward recipient output | One-time output key visible; recipient link not directly encoded | Known from decision | Known from payout request |
| Fees, time, activity, transaction graph | Visible or inferable | Visible | Visible |
| IP / user agent / session timing | Not public by default | Not needed by curator UI | Infrastructure can observe it; minimize retention |
| Real-world identity | No identity field required | User may reveal it in text | Network metadata may correlate activity |

Scope limits: an actively malicious operator could serve modified JavaScript; a compromised browser could steal plaintext or keys; the curator may share decrypted content; link analysis remains possible. Per-room key rotation limits cross-room exposure but does not provide forward secrecy. An immutable fingerprint helps an independent verifier detect key substitution; it cannot protect a visitor using attacker-modified verification code from the same server.

**No timed secrecy promise:** the curator can decrypt immediately. Closing the room stops submissions; it does not release a cryptographic time lock. **No anonymity promise:** avoiding an account does not conceal IP addresses or timing. **No censorship resistance promise:** the operator can refuse to store or anchor an entry. **No payment proof from an anchor:** content inclusion and a reward are distinct operations.

### Envelope and key handling

Use the maintained [jose library](https://github.com/panva/jose) for standard JWE, backed by browser Web Crypto. Target RSA-OAEP-256 with a 3072-bit per-room RSA key and A256GCM content encryption; test availability in supported browsers at M3. Do not implement RSA, AES, or a custom key-exchange protocol. [Web Crypto supports encrypted key export](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/wrapKey); extractability and backup flow must be deliberate.

Specify the exact envelope format in packages/crypto/README.md and shared schemas:

- Fixed protected-header fields: format version, network ID, room component address, random 32-byte submission ID, and key thumbprint, plus required JWE algorithm fields. Headers contain no plaintext title, wallet address, or identity. Validate every context field after authenticated decryption.
- Plaintext payload: version, text, optional payout address, and optional local display nickname; no hidden tracking fields. Limit text to 2,000 UTF-8 bytes and total encoded payload to 4,092 bytes. Prepend a four-byte payload length, then pad to exactly 4,096 bytes before encryption. Reject overflow instead of truncating.
- Let the library create fresh content keys and IVs for each envelope. Disable compression. Allowlist algorithms and format version; reject unknown critical headers and malformed encodings. Do not auto-fetch keys from URLs supplied in the envelope.
- Store exact compact-JWE ASCII bytes, maximum 8 KiB. Define envelope_digest as SHA-256 of the fixed ASCII prefix “hauntbox:envelope:v1:” followed by those exact bytes. Never parse and reserialize before hashing. This commits to randomized ciphertext, avoiding a dictionary attack on short plaintext hashes.
- Bind the JWK thumbprint to the immutable room definition on chain. Verify it in the browser before sealing; independently verify the release manifest and room creation receipt in the evidence.
- Generate a 256-bit random recovery key in the curator browser. Use it to encrypt an export of the room private key; provide the encrypted recovery file and recovery code separately. Require a successful restore/decrypt exercise before activating a room. Do not upload either recovery secret or raw private key to the API. Discard exportable in-memory handles after creating the recovery bundle and reimport the working key as non-extractable where supported.
- For the beta, import/unlock the recovery bundle for each curator session; keep the active key in memory, clear references on lock/logout, and do not persist plaintext in localStorage. JavaScript cannot guarantee immediate memory zeroization; do not claim it does.
- Losing the recovery materials permanently loses decryption. Authentication reset does not recover room keys. Keep encrypted-envelope backups and key recovery operationally separate.

### Operational protections

Use same-origin HTTPS, strict CSP, no third-party analytics/session replay on submission or curator routes, self-hosted assets, safe text rendering, request size bounds, and no HTML/Markdown execution inside submissions. Prevent plaintext exposure through SSR, search indexing, error traces, clipboard automation, screenshots, and downloaded evidence. Default evidence uses synthetic stories and independently generated test keys.

Use a maintained WebAuthn library for one pre-provisioned curator account. Disable open administrator registration; allow the first credential through a short-lived bootstrap secret delivered out of band. Use secure HttpOnly SameSite cookies, server-side session expiry/revocation, origin checks, CSRF protection, and fresh authentication before authorizing a reward. The room decryption key remains separate from login credentials.

Enforce conservative anonymous submission limits at API and proxy layers: one outstanding upload challenge per browser/session, a small per-IP rate budget, room capacity, bounded body size, global daily anchor-fee budget, and queue length limits. Rate limits reduce abuse; they do not prove one human per entry. Return 429 with retry guidance. Avoid a third-party CAPTCHA until measured abuse requires it.

Make logs allowlisted: request ID, route template, response code, latency, and coarse error code. Exclude bodies, authorization headers, lookup tokens, private addresses, amounts, wallet RPC payloads, and raw IPs from routine application logs. Check wallet/proxy/container logs too. Use short-lived rate-limit counters; document any infrastructure access-log retention. Default encrypted-envelope retention: 30 days after room close; document database/backup purge latency. On-chain digests cannot be deleted.

## 6. Build specifications and interfaces

### 6.1 Original Ootle receipt template

Build a small Rust template named HauntboxRoom. It records encrypted-envelope inclusion only; it holds no prize vault and makes no promise about content or rewards. One bounded component per room limits contention and state growth. Default capacity 128 entries; support creating another room rather than an unbounded map.

Proposed ABI below is a project design, not a claim that upstream Tari already implements these methods. Freeze exact supported types at M2.

| Method | Authorization | Required behavior |
|---|---|---|
| new(config) | Operator receipt signer | Create immutable room UUID, network context, encryption-key thumbprint, public-policy digest, capacity, optional closing epoch, and receipt authority |
| seal(submission_id, envelope_digest) | Receipt authority only | Verify open/epoch/capacity; record digest and current epoch; same ID+digest is an idempotent lookup; same ID+different digest rejects |
| get_receipt(submission_id) | Public read | Return inclusion data for that ID or absence |
| close() | Receipt authority only | Permanently close intake; existing receipts remain readable |
| get_room() | Public read | Return immutable config, status and count |

The component stores a bounded map of random IDs to digests and inclusion epochs. It never receives plaintext, payout addresses, encryption private keys, or reward amounts. Minimal events include room/submission ID and digest only. Do not add a public per-entry payout event or associate reward transaction IDs with public receipts. Use explicit access rules on every exposed method and a safe default deny rule. Test the authority check through actual engine proofs/signatures; never trust a public-key argument supplied by the caller.

For a closing epoch, accept only when current_epoch < closing_epoch; the exact boundary belongs in tests and copy. UI wall-clock estimates are approximate and the chain controls inclusion. If a UTC submission deadline is shown, distinguish the API intake cutoff from final on-chain inclusion. Stop intake early enough to drain the queue; show any entry that missed anchoring as unanchored. Do not backdate receipts.

Use cdylib for the template artifact, release size optimization, and matching template/test-tooling versions. Keep pure helpers in a separate crate if needed. Estimate publishing fees with the selected wallet and record the resulting WASM hash/template address. The host's .wasm build tools are never installed locally. Template updates create a new template/component version; existing receipts remain associated with their original addresses.

### 6.2 App data model

Migrations are versioned and reversible where safe. Use UTC timestamps in the database and preserve chain epochs separately.

| Table | Fields and invariants |
|---|---|
| rooms | UUID, slug, public prompt/policy, JWK, thumbprint, template/component/network, intake state, capacity, created/closed timestamps |
| envelopes | Random submission ID, room ID, exact JWE bytes, digest, state, lookup-token hash, created timestamp; unique(room, submission ID); immutable ciphertext |
| anchor_jobs | Envelope ID, immutable operation ID, state, lease, attempt count, next attempt time, transaction ID, last safe error; unique anchor operation |
| receipts | Envelope ID, network/component/template, digest, chain epoch, transaction ID, verified timestamp; written only after authoritative committed result |
| reward_intents | Internal reward ID, room/submission ID, status, approved payload digest, idempotency key, expiry, transaction ID; unique reward per submission in v1 |
| reward_private_payloads | Recipient/amount/memo encrypted at rest with an operator-held application key; narrow worker access; purged under retention policy |
| jobs / outbox | Transactionally created work items with uniqueness keys, leases, bounded retry metadata |
| curator_credentials / sessions | Credential public material, challenges, session hashes, expiry and revocation; no room decryption keys |
| audit_events | Actor, action, internal IDs, before/after state, timestamp; no secret values or plaintext |

Separate browser-supplied data, operator assertions, and chain-verified facts in both schema and UI. PostgreSQL encryption at rest does not hide payout payloads from the operator holding the encryption key. The server's inability to decrypt stories depends on those story keys remaining browser-held.

### 6.3 API boundary

Before implementing live integration, replace the mock-oriented adapter contract with explicit trust boundaries. The current `seal(draft, scenario)` / `open(...)` interface handles plaintext locally and uses fixture-only types; it must not become a server API for plaintext submission or curator decryption.

| Responsibility | Boundary / acceptance |
|---|---|
| Seal and open story/payout envelope; manage curator keys | Browser-only crypto module; plaintext drafts and room private keys never cross the submission API boundary |
| Store encrypted bytes and track anchoring | Typed application API and worker; submission requests contain bounded ciphertext and validated public context only |
| Authorize and execute a selected reward | Authenticated payout service; recipient and amount are deliberately disclosed here under the existing consent and custody model |
| Simulate outcomes and inject failures | Demo implementation only; scenario controls are absent from live request schemas |
| Distinguish fixture and live evidence | Explicit discriminated record types and runtime validation; fixture identifiers, simulated network strings, and `fixture: true` records cannot satisfy live receipt/payment contracts |

ARC-01 owns these contracts. During UX-02, split the large `App.tsx` into route components and focused state logic as needed for integration, preserving the established design and behavior. This is a bounded refactor, not a frontend rewrite or new framework project. Verify the boundary with request-payload tests showing that story plaintext and room private keys are absent, while intentional selected-payout disclosure remains explicit.

All routes use runtime schemas and generated OpenAPI/types. IDs are random and unguessable where appropriate, but random IDs do not replace authorization. Endpoint names below are the intended app API, not Tari RPC names.

| Endpoint | Access | Contract |
|---|---|---|
| GET /api/rooms/:slug | Public | Public room metadata, key, verified chain config, availability |
| POST /api/rooms/:id/challenge | Rate-limited visitor | Issue a short-lived upload challenge; no reward eligibility promise |
| POST /api/rooms/:id/envelopes | Challenge + idempotency key | Accept bounded JWE + submission ID; persist envelope and outbox atomically; return 202 with pending state |
| GET /api/envelopes/:id/status | Separate lookup capability in Authorization header | Return private processing status and receipt access; never return reward amount |
| GET /api/receipts/:id | Public | Chain inclusion data only; absence of an anchor is explicit |
| GET /api/curator/rooms/:id/envelopes | Curator session | Return ciphertext for local decryption; paginated |
| POST /api/curator/rooms | Fresh curator auth | Submit public key/config; activate only after chain creation and verified key recovery |
| POST /api/curator/rewards/quote | Fresh curator auth | Validate network, recipient, amount and budget; produce expiring quote/intent |
| POST /api/curator/rewards/:id/confirm | Fresh auth + CSRF + intent digest | Confirm the exact quote once; reject mutation or expiration |
| GET /api/curator/rewards/:id | Curator session | Return true reconciliation state and private transaction result |
| GET /health/live and /health/ready | Minimal public responses | Liveness and dependency readiness without credentials or internal hostnames |

The browser creates a separate 256-bit receipt lookup capability; store its hash, never put it in query parameters or logs. Offer an explicit receipt download. A repeated envelope request must return the existing record, not create another fee-paying operation. Metadata/key mismatches reject; the API cannot validate a story's semantics before decryption and must not pretend it can.

Store-before-anchor is deliberate: database durability and blockchain finality cannot be one atomic transaction. If the chain call fails, preserve the encrypted entry as unanchored and allow a safe retry. If storage succeeds and the service dies, the outbox recovers work. A receipt confirms a digest was recorded; it cannot guarantee permanent data availability. Offer encrypted envelope + receipt export for independent preservation.

### 6.4 Native reward integration

Keep Tari RPC private behind an adapter with an explicit method allowlist. Browsers must never receive an operator wallet bearer token or call an unrestricted wallet proxy. Separate receipt-fee and reward wallets, credentials, and budgets. Keep published app API permissions narrower than wallet permissions.

Required adapter operations: getNetwork, getHealth, getSpendableBalance, createOrCallRoom, queryReceipt, quoteStealthReward, submitApprovedReward, and reconcileTransaction. A separate internal funding job implements faucet inspection/claim/reconciliation under docs/funding-plan.md; faucet Admin credentials never enter the browser or ordinary payout worker. Implement against generated types from the pinned release. Amounts use checked integer base units serialized as decimal strings; never JavaScript floating-point currency arithmetic. Reject fractional overprecision, overflow, zero/negative rewards, wrong-network addresses, and wrong resources before authorization.

The inspected RPC model has separate input_selection and fee_params.input_selection. Investigate their behavior independently. Prefer ConfidentialOnly where that release uses the enum for stealth inputs; fail closed if private spendable inputs are unavailable. A compatibility layer must explicitly ensure: blinded recipient amount > 0, revealed recipient amount = 0, native resource/address correct, private change, attach_sender_address false, and no unintended address-embedded pay reference. Verify fee intent and signatures on the actual serialized transaction. Never silently fall back to RevealedOnly or a public account transfer.

The reward memo is a short recipient-only message such as “A candle for your story — Hauntbox”. Do not embed public submission IDs or sensitive story text. Reward links are private in app records. A public demo may reveal synthetic identities and amounts deliberately; label those as disclosures, not data obtainable from chain observation.

Quote confirmation binds the exact network, recipient, amount, approved maximum fee, expiry, and intent ID. A material fee/recipient change requires a new confirmation. Estimate with dry-run and a bounded reserve; do not hardcode example fees as guaranteed charges. Enforce maximum per-reward and daily expenditure in both app configuration and the operator's funded-wallet balance. Do not auto-refill funds without a configured owner-approved ceiling.

### 6.5 Transaction states and failure recovery

~~~text
Envelope: draft -> encrypted -> stored -> anchor_pending -> anchored
                                      -> anchor_failed / expired
Reward:   quoted -> approved -> submitting -> pending -> confirmed
                                 |           |       -> rejected
                                 +-----------> unknown -> reconciled
~~~

Never mark anchored/confirmed on an HTTP success alone. Require the network's committed success outcome and the expected component/output effect. A failed main transaction may still consume fees; preserve that outcome separately from an issued reward.

The current mock lets the UI simulate a confirmed reward and keeps confirmation reservations in an in-memory map. These demonstrate interaction behavior only. Live confirmation is owned by the reconciliation service; the browser reads durable intent status and cannot set `confirmed`. Reloading or reconnecting must recover the same submission/reward intent. Demonstrate browser reload during anchoring, worker restart after payment submission, concurrent confirmations from separate clients/workers, and a clean-browser curator key restore. Ambiguous submission outcomes must not produce a second transfer. Preserve a separate, explicitly simulated confirmation control only inside the guided demo.

Reward confirmation acquires a database lock and uniqueness constraint on its intent. Persist the exact signed transaction before broadcast if the selected SDK exposes that safely; rebroadcast only the same transaction. If the wallet RPC constructs and submits internally, a crash after submission but before receiving its transaction ID creates an **unknown** result. Freeze that intent, query wallet/indexer history, and reconcile using authoritative records. Do not call the transfer RPC again merely because a timeout elapsed. If reconciliation cannot establish the outcome, require operator resolution; do not claim automatic exactly-once payment.

Serialize spends for each wallet until input concurrency is proven safe. Use bounded exponential retries only for safe reads and idempotent anchor work, with leases so crashed workers can resume. An anchor's on-chain ID+digest idempotency protects against duplicate writes, but repeated failed transactions can still spend fees; check chain state before retrying.

Provide kill switches for new submissions, anchoring, and payouts separately. An indexer outage produces pending/unknown state, not mock success. A testnet reset invalidates old deployments: display their retired network instance, preserve evidence, redeploy under a new manifest, and never relabel old receipts as current.

## 7. Repository, containers, and local workflow

The new repository root is **hauntbox/**. The two supplied source folders remain outside it. Its .gitignore and .dockerignore also exclude those folder names defensively. Never add the parent workspace as a Docker build context or vendor the Tari trees.

The following is the intended completed layout. At plan delivery only README.md, PROJECT_PLAN.md, AGENTS.md, LICENSE, .gitignore, and .dockerignore exist; build files below are future tasks.

~~~text
hauntbox/
  README.md                   # Quick start, network, live/demo links
  PROJECT_PLAN.md              # This plan and milestone status
  AGENTS.md                   # Agent constraints and handoff rules
  LICENSE
  SECURITY.md                 # Reporting route and supported beta scope
  PRIVACY.md                  # Data visibility and retention
  THIRD_PARTY_NOTICES.md
  .env.example                # Placeholder configuration only
  .gitignore
  .dockerignore
  compose.yaml                # Dev/tool/test services and named volumes
  compose.prod.yaml           # Production overrides
  package.json
  pnpm-workspace.yaml
  pnpm-lock.yaml
  apps/
    web/                      # Mock/live adapters, rooms, curator UI
    api/                      # Sessions, validation, encrypted storage
    worker/                   # Anchoring and reconciliation
  packages/
    schemas/                  # Versioned API/envelope definitions
    crypto/                   # JWE wrapper, context checks, key recovery
    tari-adapter/              # Pinned RPC client and privacy policy checks
    ui/                       # Small shared component/token set
  contracts/
    Cargo.toml
    Cargo.lock
    rust-toolchain.toml
    hauntbox-room/             # Original WASM template
    room-tests/                # Matching TemplateTest harness
  infra/
    docker/                   # Node, Rust, browser test, wallet images
    caddy/
    migrations/
  scripts/                    # Container-internal tasks and thin host wrappers
  tests/
    contract/
    integration/
    e2e/
    security/
  docs/
    adr/
    evidence/m1/ ... m7/
    runbooks/                 # Deploy, rollback, backup, reset, reconciliation
    deployments/              # Public network/template/WASM/version manifests
    submission/               # Forum/social drafts, screenshots, video script
  .github/workflows/          # CI and release container builds
~~~

### Container contract

Provide services/profiles for web-dev, api, worker, postgres, receipt-wallet, reward-wallet, an optional independent recipient wallet, Rust builder, and browser-test runner. Runtime application images use multi-stage builds and non-root users. Build toolchains and browser dependencies live inside images; node_modules, Rust target/cache, PostgreSQL and wallet data use separate named volumes. Windows bind mounts contain source only; scripts use LF line endings.

Only the reverse proxy publishes production HTTP/HTTPS ports. PostgreSQL and wallet RPC ports stay on internal networks, with firewall rules verified externally. Local development ports bind 127.0.0.1. Restrict SSH to the administrator's access method. Use service health checks, startup retries, resource limits, rotated logs, read-only root filesystems where compatible, and minimal writable mounts. Do not expose a Docker daemon or mount its socket into containers.

Build the wallet image from a selected upstream release binary with recorded checksum and compatible runtime libraries. If source build is needed, fetch the exact tag/commit inside a build container and preserve provenance. The upstream node image cannot be assumed to supply walletd. Verify the actual release's auth and headless key-storage options. The snapshot's override_keyring_password option demonstrates a potential headless route, but design secret-file injection around the pinned runtime; avoid plaintext secrets in committed Compose commands or image layers.

Use mounted secrets or the host's secret mechanism for wallet unlock material, scoped API keys, session/bootstrap secrets, and payout encryption keys. Keep backups encrypted using a separately stored recovery key. Separate dev/staging/public wallet seeds. Wallet management UI access should use an administrator tunnel; never expose an unauthenticated wallet UI on the public domain.

The infra agent must implement and document these command contracts; they are not runnable yet:

~~~sh
# M1: only the mock frontend, build tools inside Docker
docker compose --profile mock up --build web-dev

# Integrated development using testnet, no host Node/Rust/database installs
docker compose --profile dev up --build

# Quality gates, service-specific tool dependencies built into the images
docker compose --profile tools run --rm node-tools pnpm check
docker compose --profile tools run --rm node-tools pnpm test
docker compose --profile tools run --rm rust-tools cargo test --locked
docker compose --profile test run --rm e2e

# Stop containers while retaining state; do not add -v casually
docker compose down
~~~

If Docker is unavailable later, use a remote Docker host. Do not solve that by installing random toolchains on the Windows PC. Publication requires a real image tag/digest, checked configuration, migration plan, and backup; do not deploy from an untracked workstation state.

## 8. Delivery roadmap and capacity

Assumption: one primary builder using coding agents, approximately **102–148 focused engineering hours** across October 2–29, plus roughly 8–12 owner hours for visual review, wallet demonstrations, trials, and release decisions. These are planning ranges, not elapsed agent-runtime promises. If available capacity is below this range, reduce optional features immediately and keep the mandatory privacy demo intact.

| Milestone | Dates (2026) | Hours | Deliverable / exit condition | Dependency | Status |
|---|---|---:|---|---|---|
| M1 Frontend mockup | Oct 2–4 | 12–18 | Clickable themed journey and browser/visual evidence | This plan | Complete Oct 2 — docs/evidence/m1/README.md |
| M2 Tari feasibility | Oct 5–6 | Re-estimate after receipt publication | M2a local faucet/engine/two-wallet proof; M2b public privacy/receipt proof | M1 | M2a passed: local faucet/private transfer/spend, original publication/call and recovery; M2b public proof open — docs/evidence/m2/local-capability.md |
| M3 Foundation | Oct 7–10 | 20–28 | Containers, migrations, browser/API trust contracts, crypto/recovery, receipt template tests | M2a | Core implemented and locally verified; public release gates remain |
| M4 Working vertical slice | Oct 11–15 | 20–28 | One room/curator: browser encryption → durable ciphertext → independently verified chain receipt → local decrypt → private reward | M3 | Real isolated-chain flow passed; docs/evidence/m2/local-app-journey.json |
| M5 Adversarial QA | Oct 16–20 | 18–26 | Privacy/authorization/retry/recovery tests and fixes; scope freeze | M4 | Core negative/recovery/concurrency tests pass; independent/public review still required |
| M6 Deploy and trial | Oct 21–25 | 10–16 | Domain/TLS, restore drill, 48-hour soak, three user trials | M5 + M2b | Production local preview running; public TLS prepared; drills/trials/soak open |
| M7 Contest release | Oct 26–29 | 10–14 | Tagged release, source, demo video, submission artifacts, final gate review | M6 | Not started |
| Submission buffer | Oct 30–31 | Reserved | Owner publishes by internal target; availability/support and edits | M7 | Not started |

Critical path: **mock experience → wallet/privacy compatibility → encryption + contract/API agreement → full live flow → recovery/security evidence → public deployment → submission**. Do not put real-wallet work off until the end of the month.

Execute early mock comprehension trials and baseline housekeeping during M2 where independent of its funding/network gate. Fit these bounded follow-ups within the existing UX/PM allowance by deferring optional polish; do not silently increase the capacity estimate. Build and validate one room with one curator first. The scoped operator-created bounded-room capability remains a release requirement, but additional room themes and feature expansion wait until the single-room flow and recovery evidence pass. Re-estimate remaining work after M2 from demonstrated compatibility.

### Agent work packages

Roles below are work assignments, not a requirement to create many concurrent chats. A single coding agent can execute them in order. If parallel work is later authorized, first freeze schemas and give each agent exclusive file ownership. One integrator owns lockfiles, schemas, migrations, and Compose changes.

| ID / owner | Task | Depends on | Required evidence |
|---|---|---|---|
| UX-01 / frontend | Implement M1 mock, token system, reusable routes and states | Plan | Screenshots + complete mock E2E |
| BASE-01 / maintainer | Completed October 2: baseline inventory/secret checks and local M1 commit/tag | UX-01 | Source identity and provenance limits in docs/source-baseline.md |
| UX-01a / frontend + PM | Completed October 2: primary guided demo, participant/curator separation, optional-reward language | UX-01 | Updated screenshots/walkthrough; 7 unit + 22 browser tests pass; M1 acceptance retained |
| PM-00 / PM | Protocol prepared; three human comprehension/usefulness trials still pending, including mobile | UX-01; use UX-01a when available | docs/research/mock-comprehension-trials.md; zero completed human trials |
| INT-01 / architect | Execute M2 compatibility and stealth transfer spike | UX-01 | Versions, sanitized requests, tx receipts, receiver scan/spend |
| FUND-01 / integration | In progress: policy, SQLite ledger, released-wallet adapter and local funding CLI implemented | M2 preflight | 50 passing funding/config/RPC/adapter tests; actual two-wallet faucet bootstrap and CLI reuse; docs/evidence/m2/local-wallet.md |
| TEST-01 / QA + infra | In progress: pinned engine and full local-network profiles plus CI jobs implemented | M2 preflight | Six engine tests; actual wallet private reward/memo recovery, receiver spend, observer inspection and restart without resubmission pass; receipt publication/call and full local app journey pass; M2a accepted |
| FUND-02 / integration | Planned: protected public faucet funding and live verification | FUND-01, TEST-01 | Bounded faucet-origin public run; M2b evidence; infrastructure failures correctly classified |
| FUND-03 / operations | Planned: beta funding status, low-balance behavior and refill runbook | FUND-01, API-01; before OPS-02 | Intake/payout pause and reserve/recovery checks |
| PROD-01 / architect | Future mainnet treasury and migration design; outside October implementation | Public beta evidence and separate mainnet scope | Treasury ownership/budgets, faucet disabled, fresh keys/manifests and independent review |
| ARC-01 / architect | Freeze ADRs, browser crypto/API/payout boundaries, fixture/live schemas, envelope format, trust model, API errors | INT-01/M2a for integration freeze; provisional deterministic work now | Reviewable contracts + privacy matrix; ciphertext-only submission schema |
| OPS-01 / infra | Build dev/test/runtime images and Compose profiles | INT-01/M2a for integrated runtime; FUND-01/TEST-01 bootstrap now | Clean container boot/restart; no extra host installs |
| CRY-01 / crypto | JWE sealing/opening, context validation, recovery export/import | ARC-01, OPS-01 | Wrong-key/tamper/context tests, browser restore |
| CHN-01 / Rust | Implement bounded HauntboxRoom and tests | ARC-01, OPS-01 | Access/duplicate/capacity/close/epoch tests, WASM artifact |
| API-01 / backend | Auth, challenge limits, encrypted storage, outbox and status API | ARC-01, OPS-01 | API/auth/isolation/migration integration tests |
| INT-02 / integration | Anchor worker and independent receipt verifier | CHN-01, API-01 | Commit, failure, restart and duplicate request evidence |
| PAY-01 / integration | Quotes, explicit approval, private transfer and reconciliation | INT-01/M2a, API-01; M2b required for live claims | Two-wallet path + unknown-outcome recovery |
| UX-02 / frontend | Integrate browser crypto and live APIs; separate demo; split route/state code as needed; apply early trial findings | CRY-01, INT-02, PAY-01, PM-00 | Complete live journey/outage states; no plaintext submission requests; durable status restored after reload |
| SEC-01 / QA + architect | Threat-model checks, leak probes, load/fault/recovery tests | UX-02 | Mandatory validation matrix passes |
| OPS-02 / infra | Deploy immutable images, domain, monitoring, backups, rollback | SEC-01, FUND-03, M2b | External smoke, restore drill, soak report |
| PM-01 / PM | Trials, clarity fixes, demo, source/license/provenance, entry drafts | OPS-02 | Release/submission checklist with actual links |

### Working agreement between the two personas

**PM:** keep the first user journey short, maintain the critical path, prioritize defects that block understanding or completion, and prevent optional features from displacing release evidence.

**Architect:** require source-backed integrations, explicit secret ownership, transaction reconciliation, bounded state, valid privacy claims, and reproducible deployment. Flag assumptions as gates rather than presenting them as implemented capabilities.

When they disagree, narrow scope while preserving correctness. For example, remove public host registration rather than share unrestricted wallet credentials; remove animations rather than skip payment reconciliation; retain a clearly labeled recording if the network is down rather than relabel fixtures as live.

Every implementation handoff must contain: changed files, decisions, exact validation commands/results, evidence paths, unresolved risks, and the next task ID. A green type check is not proof of wallet interoperability. Update milestone statuses only when the required evidence exists.

### Ready-to-use agent prompts

**Next work package:** Public M2b operation review with faucet-only accounts and measured fee caps; wallet backup/restore, off-host custody and rollback drills; first hosted CI run; PM-00 trials and release soak. Application core and real local journey are implemented. Preserve unknown-outcome freezes, exact transaction journals and separate participant/operator wallets. Public mutations remain disabled until public proof and release prerequisites pass.

**Architect integration agent:** “Execute INT-01/M2. Treat the supplied Tari source snapshots as read-only references. Establish a released version set and demonstrate a native stealth transfer between independently keyed wallets, recipient scan and spend, encrypted memo recovery, public-field inspection, template publication/call, fees and failure semantics. Write an evidence-based go/no-go ADR. Never substitute mocked or public payments.”

**Implementation agent:** “Execute the next ready task in the dependency table. Follow frozen schemas and wallet versions. Implement the success and recovery paths, add meaningful negative tests, keep secrets outside logs/repo, and keep all tooling in containers. Do not claim completion until its evidence and exit criteria exist.”

**Release reviewer:** “Assess section 11 against actual artifacts. Verify sources, deployment identity, test results, privacy limitations, custody wording, backup recovery, and contest completeness. List any blocking failures with reproducible evidence; do not approve a gate based on a screenshot of simulated data.”

## 9. Test strategy and measurable acceptance

Testing is part of the implementation request. Run tests in containers and add meaningful checks with each feature. Use unit tests for pure validation/crypto wrappers, engine tests for template behavior, integration tests for storage/jobs/wallet boundaries, and browser tests for actual user flows. Do not inflate test counts with assertions that merely restate constants.

| Area | Required positive and negative cases | Pass evidence |
|---|---|---|
| Browser encryption | Round trip; wrong room key; ciphertext/header/key-thumbprint tampering; context replay; malformed JWE; Unicode byte bounds; unknown algorithms | Plaintext only appears after successful authenticated local decrypt |
| Key recovery | Export/import to clean browser, wrong recovery code, corrupt backup, lock/logout and missing-key UI | Fresh browser opens an earlier envelope; no server key dependency |
| Template | Authorized creation/seal/close; unauthorized callers; exact duplicate; conflicting duplicate; closed/at-epoch-boundary; capacity+1; new version | Engine tests + a live deployed smoke receipt |
| Storage/API | Oversize/rate limit, missing challenge, immutable bytes, lookup-token failure, SQL parameterization, CSRF, expired session, non-admin requests | No unauthorized reads or state changes; API schemas enforced |
| Anchoring | Crash after DB commit; crash after chain submit; duplicate workers; chain rejection; indexer lag; queue full; missed close | Exactly one logical inclusion; accurate pending/failed status |
| Reward policy | Invalid/wrong-network address; decimals/overflow; revealed-output request; changed/expired quote; no private inputs; cap exceeded | Invalid requests never reach signing; no hidden public fallback |
| Reward resilience | Double-click confirm; concurrent workers; timeout before/after submission; restart; known reject; ambiguous outcome | No automatic second payment; unknown work is safely reconciled |
| Native privacy | Nontrivial different test amounts and independent recipient keys; encrypted memo; concealment of change; public field/signature/fee inspection | Real receipts + receiver scan/spend + documented residual leakage |
| Data leakage | Canary secret in UI, API traffic, proxy/app/wallet logs, DB dumps, static JS, crash reports, exported evidence | No unintended plaintext/key/address/amount exposure outside authorized boundary |
| Access boundaries | Remote attempt to reach DB/RPC/metrics; scoped token misuse; public route to private rewards | Private ports unreachable externally; allowlist enforced |
| UX | Desktop/mobile, keyboard, labels/focus, reduced motion, reload while pending, empty/error/offline states | No keyboard blocker; core path works at supported widths |
| Performance | 25 concurrent browsers; 100 synthetic submissions over 10 minutes; bounded anchor queue | API p95 < 500 ms excluding chain calls; prompt feedback and no dropped jobs |
| Operations | Container restart, database restore, wallet restore, disk alert, network outage, rollback | Recovery runbook succeeds without duplicate payouts |

Chain confirmation time is network-dependent. Measure it and show pending feedback within one second; do not promise a fixed finality duration. The load test is a target workload, not a claim of current network throughput. If the chain cannot keep up, apply backpressure and reduce advertised intake rather than hiding latency.

Target Web Content Accessibility Guidelines AA contrast and core interaction behavior; automate checks and perform manual keyboard review. Test Chromium and Firefox in CI, plus WebKit and a real mobile browser during release trials if accessible. Name untested platforms instead of claiming universal compatibility.

CI on each PR: formatting, lint/types, deterministic crypto/API tests, template build/tests, frontend production build, container builds, migration checks, browser core flow, secret scan, and dependency/image vulnerability scan. Triage findings for actual applicability; block exploitable high/critical findings in shipped paths and credential leaks. Record reviewed exceptions with owners and expiry.

Run live-network integration on a controlled workflow with capped testnet funds and secrets unavailable to forked PRs. Capture sanitized receipts under docs/evidence/. Full localnet tests may run in a separate heavyweight profile; do not require an L1 build just to run the frontend or normal API tests. Generate an SBOM and image/WASM checksums for the release.

All chain-executing automated tests use faucet-origin funds under docs/funding-plan.md. Use engine faucet helpers for template tests and a funded local faucet for repeatable integration. Public-testnet suites use bounded eligible claims or an existing faucet-funded CI reserve. Reuse balances, respect one-claim eligibility, serialize claims and reconcile uncertain submissions. An exhausted public faucet yields BLOCKED_INFRA and an unsatisfied public release check; deterministic/local suites continue. Never use mainnet funds for automated transaction regression. Include tests that mainnet startup rejects faucet configuration and issues zero faucet requests.

## 10. Shipping and operations runbook requirements

### Deployment sequence

1. Produce a tagged release candidate with all deterministic checks passing. Record dependency lockfiles, wallet versions, image digests, and WASM SHA-256. Prepare the exact target domain, instance sizing and current cost estimate for owner approval.
2. Provision a dedicated VPS after authorization, configure firewall, runtime secrets, encrypted backup destination and TLS. Deploy staging using isolated testnet wallets. Build artifacts in CI/containers; do not compile the whole Tari source tree on the production VM.
3. Initialize the receipt and reward wallets, obtain faucet funds, publish the template through the selected wallet UI, and save the verified network/template metadata. Create the room only after publication succeeds. Generate/recover its encryption key before activating intake.
4. Deploy database migrations and immutable app images. Set network allowlists, correct resource/template/component addresses, body limits, fee/reward caps, and retention. Start the anchor worker; enable payout after the independent recipient test passes.
5. Run a synthetic complete smoke journey over public HTTPS, inspect ports and logs from outside the VPS, restore backups to a disposable environment, then start a 48-hour soak. Public users see the testnet/custody disclosures and real availability state.
6. Prepare the tagged source repository, public deployment manifest, sanitized evidence and demo recording. Publish externally only to targets authorized by the owner; the present task creates the plan, not accounts or public posts.

Deployment manifests contain network identifier/instance, indexer endpoint, wallet/library versions, template/component addresses, WASM hash, image digests, source commit/tag, creation date and evidence links. Never include private wallet configuration or secrets. A production frontend must reject a manifest with the wrong expected network.

Funding configuration and future mainnet migration are specified in docs/funding-plan.md. The beta uses separate faucet-origin operator and CI wallets, low-watermark/target/hot-balance limits and durable spend reservations. Future mainnet uses an owner-controlled treasury provider with reviewed top-ups, new keys/deployments and no faucet capability. Production environment and chain network must be independently validated; the October beta remains testnet. Mainnet activation needs its separate security, custody, budget and deployment gate.

### Restore and rollback

Target recovery point: no more than 24 hours of encrypted application data lost with daily backups; target recovery time: two hours for this small beta. These are goals to validate with a timed drill. Persist the browser's local receipt/export so an entrant can preserve their envelope even if the service loses a recent copy. Reconstruct chain inclusion where possible; do not claim a chain digest recovers missing ciphertext.

Back up PostgreSQL with a consistent method and verify restore. Back up wallet seed/recovery materials and any required scanning/database state using the selected wallet's supported procedure; a live SQLite file copy is not automatically a valid backup. Record software/network versions with each backup. Keep the wallet unlock/recovery key separate from encrypted backup storage. Test scanning and spending in the restored test wallet before relying on the procedure.

Rollback application images by immutable digest. Database migrations should follow expand/contract so the previous app can run during rollback. Chain templates cannot be rolled back like a web deployment: close faulty rooms, deploy a fixed version, preserve old receipts and announce the migration in app status. Never silently point old receipts at a new component.

If a seed is exposed, pause payouts, revoke application/API credentials, rotate the affected wallet, and reconcile outstanding intents. If a room encryption key is exposed, stop new entries to that room and create a new room/key; re-encryption cannot undo disclosure of prior plaintext. Keep incident communication factual and tied to affected testnet data.

### Monitoring and ownership

Monitor public uptime/TLS expiry, readiness, database disk use, queue age/depth, failed anchors, unknown reward outcomes, available fee/private-input balances, backup age, and wallet/indexer health. Alert when queue age exceeds five minutes, any payout becomes unknown, a backup is older than 26 hours, or disk crosses 80%. Tune thresholds from the soak test. Do not put private addresses or reward amounts in alert text.

Kyle owns operational and contest decisions. The agent produces runbooks and evidence. Before launch, designate who receives alerts and can pause payouts. Keep a low-noise status panel: degraded chain connectivity, intake paused, payout paused, or healthy. Routine metrics use anonymous aggregate counters and no tracking of submission text.

## 11. Release definition of done

Every item below is mandatory unless explicitly identified as a contingency and accepted in a revised plan. A checked box needs an artifact or reproducible observation.

- [x] M1 frontend journey is complete and fixtures are labeled everywhere. Evidence: docs/evidence/m1/README.md.
- [ ] Reviewed M1 source commit/tag and evidence linkage are recorded; stale implementation status is corrected.
- [ ] Early mock trials record comprehension and usefulness findings; participant/curator transitions and optional-reward language address blocking confusion.
- [ ] Browser crypto, ciphertext-only submission API, authenticated payout service, and fixture/live record boundaries pass contract and payload checks.
- [ ] Pinned containers, lockfiles and documented commands reproduce a clean checkout without host toolchain installs.
- [ ] Released wallet/template/test-harness compatibility is documented and demonstrated on the target network.
- [ ] Original template is deployed, source-address-WASM linkage is recorded, and access/duplicate/capacity/close tests pass.
- [ ] Real browser sealing, local decryption and clean-browser key recovery work; room keys never enter app service configuration.
- [ ] Entry receipt can be independently verified against the expected component and encrypted bytes.
- [ ] Real native stealth reward arrives and is spendable by an independent recipient wallet; public observations are documented.
- [ ] Failed/pending/unknown transfer outcomes are accurate; double-click/crash tests do not cause a second payment.
- [ ] Privacy inspector separates app encryption, native privacy, deliberate disclosure, and operator visibility.
- [ ] Curator authorization, session security, rate limits, monetary caps and wallet isolation pass negative tests.
- [ ] No plaintext secret, sensitive payout field, credential, or key is present in public logs, source or evidence exports.
- [ ] Quality gates pass; security review has no unresolved exploitable high/critical issue in shipped flows.
- [ ] Public HTTPS deployment is reachable from an unauthenticated browser; database and RPC remain private.
- [ ] Backup/restore and rollback drills pass; monitoring, kill switches and operator ownership are documented.
- [ ] Three external trials are recorded and blocking usability findings fixed; 48-hour soak completes.
- [ ] README, PRIVACY, SECURITY, license, notices, source provenance, deployment manifest and known limitations are accurate.
- [ ] Three-minute video and guided demo work without requiring judges to fund or install a wallet.
- [ ] Forum/social drafts have actual URLs and an owner-confirmed prize address; eligibility and originality are checked.
- [ ] Owner-authorized Bluesky/Reddit post and exactly one forum submission are published before the internal target; permalinks and timestamp retained.

Passing the checklist means ready for the scoped public testnet beta. It does not certify mainnet fund safety or constitute an independent cryptographic audit. Any future mainnet release needs its own threat model, wallet/custody choice, review, deployment gate and operational budget.

## 12. Risks, early signals, and scope cuts

| Risk | Early signal / owner | Response |
|---|---|---|
| Snapshot APIs differ from public testnet | M2 request/type mismatch / architect | Pin compatible releases, write adapter, use bounded Rust fallback; do not guess |
| Wallet container needs host keyring/auth assumptions | Wallet restart or scoped-auth failure / infra | Prove a supported headless secret lifecycle at M2; keep RPC internal; document exact setup |
| Payment “privacy” accidentally reveals inputs or signer links | Public-field inspection / architect | Fail closed on revealed rewards, document remaining metadata; change transaction shape if supported |
| Double payment after timeout | Unreconciled RPC submission / integration | Freeze unknown intent and reconcile; never rebuild automatically |
| Encryption key loss or substitution | Restore/fingerprint test fails / crypto | Do not activate room until restore passes; immutable on-chain key fingerprint; publish trust limitations |
| Unbounded submissions drain fees | Queue/budget growth / backend | Capacity, challenges, rate limits, admission/backpressure and capped fee wallet |
| Single component contention | Anchor queue exceeds latency target / architect | Serialize writes and reduce intake; add independent rooms instead of premature shared-state complexity |
| Operator privacy overclaim | Copy says anonymous/noncustodial / PM | Use the visibility matrix in actual UI and entry text |
| Network outage or reset near deadline | Indexer failure / infra | Recorded real-run evidence, fixture tour, status banner, retained versioned receipts; never mislabel stale results |
| October time budget slips | A critical milestone >2 days late / PM | Cut optional theme variants, public account flows, analytics, and extra disclosure tools; preserve core/tests |
| Secret or template bug discovered | Leakage/invariant test fails / architect | Fix or disable the affected flow before release; do not waive a core privacy failure for polish |
| Submission rejected for missing paperwork | M7 checklist gaps / PM | Fill links/address/license and social requirement before October 30; one forum post |

**Cut order:** optional illustrations/animation → extra room theme → rich curator filtering → optional Vercel/Supabase split → extra disclosure tools. Do not cut real privacy evidence, receipt correctness, key recovery, payout reconciliation, or truthful labels.

If behind on October 20, freeze feature work and complete the single-room vertical slice and required quality gates. If behind on October 26, focus on a stable, honestly limited release and evidence. Never expand the scope to build a wallet, network infrastructure, or new cryptography in the final week.

## 13. Demo and contest submission package

### The three-minute demonstration

| Time | Action | What the audience learns |
|---|---|---|
| 0:00–0:20 | Show “The Last Letter” room and seal a synthetic story | The theme and user value are immediate |
| 0:20–0:45 | Inspect the outgoing encrypted envelope and downloadable receipt | Server stores encrypted content; Ootle anchors its fingerprint |
| 0:45–1:10 | Independently query the receipt and alter one envelope byte | Original verifies; altered envelope fails the digest check |
| 1:10–1:35 | Curator locally opens the envelope | The recipient key is required; host can read on arrival |
| 1:35–2:05 | Authorize a small testnet stealth reward and inspect its result | Genuine Tari transaction, clearly distinguished from the mock tour |
| 2:05–2:35 | Separate wallet detects funds/memo; show public observer view | Hidden native amount/ownership versus visible fees/graph |
| 2:35–3:00 | Show source, architecture and honest privacy limits | Reproducible engineering and precise claims |

Pre-record one successful real-network flow by October 26; retain the actual transaction IDs and source release. If editing out confirmation waits, say so. Never swap fixture data into a live segment. Publish synthetic-story material only; keep private wallet screens and recovery codes out of the recording.

A judge's landing page should provide **Try the guided demo**, **Watch real testnet proof**, **Inspect source**, and **Read privacy model**. The guided demo is instant and clearly simulated; the real recording/evidence establishes actual integration. A live room stays available while testnet is healthy.

### Files to deliver in docs/submission

README with app/source/evidence links; forum-entry.md; social-bluesky.md or social-reddit.md; demo-script.md; release-checklist.md; screenshots; video link; and a concise changes section for later edits. Keep unreplaced placeholders as a release blocker.

Suggested forum draft, to be updated with verified behavior and actual links:

> **Hauntbox — seal your story, prove it arrived, reward it privately.**
>
> Hauntbox is a haunted submission room built for Spooky Secrets. Stories are encrypted in the visitor's browser for the curator. An original Ootle template records an encrypted-envelope fingerprint, and selected entries can receive native stealth testnet rewards.
>
> Try it: [LIVE APP URL]. Code and MIT license: [PUBLIC REPOSITORY URL]. Three-minute demo and transaction evidence: [EVIDENCE URL].
>
> The privacy inspector explains what is hidden and what remains visible. The curator can decrypt submissions on arrival. The operator controls the testnet reward wallet and sees authorized payout details; public observers can see fees and transaction structure. Rewards are discretionary and the demo uses testnet tokens.
>
> Tari prize payment address: [OWNER-CONFIRMED CONTEST ADDRESS].
>
> Bluesky or Reddit announcement: [PUBLIC POST PERMALINK].
>
> Built during October 2026. [TEAM/AUTHOR AND TOOLING DISCLOSURE].
>
> Updates: [DATED CHANGES, IF ANY].

Suggested short social copy: “I built Hauntbox for Tari's Spooky Secrets contest: encrypted ghost-story submissions, Ootle receipts, and native stealth testnet rewards. Try the haunted post office: [APP]. Code + real privacy demo: [LINK].” Check the selected platform's current limits and community rules when posting. Share one public announcement on the required platform; do not treat a draft or private post as compliance.

Prepare the public repository and release first, then the app and evidence links, then obtain the exact prize address, then publish the authorized social announcement, then the forum entry. Check all links in a logged-out browser. Save permalinks and publication times. Subsequent updates edit the same forum submission with a dated changes section.

## 14. Owner inputs and implementation assumptions

The plan can begin immediately without these answers. Resolve each by its needed date; do not block the frontend on infrastructure choices.

| Input | Needed by | Default until resolved |
|---|---|---|
| App name/theme preference | M1 review | Hauntbox / The Last Letter |
| Available builder time | Start of M2 | 102–148 engineering hours across the schedule |
| Domain/subdomain and DNS access | M6 | Placeholder deployment configuration |
| VPS provider, region, budget and account access | Before provisioning | One Docker VPS; provisional ceiling only |
| Curator recovery custodian / alert recipient | Before room activation | Kyle; no secrets embedded in plan |
| Git hosting account/repository visibility | M7 preparation | Local repository; prepare a public MIT release |
| Prize payout address and eligibility confirmation | Before submission | Unfilled, must be owner supplied |
| Bluesky or Reddit account and posting authorization | Before external posting | Prepare drafts only |

October 2 implementation update: M1 remains accepted and M2a passes locally, including native Wallet UI publication/create/read, concealed transfers and receiver spending. M3–M5 core application is implemented and its real local-chain journey passed: browser JWE, clean-browser key restore, verified receipt, native private reward and recipient scanning. Recovery submitted zero new transactions. Checks pass: 11 web units, 50 funding/config units, 14 PostgreSQL API/worker tests, six spike engine tests, four room engine tests and 24 Chromium/Firefox tests. Production-built Esmeralda app runs at localhost:8180 with public mutation flags false; participant companion runs at 5103, operator wallets at 5101/5102. M2b, human trials, operational recovery drills, public HTTPS release and soak remain open. Hosted CI is prepared but has not run. No public funds moved or external posts were sent. See docs/evidence/m2/local-capability.md, docs/evidence/m2/local-app-journey.json and docs/runbooks/application.md.

## 15. Source map for implementers

Primary references consulted on October 2, 2026. Recheck changing APIs, versions, endpoints and rules at M2 and before release. Treat documentation and examples as evidence, not automatic authorization to install software or send transactions.

- [October contest thread](https://community.tari.com/t/october-build-contest-thread-spooky-secrets/396): theme, social channel requirement, one-post rule.
- [General contest rules](https://community.tari.com/t/ootle-launch-date-and-launch-contest-rules/323): originality, licensing, eligibility, prizes, cutoff.
- [Tari Ootle developer site](https://ootle.tari.com/): official guide index and API references.
- [Wallet setup](https://ootle.tari.com/guides/setup-a-wallet/): public-testnet setup and release context.
- [Native privacy model](https://ootle.tari.com/concepts/privacy/) and [stealth transfer guide](https://ootle.tari.com/guides/stealth-resources/): primitives, fees, transaction construction, limitations.
- [Scoped API keys](https://ootle.tari.com/guides/agent-api-keys/): wallet service authentication; verify actual selected-release permission behavior.
- [jose project](https://github.com/panva/jose) and [Web Crypto key wrapping](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/wrapKey): established browser encryption tooling and key handling.
- [Vercel function limits](https://vercel.com/docs/functions/limitations): review if choosing optional frontend/API hosting there; long-lived wallet/worker services stay in containers.
- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security): applies if the optional managed backend is adopted; service credentials remain server-side and bypass behavior must be tested.

Useful paths relative to the parent workspace (all read-only references):

~~~text
tari-ootle-development/Cargo.toml
tari-ootle-development/rust-toolchain.toml
tari-ootle-development/docker/README.md
tari-ootle-development/docker/ootle.Dockerfile
tari-ootle-development/crates/template_lib/Cargo.toml
tari-ootle-development/crates/template_test_tooling/Cargo.toml
tari-ootle-development/crates/template_lib/src/consensus.rs
tari-ootle-development/crates/template_lib/src/caller_context.rs
tari-ootle-development/clients/wallet_daemon_client/src/lib.rs
tari-ootle-development/clients/wallet_daemon_client/src/types.rs
tari-ootle-development/clients/javascript/wallet_daemon_client/
tari-ootle-development/bindings/src/types/wallet-types/StealthTransferRequest.ts
tari-ootle-development/bindings/src/types/wallet-types/StealthTransfer.ts
tari-ootle-development/bindings/src/types/wallet-types/StealthTransferResponse.ts
tari-ootle-development/bindings/src/types/UtxoInputSelection.ts
tari-ootle-development/applications/tari_walletd/src/handlers/accounts.rs
tari-ootle-development/applications/tari_walletd/src/cli.rs
tari-ootle-development/applications/tari_walletd/web_ui/src/components/WalletConnectLink/WalletConnectLink.tsx
tari-ootle-development/crates/wallet/ootle-rs/examples/stealth_transfer.rs
tari-ootle-development/crates/wallet/sdk/src/apis/stealth_transfer/params.rs
tari-ootle-development/crates/wallet/crypto/src/memo.rs
tari-development/README.md
~~~

The upstream stealth example is for learning: it prints generated secrets and uses example funding/fee choices. Reimplement the necessary flow with safe logging and estimated, capped fees. Preserve upstream notices where required; do not copy example shortcuts into production code.

## Frontend sign-in follow-up — implemented October 2

Participant and host sign-in now run inside Hauntbox with PIN or passkey options. The operator is the installation owner, initially Kyle, who also curates rooms and maintains separate receipt-fee and reward wallets. Participants retain their own payout wallets. The native wallet administration page is removed from application onboarding, and its participant companion is stopped with volumes preserved. PIN accounts require an 8–12 digit PIN plus a separately saved random account code; host setup remains bootstrap-protected and roles remain isolated. Mainnet PIN routes are blocked. The staged mainnet security/custody/recovery plan is docs/adr/003-sign-in-and-mainnet-security.md.

Verification: 20 PostgreSQL API/auth/worker tests passed. Actual Chromium and Firefox PIN sign-in/reload/logout passed; Chromium also passed real participant WebAuthn register/login. The native local application journey passed again without submitting new transactions. Encrypted database restore includes participant credential tables and revokes participant and host sessions. Public Esmeralda mutations remain paused pending the existing release gates.

## Participant browser wallet follow-up — October 2

Implemented prominent Create wallet and Recover wallet buttons, popup PIN keypad, native browser key/address generation, one-time recovery phrase display, encrypted local storage, PIN unlock and clean-browser recovery to the same address. Legacy application PIN/passkey accounts remain accessible separately. Native Tari WASM 0.43.0 performs key/address operations; two Hauntbox 24-word phrases encode both keys using scure BIP39. These are not a daemon-compatible single cipher-seed phrase. No wallet PIN/seed request or new chain transaction is made. See docs/adr/004-browser-wallet-recovery.md and embedded-wallet evidence.

Remaining: official cipher-seed import adapter; browser balance/stealth-output scan and independent recipient spend; passkey PRF key wrapping with explicit unsupported-device recovery; mainnet custody/security review. Keep mainnet and public mutations disabled.
