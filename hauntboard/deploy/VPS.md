# VPS and GitHub deployment

## November 6 main-thread-to-reply repair

The current release is `release-f9ac47fde4bc2777a5cf6c8b6301e1c3dddb8a89`,
running healthy image
`sha256:fa7fabdc27597d618b07d03ee4096c36f410e7cfa91273bff1734afb0737b943`.
It immediately refreshes reply funding guidance after a confirmed thread,
shows held remaining tokens, and provides an explicit **Use remaining tokens
and reply** action that enables Standard posting and submits once. Existing
isolation is preserved until the user selects that disclosed action. See the
[repair and test record](../docs/thread-reply-change-fix.md).

Both GitHub release and privacy workflows passed for source `f9ac47f`. The
guarded updater verified the downloaded image and byte-identical network
manifest, checked candidate readiness, then switched production. The original
manifest hash remains
`fa4c2a8bec8c7caa41a8f9fff9f634ee0d7c03803434755e3785a297d0fa0ec8`,
and `hauntboard_operations` remains mounted at `/companion`.

The [read-only live checks](../evidence/thread-reply-live-2026-11-06.json)
passed in Chromium and Firefox, including six matching served asset hashes.

The preceding `09c6ac4` image
`sha256:47b932301530ce85ad6d66c15ca365225cc6fac9a226acdf4480c1deaffb5163`
is retained as the current rollback image in `.env.previous`. No new contract
was published, faucet payment requested or public post submitted by this repair.

## November 6 Reply and empty-wallet repair

The preceding repair deployed `release-09c6ac40cb07c3783188ca411c54e89bbf188d0b`,
with image
`sha256:47b932301530ce85ad6d66c15ca365225cc6fac9a226acdf4480c1deaffb5163`.
It adds inline reply validation and funding, preserves preparation confirmation
across balance polling, bounds client request waits, and verifies confirmed
in-app faucet payments through their original transaction receipts. The faucet
still advertises its October discovery reset; mismatched capsules remain
rejected and this release does not change the faucet's configuration or journals.

The UI repair was first deployed as `d5dd903`; that intermediate image
`sha256:d680373bffece86a420359fc2e2e0729db0d5ee9fc31442cdbf0baf28eb27ae8`
was its rollback image, retained with `.env.previous` by the guarded
updater at that time. The original manifest hash
`fa4c2a8bec8c7caa41a8f9fff9f634ee0d7c03803434755e3785a297d0fa0ec8`
and `hauntboard_operations` volume are unchanged.

Read the [repair record](../docs/reply-zero-balance-fix.md) and
[live verification evidence](../evidence/reply-live-2026-11-06.json).
Both public browser checks created fresh unfunded wallets and blocked funding
and transaction writes; no test currency was spent or public content published.

## November 6 posting experience release

The guarded updater deployed `release-b17bcd5ca2c8f731cfa87bfdaf4fa2655211a8d6`.
The running immutable image is
`sha256:82b896e915c3456c036678615288d21a26e538b3c56bc120341e4116c4a3860a`.
Public readiness and read-only Chromium/Firefox checks passed, including six
served asset hashes, the Post button, the disclosed fee limit and inline wallet
guidance without an automatic wallet/review popup. No test funds were requested
and no chain transaction was submitted during deployment verification.

The network manifest hash remains
`fa4c2a8bec8c7caa41a8f9fff9f634ee0d7c03803434755e3785a297d0fa0ec8`.
The existing `hauntboard_operations` volume and board/template/reset pins are
retained. The previous image
`sha256:1417f4d9879869c3010ceffd944607ba8552e1409a4126738373fedaabc6fcfb`
is retained for rollback, with the updater's `.env.previous` on the server.
Restore that saved environment and recreate the app through the existing
Compose configuration if rollback is required; preserve the operation volume.

See the [implementation record](../docs/posting-experience-implementation.md)
and [sanitized live evidence](../evidence/posting-live-2026-11-06.json).
Existing browser wallets keep their change-isolation setting until the user
explicitly chooses Standard posting. App-paid fees are not enabled.

