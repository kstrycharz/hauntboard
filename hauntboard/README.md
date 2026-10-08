# Hauntboard

**0.6.10 imported-wallet posting funds:** a recovered standard Tari account can prepare 10 test TARI as four native stealth outputs after reviewing the dry-run fee. No app token or additional faucet claim is needed. Existing account funds remain in the wallet. [Preparation and validation evidence](evidence/posting-preparation.md).

**GitHub repository:** https://github.com/kstrycharz/hauntboard (private). The manual `Deploy fresh Tari testnet board to Ubuntu` workflow builds and checks the contract/application, creates a fresh Esmeralda board and targets the existing Ubuntu app/preview containers. Installation of the repo-specific deployment runner with host Docker access awaits owner approval. See [workflow operation and access requirements](deploy/GITHUB.md). This supersedes the older no-remote/build-only notes below.

**First-version candidate: public content, poster wallet privacy.** Wallet onboarding offers **Create wallet** and **Recover with seed phrase**, using 24 words with no wallet-file download/upload. See [phrase format, recovery and compatibility](wallet-recovery/README.md). The wallet offers **Claim 500 test TARI** when `HAUNTBOARD_FAUCET_ENABLED=true` and displays verified numeric balances. The flag defaults false for normal VPS/client deployments and is enabled for the current owner-authorized public beta. [Faucet verification and limitations](evidence/faucet-implementation.md) record funding, posting, recovery, disable-mode checks and the public refill's actual status. Open the [hosted Esmeralda beta](https://payroll-levels-sensitivity-bit.trycloudflare.com/) and [About diagram](https://payroll-levels-sensitivity-bit.trycloudflare.com/about#architecture). The published [schema-4 contract](template-public/RELEASE.md) stores no author key and all messages are readable without a wallet. The standard browser pays posting fees with native Tari stealth outputs and one-time spend signatures, without a persistent owner signature or named account input. Fees, spent-output graph, timing and network connections remain observable; this is not complete anonymity.

Five contract tests pass on native engine 0.45.0. Chromium and Firefox real localnet tests verify receive/discover/spend, public reads, encrypted coin-state recovery, change quarantine, stale wallet state and lost-acknowledgement reconciliation. See [privacy investigation](POSTER_PRIVACY.md) and [GitHub contract generation](deploy/GITHUB.md). Public Esmeralda posting and VPS deployment remain open gates; example manifests fail closed. The older schema-3 demo below retains its original author/encryption behavior and is not the shipping candidate.

**Public testnet delivery:** see [the VPS/Docker delivery plan](DELIVERY_PLAN.md) for the current backlog, architecture, wallet generation/recovery requirements and release gates. Built-in wallet generation and recovery are required for this iteration; the implementation and evidence below remain localnet-only.

The delivery implementation now includes [production and independent-client configuration](deploy/RUNBOOK.md), a non-root application image, strict network/origin profiles, separate liveness/readiness, a bounded durable transaction relay and encrypted operational backup/restore. Fresh results and remaining gates are in the [implementation record](evidence/delivery-implementation.md). Public provider probing passed; a public beta has not been deployed or accepted. The preparation archive is separate from the existing localnet release.

