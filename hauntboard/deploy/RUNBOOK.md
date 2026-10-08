# Hauntboard VPS delivery runbook

This package prepares the single Linux VPS beta. Public runtime compatibility, participant funding, private receive/spend, staging soak, and release acceptance are still open gates. Do not turn `compatibilityVerified` on merely to make readiness green. The October 6 read-only probe confirms two Esmeralda endpoints, not those release gates.

For explicitly owner-authorized frontend testing on a deployed Esmeralda board, `HAUNTBOARD_TESTNET_BETA=true` permits browser wallet creation/recovery and signed submissions while keeping both verification flags honest. It still enforces schema 4, native stealth fee mode, pinned SDK/runtime configuration, approved Tari-hosted providers, the live provider witness, verified expected-template state, canonical origin and CSRF. The normal release mode defaults to false and retains the evidence gates. The backend publishing wallet must never be mounted into the hosted app. `compose.beta.yaml` provides a gateway at the existing Quick Tunnel destination when replacing a preview, preserving the current URL.

Live public-provider checks now also inspect `/info`, `/validators`, and `/epoch-manager/stats`. Both configured Tari indexers report runtime 0.45.0, Esmeralda byte 38, proof verification enabled and the same four-validator roster. Pin `providerRuntimeVersion` from this measured target. Public/client readiness rejects a wrong network/runtime, disabled substate proofs, missing validator roster or unavailable chain state before reading the board anchor. Checks are shared briefly across requests; there is no localnet fallback. This is HTTPS indexer access to the public testnet, not a direct validator P2P connection or independent browser consensus verification.

## Public-only privacy release

The shipping candidate is `template-public/hauntboard_public.wasm` (schema 4), not the preserved schema-3 demo contract. [GITHUB.md](GITHUB.md) explains generation and the supported publishing handoff. Public startup and `validate-deployment.mjs` require `schema:4`, `posterPrivacy:"stealth-fee-v1"`, `posterPrivacyVerified:true` and `compatibilityVerified:true`, plus confirmed template/board addresses. The example sets both evidence flags false. Set them only after actual Esmeralda receive/discover/stealth-fee posting and independent transaction inspection succeed.

All shipping threads are public. The browser holds encrypted wallet keys/coin states; Tari stores the readable post bytes and public metadata without an author field. The standard posting client omits the persistent owner signature and named account inputs. Fees, graph links, timing and IP exposure remain. Native tests pass on engine 0.45.0 and browser transactions pass on isolated 0.43.0 localnet; public browser compatibility remains unproven. A previously funded named account is not the posting fee source.

The browser creates or recovers a wallet with a 24-word Hauntboard seed phrase and scans native outputs locally; a confirmed transaction ID remains an advanced discovery option. See [wallet recovery format](../wallet-recovery/README.md), including its distinction from native Tari CipherSeed. Each independently received output can fund one post. Change is quarantined, never automatically reused. The ledger supports 32 tracked outputs and no consolidation flow. Save and confirm the recovery phrase before posting; new change carries an encrypted memo so recovery keeps it quarantined. Native stealth fees pay the whole reviewed maximum; unused fee margin is non-refundable. Lost acknowledgements preserve exact signed bytes and coin reservations for reconciliation.

## Prepare a release

The optional wallet faucet is controlled by `HAUNTBOARD_FAUCET_ENABLED=true|false`. It defaults to **false** in the server and VPS deployment; the local privacy preview explicitly defaults to true. Set false and recreate the application container to remove the wallet control and disable `/api/faucet-submit` (404). Wallet creation, phrase recovery, fund scanning and normal posting remain available. No source edit or contract redeployment is required. This does not disable Tari's public faucet for other clients.

