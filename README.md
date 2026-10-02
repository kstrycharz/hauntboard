# Hauntbox

**Seal your story. Prove it arrived. Reward it privately.**

A haunted submission room with browser encryption, original Tari Ootle inclusion receipts, participant/host PIN or passkey sign-in and native private testnet rewards. The full application has passed against an isolated faucet-funded local chain. A production build runs with Esmeralda configuration; public mutations remain paused pending public proof and release gates.

## Open the application

The production-built website is [http://localhost:8180/submit](http://localhost:8180/submit), container `hauntbox-production-web-1`. This is the application, with an optional payout-address field and **Sign in / My account** and **Host / Curator** setup.

```sh
docker compose -f compose.production.yaml up --build -d
```

Its API and PostgreSQL are private. Receipt anchoring and payouts are disabled in this Esmeralda preview. `/api/funding/status` explains funding readiness without exposing operator balances; authenticated operators can inspect their private funding status. `/api/openapi.json` serves the request-schema API specification. `/health/ready` checks database readiness; it does not certify wallet or chain readiness.

**Participant wallet:** [localhost:8180/account](http://localhost:8180/account). **Create wallet** opens a popup with a PIN keypad: choose and confirm an 8–12 digit PIN, generate native Ootle spending/view keys, save both 24-word Hauntbox recovery phrases shown once, then finish setup. **Sign in with PIN** unlocks encrypted browser data. **Recover wallet** restores from both phrases with a new local PIN. The PIN and recovery phrases never reach the server. These phrases restore the Hauntbox wallet; they are not the native daemon's single seed phrase. Use the generated address for optional rewards. Balance scanning and outgoing spending remain pending. Existing PIN/passkey app accounts are retained under **Existing app account / passkey sign-in**.

**Host/operator:** the person running the installation, initially Kyle, who also curates rooms and funds receipt fees/rewards. Use **Host / Curator** for frontend PIN/passkey setup. Initial host setup requires the private installation setup code. Participant credentials cannot authorize host operations. Native wallet services remain private infrastructure; the app no longer links to their built-in Wallet UI. The old participant companion is stopped with its volumes preserved.

See [sign-in and mainnet security](docs/adr/003-sign-in-and-mainnet-security.md) and the [application runbook](docs/runbooks/application.md). Passkeys are optional for testnet app access; this PIN fallback does not enable mainnet spending.
## Implementation and evidence

- M1 accepted. The fixture tour remains at `/demo`, permanently marked as simulated.
- M2a local capability passed: native faucet funding, concealed transfer/memo recovery, independent receiver spend, original template publication through the Wallet UI, verified component reads and restart recovery.
- M3–M5 core application implemented locally: fixed-size JWE, encrypted key export/restore, immutable room configuration, signed contract access, ciphertext-only upload API, durable outbox, passkey/CSRF authorization, bounded exact payout confirmation and native wallet reconciliation.
- Real application journey passed: actual room and receipt, encrypted submission/reload, local curator decryption, native private reward and independent recipient scanning. Restart/recovery reused existing transactions with zero new submissions.
- Verification: 11 web unit tests, 50 funding/config/RPC tests, 20 PostgreSQL API/auth/worker tests, six spike engine tests, four room engine tests and 24 Chromium/Firefox browser tests. Hosted CI is configured but has not yet run.
- M2b public Esmeralda proof remains open. Public wallets are unfunded; no public funds moved. Encrypted application backup/restore passed against the populated local database and production preview. Human trials, wallet recovery/rollback drills, public HTTPS deployment and soak/release gates remain outstanding. This is not a completed public beta or contest entry.

See [the project plan](PROJECT_PLAN.md), [local capability acceptance](docs/evidence/m2/local-capability.md), [full application evidence](docs/evidence/m2/local-app-journey.json), [funding plan](docs/funding-plan.md), [privacy](PRIVACY.md) and [security](SECURITY.md).

## Reproduce the real local application

All commands run toolchains inside Docker. Start the local chain and follow the native funding/private-transfer commands in [local wallet evidence](docs/evidence/m2/local-wallet.md). Then:

```sh
docker compose --profile tools run --rm room-build
docker compose -f compose.localnet.yaml run --rm --no-deps integration node scripts/test-local-receipt-publication.mjs
docker compose -f compose.localnet.yaml run --rm --no-deps -e PUBLISH_HAUNTBOX_ROOM=true integration node scripts/test-local-receipt-publication.mjs
docker compose -f compose.app.yaml -f compose.app.localnet.yaml -f compose.app.auth.yaml up --build -d wallet-auth api worker web
docker compose -f compose.app.yaml -f compose.app.localnet.yaml -f compose.app.browser.yaml run --build --rm --no-deps browser-tests
```

The working local application is [localhost:5173](http://localhost:5173/). CI virtual passkeys are restricted to isolated local wallets. Public/operator wallets require real human credentials. Keep the persisted private job volume to recover the same operations without resubmitting them.

## Verify in containers

```sh
docker compose --profile tools run --rm node-tools sh -c 'pnpm install --frozen-lockfile && pnpm format:check && pnpm check && pnpm test && pnpm build && pnpm audit --prod'
docker compose -f compose.app.yaml run --rm tests
docker compose --profile engine run --rm engine-tests
docker compose --profile engine run --rm room-engine
docker compose --profile test run --rm e2e
```

The standalone frontend also serves `/demo`. Avoid starting its `web-dev` while the full app owns port 5173. Stop containers with the matching Compose files and preserve volumes. Do not use `down -v` to fix a startup problem.

## Development and license

Read [AGENTS.md](AGENTS.md). Keep all package managers, Rust, databases, browser CI and Tari binaries inside Docker. Sibling Tari snapshots are read-only references. Runtime data and private material belong in named volumes or ignored private directories.

Original code is [MIT](LICENSE). [Third-party notices](THIRD_PARTY_NOTICES.md) retain React/font licenses and Tari provenance. No mainnet funds, participant deposits or public posting are authorized by these local setup commands.

Browser wallet implementation/security: docs/adr/004-browser-wallet-recovery.md. Real Chromium/Firefox generation, PIN unlock, clean-browser recovery and production-CSP tests are recorded in docs/evidence/m2/embedded-wallet*.json. Mainnet wallet generation is disabled.

Browser wallet review fixes BW-01–BW-03 are complete: creation/recovery/unlock are serialized across tabs using Web Locks, conflicting recovery preserves the saved wallet, and SDK/storage failures have separate messages without consuming failed-PIN allowances. Chromium/Firefox race and fault evidence: docs/evidence/m2/wallet-concurrency.json. Run with `docker compose -f compose.app.yaml -f compose.app.localnet.yaml -f compose.app.browser.yaml run --rm --no-deps browser-tests node scripts/test-wallet-concurrency.mjs`. Web Locks support is required. Balance scanning, recipient spending and native single-seed import remain unfinished.

## Current local production preview

Only the production web/API/PostgreSQL stack is running. Start it with `docker compose -f compose.production.yaml up -d --build --wait`. The web port binds to `127.0.0.1:8180`; databases and API have no published host ports. Named data volumes are retained when other stacks stop.

- Participant app: http://localhost:8180/
- Optional reward wallet: http://localhost:8180/account
- Private local admin entrance: http://localhost:8180/admin
- Guided demo while live setup is pending: http://localhost:8180/demo

The admin entrance separates host sign-in, deployment prerequisites, room creation and inbox/reward management. It does not automatically publish a receipt template or connect operator wallets. Those operations and public release proof remain pending; the production stack keeps submissions, anchoring and payouts paused. The public HTTPS overlay rejects `/admin` routes.

The wallet popup now focuses the PIN field on opening and confirmation. Keyboard digits, mixed keypad clicks/typing, Backspace and Enter are tested in Chromium and Firefox against the production build. Host funding, legacy account access and wallet details are collapsed on the participant page.

First-time host creation is now available directly at http://localhost:8180/admin. The localhost production deployment enables LOCAL_HOST_SETUP: choose/confirm a PIN, create the host, download the generated login-code backup and continue. No terminal/bootstrap-code retrieval is required. The code is remembered in this browser after confirmation; the PIN remains server-hashed. Existing hosts cannot be replaced. Public deployment disables local setup and still requires the private setup code. Evidence: docs/evidence/m2/local-host-web-setup.json.