About now includes an [application/storage diagram](http://localhost:8280/about#architecture) for browser, relay, indexer/validators and board/thread/page contract state. The first-version [contract candidate](template/RELEASE_CONTRACT.md) is compiled and separately packaged with source/WASM hashes. Its public template and board addresses remain unset until actual Esmeralda publication. Live provider checks record 0.45.0 and four validators; compatibility with the pinned 0.43.0-tested contract/client remains a measured release gate.

A functional Tari Ootle message-board proof of concept. Full public post text and encrypted secret envelopes are stored in **real component state on a dedicated localnet**. The two clients have independent demo wallets and independent indexers. There is no application content database.

Open **[Ghost A — primary client](http://localhost:8280/)** or **[Ghost B — independent client](http://localhost:8281/)**. The same frontend is served by each local wallet companion.

Open **[About Hauntboard](http://localhost:8280/about)** for the post lifecycle, storage map, encryption boundaries, live contract locators and independent-client verification links. The explanation remains readable when the companion's chain configuration is unavailable.

### Browser wallet

**Current browser controls:** Open **Wallet → Create wallet**, then enter and confirm a six-digit PIN using the keypad, keyboard or hardware number pad. Save and confirm your 24-word recovery phrase. Existing password wallets still unlock with their original password; **Wallet settings → Set six-digit PIN** switches them to a PIN without changing the wallet. **Wallet settings → Delete wallet from this browser** removes this device's saved wallet after confirmation and can open setup for a new wallet. Funds and posts remain on chain, and the original phrase restores the old wallet. See [PIN/reset release and verification](evidence/wallet-pin-reset.md).

**Historical schema-3 localnet workflow:**

Choose **Browser wallet**, enter a password of at least 12 characters and choose **Create browser wallet**. Re-enter that password and **Claim local test funds** to create a real owner-controlled account on the isolated local chain. An unlocked browser wallet signs public and sealed posts locally using Tari WASM 0.43.0 and the official Ootle SDK 0.7.0. The companion relays signed BOR envelopes; it receives no wallet private key or password. The contract records the browser owner's public key as author. Each reviewed post uses its simulated fee plus a bounded allowance, with a 1-test-TARI ceiling. The signed maximum is shown before confirmation, and actual fees are reported afterward. Changed state or fees require another review.

The following encrypted-record notes describe historical schema-3 compatibility, not current wallet onboarding. Current privacy wallets create or recover with a 24-word phrase. Keys are encrypted with the device credential (a PIN for new wallets, or an older password) in IndexedDB using PBKDF2-SHA256 (600,000 iterations) and AES-GCM. Reload and backgrounding lock the wallet. Recovery imports native Tari L2 CipherSeed v2 with an optional original seed passphrase and account index, using the same native format for new and recovered wallets. Owner/view keys and account metadata stay inside encrypted browser storage. An optional original receive address is checked before saving. Secret-thread keys have their own separate backup.

New encrypted wallet backups authenticate the network byte and reset namespace. Existing localnet v1 wallets remain readable. Restore cannot overwrite a different saved identity; create, unlock, restore, funding and submission coordinate across tabs. Funded-account ownership is checked before activation. Backups made before funding recover the same keys, but automatic funded-account rediscovery on a fresh browser remains release work; keep a post-funding backup.

Browser wallets currently cover account creation, revealed fee balance and board signing on **localnet only**. Native private tips and incoming stealth-output scans remain in the companion demo wallets. The optional tip-address checkbox uses an unlocked browser wallet's address when present, otherwise the local demo receive address; browser-owned receive scanning/spending remains unfinished. Public/client profiles expose no companion signing/tip routes. Public Esmeralda deployment, funding and public-network wallet compatibility remain release gates.

## Try it

1. Open the primary client and choose **Start a thread**.
2. Choose Public or Sealed, enter a title and post, and select whether to include a receive address for tips.
3. Review the simulated operation and maximum network fee, then **Confirm & sign**. An unlocked browser wallet signs locally; otherwise the companion signs using its pre-funded demo wallet. Wait for chain confirmation.
4. For a sealed thread, choose **Copy secret invitation** or **Open with Ghost B**. The invitation key stays in the browser; it is never a query string or contract argument.
5. Reply from Ghost B. If the opening post includes a receive address, choose **Leave a private tip** and send a small amount of test TARI. Inspect the recipient's **My demo wallet** panel.
6. Use **Inspect chain bytes** to inspect the actual verified component returned by the indexer. Public post bytes contain the full text; sealed messages remain encrypted.

Each browser saves its secret-thread keys encrypted in IndexedDB with a nonextractable device key. A Web Lock protects first-use key creation across concurrent tabs/actions. **Secret keys & backup** exports a password-encrypted backup and restores it in another browser. Keep invitations and backup passwords private. Browser wallet keys and demo-wallet keys use the separate storage described above.

## Start or resume

Run from the parent `hauntbox` directory in PowerShell. The current workspace already has the toolchain images. The combined Compose files use project name `hauntboard-poc`, separate wallet/data volumes, and the private `172.30.89.0/24` subnet.

```powershell
docker compose -f compose.yaml --profile tools run --rm node-tools sh -c 'pnpm --dir hauntboard/browser-sdk install --ignore-workspace --frozen-lockfile && pnpm --dir hauntboard/browser-sdk build'

docker compose -p hauntboard-poc -f compose.localnet.yaml -f compose.hauntboard.yaml up --no-build -d validator indexer indexer-independent sender receiver
docker compose -p hauntboard-poc -f compose.localnet.yaml -f compose.hauntboard.yaml run --rm --no-deps board-build
docker compose -p hauntboard-poc -f compose.localnet.yaml -f compose.hauntboard.yaml run --rm --no-deps board-bootstrap
docker compose -p hauntboard-poc -f compose.localnet.yaml -f compose.hauntboard.yaml up --no-build -d board-web board-local
```

Bootstrap verifies localnet, authenticates only the isolated demo wallets, obtains faucet-origin test funds, dry-runs publication, publishes the actual compiled WASM, creates the board, and prepares private tip reserves. It reuses confirmed deployment transactions when rerun. Companion API keys expire after 24 hours; rerun bootstrap to refresh them. Never use these test-only virtual passkeys or shared demo wallet flows for public/mainnet wallets.

No wallet RPC, validator, indexer or database port is published to the host. Browser clients bind to host loopback ports 8280 and 8281. Only the companions also join a host-accessible client network, because Docker does not publish host ports from an internal-only network in this environment. Chain services remain on the private internal network. Each companion receives only its own wallet configuration/token volume. This PoC intentionally provides two demo identities; public noncustodial onboarding and browser signing remain future work.

To stop this PoC while retaining all chain and wallet state:

```powershell
docker compose -p hauntboard-poc -f compose.localnet.yaml -f compose.hauntboard.yaml stop
```

Do not use `down -v` or delete wallet volumes as a troubleshooting step. The existing Hauntbox production application uses different services and volumes.

## Architecture and protocol

- `template/`: original Rust/WASM contract. A board has up to 128 thread references. Each schema-3 thread has up to **2,048 posts (2,047 replies)** in 128 separate pages of 16 posts of at most **4,096 serialized bytes** each.
- `lib/chain.mjs`: maintained wallet RPC integration, fee simulation, transaction reconciliation and real substate retrieval.
- `lib/state.mjs`: schema-2 and schema-3 component-state decoder with field validation.
- `server.mjs`: local wallet companion, fixed allowed operations, CSRF/origin checks, bounded signing and durable transaction-operation journal. It never stores canonical posts.
- `web/`: one shared frontend with public/secret threads, replies, local filters, wallet inspection and key backup.
- `scripts/`: local bootstrap, network initialization and isolated wallet authentication.
- `tests/`: actual Tari-engine tests and browser/chain acceptance journeys.
- `evidence/`: sanitized results, contract/build identity and screenshots. Private invitation fixtures and credentials stay in Docker volumes.

Contract access rules are immutable (`OwnerRule::None`). Different signers may create threads and append bounded posts. Nonce retries return the original logical post; conflicting reuse fails. Parent references are limited to earlier posts in the same thread. Full content stays in current state; events and the companion's operation journal are not the content store.

The deployed local runtime exposed a BOR round-trip compatibility difference for optional address fields. Schema 2 uses string component locators and a signed integer parent (`-1` for an opening/unattached post), avoiding that boundary. The current configuration points at schema 3, with previous schema-2 boards preserved and available from the board chooser.

The initial monolithic thread storage exceeded the tested WASM memory budget at 64 × 4 KiB. Schema 3 separates payloads into bounded on-chain pages, leaving only page addresses and the total post count in thread state. It supports 2,048 posts per thread, retains all earlier bytes and stable global reply references, and loads earlier pages on demand. See schema3.md for the exact protocol and retry rules.

Sealed posts use AES-256-GCM with a random 256-bit thread key, random 96-bit nonce and authenticated context binding network, board, thread ID, logical post nonce and reply target. Secret plaintext is padded to 2,560 bytes; the resulting JSON envelope is 3,490 bytes. Invite holders share one key and can read the entire history. There is no selective member revocation, forward secrecy or automatic timed release.

Native tips are separate stealth transactions funded from concealed inputs. The PoC checks the simulated transaction's revealed-input and fee structure before signing. Public fees, activity, signer linkage and timing remain visible. The app does not publish tip amounts or transaction links into thread state. A pseudonym is not an anonymity guarantee.

## Verify

For a smaller contract-only build, use `.github/workflows/hauntboard-contract.yml`: it tests and compiles the WASM, verifies the packaged source/artifact checksums, and uploads the deployment candidate under the source commit SHA. See [GitHub build and deployment](deploy/GITHUB.md) for the Actions download steps and the separate VPS/testnet deployment handoff.

The dedicated workflow in `.github/workflows/hauntboard.yml` builds the frozen SDK and contract in containers, audits browser dependencies, runs the chain/browser/outage/recovery gates and retains sanitized evidence plus deployable browser/contract assets. It preserves the legacy application's workflow. The repository has no Git remote configured in this workspace, so hosted GitHub runs and external deployment have not been performed.

```powershell
docker compose -p hauntboard-poc -f compose.localnet.yaml -f compose.hauntboard.yaml run --rm --no-deps board-engine
docker compose -p hauntboard-poc -f compose.localnet.yaml -f compose.hauntboard.yaml run --rm --no-deps board-tests
docker compose -p hauntboard-poc -f compose.localnet.yaml -f compose.hauntboard.yaml run --rm --no-deps board-tests node hauntboard/tests/browser-wallet.mjs
docker compose -p hauntboard-poc -f compose.localnet.yaml -f compose.hauntboard.yaml run --rm --no-deps -e BROWSER=firefox board-tests node hauntboard/tests/browser-wallet.mjs
docker compose -p hauntboard-poc -f compose.localnet.yaml -f compose.hauntboard.yaml run --rm --no-deps board-tests node hauntboard/tests/about.mjs
```

The browser test uses real localhost browser origins routed to the container services by Playwright, matching the host application's secure-context and origin behavior. It creates synthetic stories, tests wrong keys/context tampering, sends a real local native tip, and writes a private synthetic invitation fixture for the outage test. Fixtures are never live user submissions.

For the actual outage proof, first complete `board-tests`, then:

```powershell
docker compose -p hauntboard-poc -f compose.localnet.yaml -f compose.hauntboard.yaml stop board-web indexer sender
docker compose -p hauntboard-poc -f compose.localnet.yaml -f compose.hauntboard.yaml run --rm --no-deps board-tests node hauntboard/tests/outage.mjs
docker compose -p hauntboard-poc -f compose.localnet.yaml -f compose.hauntboard.yaml start indexer sender board-web
docker compose -p hauntboard-poc -f compose.localnet.yaml -f compose.hauntboard.yaml run --rm --no-deps board-tests node hauntboard/tests/recovery.mjs
```

The independent client's wallet also connects through the independent indexer, so new writes do not need the primary read path. The shared validator is the underlying local chain and remains running. Localnet has one validator; this demonstrates application/provider independence, not decentralized validator consensus or public-testnet availability.

The recovery test intentionally loses a successful submission response, reloads the browser, resolves the durable operation to its original transaction, and verifies one post remains. It also exercises the sealed-thread and native wallet flows in Firefox.

## Boundaries

This is a local-chain PoC, with real transactions and clearly identified demo wallets. Public Esmeralda deployment, production HTTPS, public-network wallet onboarding, native installers, images and adversarial public spam controls are not yet implemented. The clients trust the configured indexer's `verified` response; they do not independently verify consensus proofs in the browser. On-chain limits and user-paid fees bound resource use but do not prevent someone filling a board. Public/secret post activity remains linkable. Chain persistence depends on preserving the localnet data volume; no testnet permanence claim is made.

Original implementation is MIT, as in the parent repository. Tari runtime and reused integration/authentication helpers retain the parent's third-party notices. All development toolchains run in containers.







### Mobile preview

The [privacy preview](http://localhost:8283/) has touch-sized controls and responsive board, posting, wallet and About layouts. The local service uses the built `hauntboard-delivery:0.4.1` image; rebuild after frontend edits with:

```powershell
docker compose -p hauntboard-poc -f compose.localnet.yaml -f compose.hauntboard.yaml up --build -d --no-deps board-privacy
```

The existing board and operation volume are retained. `tests/mobile.mjs` covers six phone/tablet/landscape sizes in Chromium and Firefox; `MOBILE=1` runs the real privacy-wallet test at phone width. Evidence is in `evidence/mobile-layout.json` and `public-wallet-*-mobile.json`. Physical-device usability remains a manual acceptance step. Owner-authorized LAN preview: port 8283 is now published on 0.0.0.0. The local host allowlist includes 192.168.1.250 and 192.168.2.187; override HAUNTBOARD_LAN_HOSTS with the current private IPv4 addresses if they change. HTTP LAN access supports viewing the board; browser wallets require HTTPS or a localhost secure context.


Forum categories: The Crypt, /tari/, /general/ and /pol/ share the existing on-chain board directory. New opening posts store a category field in their public payload; uncategorized history appears in The Crypt. Each thread already has its own component and post pages. The /forums page explains the shared 128-thread board limit, 2,048-post thread limit and future rollover requirements.