The button retains 500 test TARI in four native stealth outputs of 125 each. Tari's released builtin faucet grants a fixed 1,000 TARI into a browser-owned funding account. The client estimates the actual claim fee, bounds it below 1 TARI, and atomically returns the unused grant principal to the builtin faucet using `deposit`. Refunded fee credit stays in the funding account and is included in the numeric wallet balance. Native output encryption and proofs use the pinned Tari WASM. These outputs can each fund one post; posting change remains quarantined. The claim exposes the wallet owner key/account, and all four outputs share a visible funding transaction, so their posting graph can be correlated. Phrase recovery identifies the faucet memo in unspent outputs and preserves the claim marker. Exact signed bytes and an operation ID are persisted before submission, so a lost acknowledgement reconciles the original claim. Public funding and browser-claim confirmation are recorded separately in `esmeralda-faucet-refill.json` and `esmeralda-public-faucet-500.json`; an active refill worker or successful local test is insufficient evidence of public confirmation.

Public and independent-client profiles accept only Tari's publicly hosted Esmeralda HTTPS origins: `https://ootle-indexer-a.tari.com` and `https://ootle-indexer-b.tari.com`. The selected origin must also appear in `APPROVED_PROVIDER_ORIGINS`. Adding a custom host to that environment variable cannot bypass the built-in restriction. The read-only network probe uses the same allowlist. Localnet remains a separate development profile.

Build on a development/CI host, using containers. `infra/docker/hauntboard.Dockerfile` copies the reviewed client and server into a non-root image; the VPS does not compile source. Build the frozen browser SDK and the pinned wallet-recovery Rust adapter before building the runtime image; GitHub Actions does both. Record source/asset hashes, the image ID, registry digest, schema-4 public WASM checksum, published template and board, and actual CI run URL together. Local image IDs are not registry publication evidence.

```sh
docker build -f infra/docker/hauntboard.Dockerfile -t REGISTRY/hauntboard:RELEASE .
# After registry/target authorization:
docker push REGISTRY/hauntboard:RELEASE
docker image inspect REGISTRY/hauntboard:RELEASE
```

Select a reviewed Caddy release and pin its digest. Copy `vps.env.example` to a private `.env` file and `network.example.json` to `network.json`. Fill actual values from measured target-network evidence. Neither file contains participant keys. The reset identity is a release-pinned namespace; readiness checks the network byte and the pinned board/template anchor. The provider API used here does not expose a proven genesis/reset identifier. Loss of that anchor fails closed. Browser trust in the provider remains explicit.

Transfer only the immutable images and deploy files to the VPS. Restrict SSH, point the domain to the VPS, and expose 80/443 at the edge. The app has no host port, RPC credentials, or Docker socket. Caddy overwrites Host with the canonical domain; the app ignores forwarded headers and checks the exact HTTPS Origin on writes.

Validate configuration in a container with environment values loaded from the private env file; additionally supply `ORIGIN=https://DOMAIN` and `CONFIG_FILE=/release/hauntboard/deploy/network.json`:

```sh
docker run --rm --env-file .env -e HAUNTBOARD_PROFILE=public \
  -e ORIGIN=https://ACTUAL_DOMAIN -e CONFIG_FILE=/release/hauntboard/deploy/network.json \
  -v "$PWD:/release:ro" -w /release APP_IMAGE \
  node /release/hauntboard/scripts/validate-deployment.mjs
docker compose --env-file .env -f compose.hauntboard.vps.yaml config --quiet
docker compose --env-file .env -f compose.hauntboard.vps.yaml pull
docker compose --env-file .env -f compose.hauntboard.vps.yaml up -d
docker compose --env-file .env -f compose.hauntboard.vps.yaml ps
```

Use the actual digest wherever `APP_IMAGE` appears in commands. Liveness is `/health/live`; readiness is `/health/ready`. Container running is insufficient. Readiness requires a validated manifest, a matching provider network, and a readable expected-template board. The edge waits for app readiness. Public demo wallet/quote/submit/wallet-inspection routes return 404 and public navigation never clears browser storage.

## Bounds and reconciliation

Initial bounds: 24,000-byte requests, 20,000-character signed envelopes, 32 active public requests, 600 requests/minute across the instance, four active signed submissions, and 10,000 operation records per network/reset. Busy responses use 429; preserve the same operation and signed bytes. Journals contain only fingerprints, transaction IDs, timestamps, and statuses. The 256-bit random operation identifier is a bearer capability: keep it local and never expose it in analytics. No signed envelope or participant key is stored on the VPS.