## November 4 proof evidence refresh

The evidence-only image `hauntboard:proof-refresh-20261104` overlays the current
reset application's three proof assets. The deployed image is
`sha256:3b8c9cecf277` (full ID in the dated deployment record). The configured
board, template, registry template, operations volume and faucet are preserved.
Rollback files and the previous image pin remain in
`/opt/hauntboard/proof-refresh-20261104`. Restore `env.before` to `.env` and
recreate only the app service to restore the prior image. The chain demonstration
and its receipts remain available independently of this website rollback.

## November 2 Esmeralda reset deployment

The VPS now runs the fresh schema-4 board recorded in `network.public.json`,
with reset identity `esmeralda-reset-2026-11-02`. The shipped browser SDK is
0.12.0; crypto/BOR WASM and transaction decoding use 0.49.1. The client decodes
the current encoded indexer substates/receipts and discovers private outputs
through bounded protobuf shard streams followed by paginated UTXO fetches.
The archived pre-reset transaction format is intentionally rejected by this
reset's decoder; old operation namespaces remain preserved.

The tested image/configuration was installed together through SSH. Readiness
passes publicly. Chromium and Firefox both rendered the new board and the exact
General notice, **Esmeralda reset: why the forum started fresh**. That notice
was published through the deployed browser wallet using a native stealth fee.
See `hauntboard/evidence/reset-vps-deployment-2026-11-02.json` and
`reset-vps-browser-2026-11-02.json`. This is exercised compatibility evidence;
the broader compatibility/privacy manifest flags remain false.

Rollback files, the prior image pin, prior manifest and a protected operations
volume archive are retained under `/opt/hauntboard/esmeralda-reset-20261102`.
Restore `.env.before` and `network.json.before` together, then recreate only
the app service. The pre-reset board will still be unavailable on the reset
network; rollback restores the old software/configuration, not erased chain data.
The normal operations volume, Cloudflare edge and secret `env_file` reference
were preserved. The final client image is pinned in
`/opt/hauntboard/esmeralda-reset-20261102-v2/deployment-complete`; that directory
also retains the first working reset image/configuration for rollback. The
original pre-reset rollback remains in the first directory.

The in-app faucet remains enabled as before. The separately updated faucet now
reports a funded account and uses the current SDK, but its discovery capsule
still names the old reset. The client rejects that capsule and falls back to
verified native output scanning, at most once per thirty seconds for automatic
polling. No faucet withdrawal was needed for deployment or the notice.

The deployment script is `apply-esmeralda-reset.sh`. Its loopback probes use
Node's HTTP client with an explicit Host header; Node fetch does not reliably
preserve that override in the deployed runtime. Ordinary releases retain the
manifest comparison guard and cannot silently revert to the old board.

## October 28 client compatibility update

The source now pins SDK 0.11.1 and crypto/transaction identity 0.47.0. This changes only `sdkVersion` and `wasmVersion` in the public manifest; board, template, reset identity, key-registry pin and evidence flags are preserved. Before deployment, stage an explicit copy of the existing server manifest with those two version fields updated. Retain the old manifest and image together for rollback. The fixed deployment agent intentionally compares manifests byte-for-byte and will refuse this version migration until it is installed through a reviewed server update. Do not disable that check or mark privacy/compatibility flags true. Preserve pending operation records and reconcile previously signed operations with the version that created them before allowing new writes. Browser-local recovery and current public transaction-ID checks pass; a new funded-post acceptance check remains outstanding. No fresh board or template publication is needed for the website changes.

The `/proof` page is part of this source release. Its eight historical transaction links remain dated evidence; the optional availability lookup does not certify finality or restore expired indexer history.

The recipient-key release adds `keyRegistryTemplate` to the existing `network.json`, preserving the original board, template, network/reset identity and operations volume. Keep that pin during future app deployments. The companion template is `9de14a5ca71a3c243c0c8a4a9f5896de6f89a5d60f2f42da0ad9351ca0c08527`. Its publication and funded demonstration are recorded in `hauntboard/evidence/room-key-esmeralda.json`. Room vaults and recovery secrets remain browser/user owned; server backups do not restore them. The app also accepts the current indexer `state.up.substate` response shape and rejects down/conflicting states.

