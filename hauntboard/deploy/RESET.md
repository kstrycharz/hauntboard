# Esmeralda reset deployment

The November 2, 2026 reset requires a new wallet, fresh template publications and
a new board. Ordinary website releases must still preserve the configured board.

## What changed

The pre-reset WASM built against template-lib 0.34 publishes successfully but
cannot create components on the current network: `CreateComponentArg` now
requires `upgrade_rule`. Both contracts now build against template-lib 0.37.0.
The board logic and schema 4 are unchanged. The registry's constructor uses
`assert_badge_in_scope` with the admin public-key badge, replacing the removed
signer-proof API while retaining the admin-possession requirement. The engine test
tooling is pinned to 0.49.1; its Cargo locks resolve engine 0.49.2.

The separate `hauntboard/operator-sdk` uses SDK 0.12.0 and WASM/BOR 0.49.1 to
decode the indexer's CBOR responses. Native transaction identities are computed
with `hauntboard/reset-burn-claim`, pinned to transaction 0.49.1. Updating this
operator bundle does not update the shipping browser SDK.

## Private state

The new wallet and deployment journal are retained in Docker volume
`hauntboard-esmeralda-20261102-operator`, at
`/private/esmeralda-deployment.json`. Keys and recovery words must never enter
source control or command output. Both L1 and L2 wallet material was generated
fresh. The old wallet volume is preserved; it is not a funding fallback.

The user funded the new Ootle account directly with 500 test TARI. Account and
vault ownership/balance were verified against both Tari-hosted indexers. No new
L1 burn is needed for this deployment. The approved maximum is 20 test TARI in
total fees, not the full wallet balance.

## Build and verify

Run toolchains in containers. The Rust image is pinned to:

```
rust@sha256:2775a09d208ff0d7c1f50490c45b62db929e87ba1dcbc3f2132ac71a704bcdd3
```

Inside that container, with the checkout at `/workspace`, registry cache mounted
at `/usr/local/cargo/registry`, and `CARGO_TARGET_DIR=/target`:

```sh
rustup target add wasm32-unknown-unknown
cargo build --locked --manifest-path hauntboard/reset-burn-claim/Cargo.toml
cargo test --locked --manifest-path hauntboard/template-public/Cargo.toml -- --test-threads=1
cargo test --locked --manifest-path hauntboard/key-registry/Cargo.toml -- --test-threads=1
cargo build --locked --release --target wasm32-unknown-unknown --manifest-path hauntboard/template-public/Cargo.toml
cargo build --locked --release --target wasm32-unknown-unknown --manifest-path hauntboard/key-registry/Cargo.toml
cp /target/wasm32-unknown-unknown/release/hauntboard_public.wasm hauntboard/template-public/hauntboard_public.wasm
cp /target/wasm32-unknown-unknown/release/hauntboard_key_registry.wasm hauntboard/key-registry/hauntboard_key_registry.wasm
```

Build the operator bundle in a Node container from `hauntboard/operator-sdk`:

```sh
npm ci --ignore-scripts
npm run build
```

It writes only `hauntboard/artifacts/reset-sdk/bundle`, leaving the shipping
browser SDK untouched. Artifacts and module directories are ignored by Git.

## Deploy and resume

The operator requires Playwright/Chromium, the checkout at `/workspace`, the new
private volume at `/private`, and native helper binaries at `/target/debug`.
The local `hauntboard-browser-tests:contest` image and
`hauntboard_contest_browser_modules` volume provide the browser runtime used in
this checkout. Run from `/workspace`:

```sh
node hauntboard/scripts/redeploy-esmeralda.mjs \
  --reset-identity=esmeralda-reset-2026-11-02 \
  --budget-microtari=20000000
```

Without `--execute`, this checks state and simulates the next missing stage.
Add `--execute` only under the existing account/budget authorization to publish
both templates and create the board. A pre-existing funded account is derived
from the wallet's public key and verified before use. Each stage dry-runs,
reserves its maximum fee against the cumulative budget, and saves its exact
signed envelope and native identity before dispatch. A resumed uncertain stage
only reconciles that identity. A private lock prevents concurrent deployments.
An abandoned lock requires inspection of the journal before removal.

`--replace-incompatible-templates` explicitly archives the first confirmed
publications and their reserved fees when switching from the incompatible
pre-reset binaries. It refuses replacement after board creation has started.
Subsequent ordinary resumes must keep the same binary hashes.

The sanitized result is written to
`hauntboard/evidence/redeployment-esmeralda-reset-2026-11-02.json`. It proves
publication and schema-4 board creation, not browser posting compatibility or
poster privacy.

## Website migration

The hosted manifest and browser runtime were migrated together on November 2.
SDK 0.12.0, BOR/crypto 0.49.1, current receipt decoding, and bounded private-output
stream/fetch scanning now ship on the VPS. Do not install new addresses alone,
reuse the old reset namespace, or set compatibility/privacy flags to true based
on publication. Old operation journals and room backups were preserved.

An archived L1 burn claim was rejected by finalization because its pre-reset
block was not in the new network's L1 history. Its final receipt reports zero
fees paid. See `reset-archived-claim-2026-11-02.json`; it must not be retried as a
funding route.

## November 2 result

Both replacement publications and the new schema-4 board finalized. The seven
board tests and four registry tests passed. The contract source/archive hash
verification also passed. Both official indexers returned verified state for
the new board and both template addresses.

Total actual fees were 3.918211 test TARI, including the superseded publications.
The wallet's remaining revealed balance was 496.081789 test TARI. Detailed
verification is in `hauntboard/evidence/reset-live-2026-11-02.json`.

`network.esmeralda-reset-2026-11-02.json` and the active `network.public.json`
contain the new chain addresses, reset namespace and client version pins. The VPS
now uses that manifest and the tested client image. The General reset notice was
published through its browser wallet and rendered in Chromium and Firefox. See
`reset-vps-deployment-2026-11-02.json` for deployment, fee-budget and test evidence.

The site retains its in-app faucet button. Discovery capsules carrying the old
reset are rejected; automatic polling falls back to native stream scanning with
a thirty-second throttle. The wallet also deduplicates output locators shared
across different advancing shard pages without weakening legacy cursor checks.