Claims use exclusive file creation; acknowledged submissions are atomically recorded. Unknown transport/HTTP results remain uncertain. A timeout never proves rejection. A restart does not delete claims. Inspect the chain outcome before any new financial intent. The browser retains pending funding envelopes locally. Automatic pruning is deliberately disabled for uncertain records; when capacity is reached, admission closes. Archive only reconciled records after reviewing retention and the client retry window. A fuller authenticated reconciliation/retention worker and multi-host shared durable store remain release work; this file journal is for one VPS.

## Update and rollback

Save the prior env file, network manifest, client checksum manifest, and registry digest outside the checkout. Pull the next approved digest, change `APP_IMAGE`, run configuration validation, then run Compose `up -d`. Check readiness and complete the real Chromium/Firefox HTTPS write/recovery checks. If they fail, restore the prior image digest and env/manifest and run `up -d` again. Preserve the operation volume and all old contract addresses. Application rollback does not roll back chain state. Never use `down -v` during update, rollback, or incident recovery.

## Encrypted backup and replacement-host restore

Participant wallets and the private coin ledger have their own encrypted browser backups. VPS backups cannot recover those keys or passwords. Operational backups preserve uncertain submission records; chain content is retrieved independently.

Stop the app before the operational snapshot. Mount the journal volume, a backup destination directory, and a private password file read-only at `/run/secrets/backup-password`. Run the following in the pinned app image as UID 1000, with the backup directory writable by that UID:

```sh
docker compose --env-file .env -f compose.hauntboard.vps.yaml stop app
docker run --rm --read-only --cap-drop ALL --security-opt no-new-privileges \
  -v hauntboard-beta_operations:/companion:ro -v /PRIVATE_BACKUP_DIR:/backup \
  -v /PRIVATE_PASSWORD_FILE:/run/secrets/backup-password:ro \
  APP_IMAGE node hauntboard/scripts/operations-backup.mjs backup
docker compose --env-file .env -f compose.hauntboard.vps.yaml start app
```

The backup tool uses scrypt and authenticated AES-256-GCM through Node's crypto library. It includes only bounded `browser-operations` JSON records. Keep the password separately, copy the encrypted output to the approved off-host destination, and back up deploy manifests and TLS state with access control. The tool does not implement off-host transport or scheduling until destinations are configured.

On a replacement host, create a fresh empty journal volume with ownership UID/GID 1000, mount the encrypted file and password, and run the same tool with `restore`. Restore refuses a nonempty volume; wrong passwords/tampering fail authentication before writing records. Restore the pinned manifests and images, start the service, inspect uncertain outcomes through the independent provider, and repeat a signed browser journey. Never blindly replay a transfer from an operational backup.

## Monitoring and acceptance

Configure the chosen monitor to alert on readiness failures, edge certificate failures, disk usage, journal admission closure, and repeated 429/provider errors. Logs rotate at 3 × 10 MiB per container; the app has 512 MiB/1.5 CPU and the edge 256 MiB/0.5 CPU limits. These are starting bounds, not measured capacity claims. Monitor and backup destinations have not been supplied.

Run the plan's 20-reader/five-writer staging trial, restart/rollback/replacement-host drills, independent-provider recovery, 24-hour observed soak, real mobile-browser trial, and three first-time user trials. Record p50/p95 latency, confirmation time, fees, disk/resource growth, failures and source/image/contract hashes. The local smoke and encrypted-backup tests do not satisfy these public environment gates.

## Independent local client

Distribute the same reviewed application digest, `compose.hauntboard.client.yaml`, and published network manifest. Set `INDEPENDENT_INDEXER_URL` to a compatible provider operated independently of the VPS and its primary provider; use `docker compose --env-file .env -f compose.hauntboard.client.yaml up -d`, then open `http://localhost:8282`. Only loopback is published. This profile permits the loopback secure browser context while retaining approved HTTPS upstreams, compatibility gates and the absence of demo wallet/reset routes. Restore a current encrypted wallet backup with its coin ledger here. Original-VPS outage plus fresh-wallet restore/read/new-write acceptance still requires an actual published manifest and independently measured provider path.