The guided Room access update removes the standalone privacy demo and all four demo routes. It introduces recovery-code/backup setup, copyable access requests, named invitations and member removal. Its current deployment evidence is `hauntboard/evidence/room-access-ux-deployment.json`; rollback image/configuration are retained at `/opt/hauntboard/room-keys-20261020-guided`. This website-only update made no chain writes and kept the network manifest and operations volume unchanged.

## Current origin

Public visitors use HTTPS for `hauntboard.taritracker.com` and `testnet-faucet.taritracker.com`. The shared Caddy edge redirects visitor HTTP requests to the corresponding HTTPS hostname with status 308, preserving paths and queries. Verified HTTPS responses include one-day HSTS without `includeSubDomains` or preload. The supplied `Caddyfile.cloudflare` contains both hostname routes.

Cloudflare supplies browser TLS and still reaches the VPS origin over HTTP on port 80 under the recorded Flexible setup. Keep this listener open until origin TLS is installed and Cloudflare is migrated to Full (strict). The proxy serves application traffic only when the immediate peer matches Cloudflare's current IP ranges and its `X-Forwarded-Proto` is `https`; direct-origin spoofed headers cannot bypass the redirect. Local GET/HEAD health checks have a narrow exception for loopback and the observed Docker gateway `172.18.0.1`, so deployment readiness remains runnable. Verify the gateway and refresh Cloudflare ranges when changing the network.

Configure a proxied A record `hauntboard` -> `104.131.40.85`. A Cloudflare Tunnel connector is not used in this setup. The app requires canonical HTTPS Origin headers on writes. Port 80 must not be closed merely to enforce visitor HTTPS: that would break the existing Cloudflare origin connection. Cloudflare's Always Use HTTPS is another visitor redirect option, but it applies zone-wide; a hostname-specific rule avoids altering unrelated subdomains. Full (strict) additionally requires a matching trusted origin certificate and port 443 before switching the Cloudflare mode.

The application has no public internal port or Docker socket, runs as the Node non-root user, and retains its operations volume. The app is an explicitly enabled Esmeralda testnet beta; compatibility/privacy evidence flags remain honest rather than being changed to bypass release gates. The wallet's **Get 100 test tXTR** button submits through the backend to the [TariTracker.com faucet](https://testnet-faucet.taritracker.com/). Clients without a configured backend key retain the external faucet link.

## Automatic releases

The public source repository builds/tests on GitHub-hosted runners when runtime files on `main` change. The successful release includes an image archive, its image ID, source commit, SHA256 checksums and the existing contract/manifest. No contract is published and no board is reset.

The VPS GitHub Actions runner belongs only to the private `kstrycharz/hauntboard-deploy` repository. It never runs public pull requests. Its private workflow checks the latest successful source release every 10 minutes (GitHub scheduling can be delayed), or immediately through **Run workflow**. It calls a fixed server deployment script, downloads the release, verifies checksums and image identity, checks candidate readiness and updates the app. Failed readiness after switching restores the previous image. Only one deployment may run at a time. Runner access to Docker is administrative access; keep the deployment repository private and access restricted.

## Server files and recovery

Runtime configuration lives in `/opt/hauntboard`: `.env`, `network.json`, `compose.yaml`, `Caddyfile` and `CURRENT_RELEASE`. Root-owned deployment tooling is `/usr/local/sbin/hauntboard-deploy`, with `verify-image.py` installed at `/usr/local/lib/hauntboard/verify-image.py`. That helper verifies the Docker-save config hash across classic and containerd image stores; the app is pinned to the VPS store's immutable image ID. Changes to these administrative scripts require a reviewed SSH installation; app updates are automatic. The runner is installed as a system service under the `hauntdeploy` account. Its configuration credential stays on the server and never enters the source repository.

The existing Hauntboard faucet API key is installed separately at `/root/.config/hauntboard/faucet.env` as `FAUCET_API_KEY`. The directory is root-only (`0700`) and the file is root-only (`0600`). The VPS Compose `app` service loads it through an absolute `env_file` reference. Keep that reference when replacing Compose configuration; routine image releases retain it. The original saved key remains at `/root/.config/tari-faucet/hauntboard-api-key.json`. Never copy either secret file into the checkout, release archives, frontend assets or logs, and avoid printing resolved Compose configuration or container environment variables.

Enable the button with `HAUNTBOARD_FAUCET_ENABLED=true` and a backend `FAUCET_API_KEY`; setting the flag to `false` disables claims. The backend sends `Authorization: Bearer ${FAUCET_API_KEY}` to the fixed public HTTPS `/api/v1/claims` endpoint. `/api/faucet-claim` accepts only 100 whole tXTR and an Esmeralda receive address; `/api/faucet-status` checks the saved receipt. Both require canonical Origin, CSRF and a signed HttpOnly, SameSite browser-session cookie (Secure on HTTPS). These anonymous sessions authorize access to their own receipts, not ownership of a wallet. The upstream faucet independently validates addresses and enforces wallet-owner cooldowns. Hauntboard does not add a user account or collect wallet keys.

The browser saves one UUID v4 receipt with the exact address and amount before sending. The backend journals the payload and session in protected files under `/companion/faucet`, scoped to the network/reset identity, before contacting the faucet. Preserve the operations volume and browser data when updating. New requests are limited to one per browser session per hour, with at most 90 claim/status requests per minute across the backend, a bounded queue and bounded journal capacity. The wallet polls every four seconds, backs off on errors and honors `Retry-After`. After an interrupted response it checks the receipt; an explicit retry submits the exact saved payload. Queued, prepared, pending and uncertain payments are reconciled without replacement. Confirmed payments trigger incoming-output scanning. No automatic replacement is created for failed or rejected requests. The original removed `/api/faucet-submit` route remains unavailable.

The existing key's assigned daily allowance is 100 claims and 10,000 tXTR per UTC day, also subject to the faucet's wallet cooldowns and shared limits. Keep receipt journals private: they contain receive addresses. Anonymous sessions can be recreated, so they are not Sybil protection. Key rotation invalidates existing session signatures as well as access to receipts issued under a revoked key; reconcile outstanding requests before rotating. See the [faucet API documentation](https://testnet-faucet.taritracker.com/api-docs).

The encrypted `operations-backup.mjs` helper currently covers `browser-operations` records only. Include the separate `/companion/faucet` directory in protected volume backups. The October 16 faucet update was deployed directly from the tested workspace image; its deployment record, previous environment configuration and image archive are retained at `/opt/hauntboard/faucet-api-20261016`. The previous image is also tagged `hauntboard:before-faucet-api-20261016`. To roll this update back, restore that directory's `env.before` to `/opt/hauntboard/.env` and run `docker compose up -d --no-deps --wait app` from `/opt/hauntboard`. Preserve the secret `env_file` reference and the operations volume. Workspace source changes still need committing/pushing for future source releases to include the integration.

Inspect: `cd /opt/hauntboard && docker compose ps`. Readiness is `/health/ready`; liveness alone is insufficient. To restore a retained image, set `APP_IMAGE` in `.env` to the previously recorded image ID and run `docker compose up -d --wait`. Do not delete the operations volume. Browser wallet recovery is separate: keys live in each user's browser.

Public readiness checks that the configured board can be read with a verified response, an approved template and schema 4. Indexer runtime versions and diagnostic endpoints (`info`, `validators`, `epoch-manager/stats`) do not gate readiness or API requests. `providerRuntimeVersion` in the manifest is historical metadata, not a compatibility requirement. The read-only network probe remains available for diagnosis; an indexer upgrade alone does not establish transaction compatibility. Each API validates its own inputs and provider results without a global board-read preflight.

The public board/template addresses are in `network.public.json`. Preserve them during updates. New contract publication requires separate review and an explicit fee budget. Back up operational data off the VPS; logs are bounded. The deployment cache retains only the current downloaded archive; old image pruning must preserve the previous rollback image.
