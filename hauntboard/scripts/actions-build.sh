#!/bin/sh
set -eu
test "${GITHUB_REPOSITORY:-}" = kstrycharz/hauntboard
test "${GITHUB_REF:-}" = refs/heads/main
test "${GITHUB_EVENT_NAME:-}" = workflow_dispatch
test -n "${GITHUB_RUN_ID:-}"
mkdir -p hauntboard/evidence hauntboard/artifacts
node_image=node:22.21.1-bookworm-slim@sha256:25b3eb23a00590b7499f2a2ce939322727fcce1b15fdd69754fcd09536a3ae2c
docker build -f infra/docker/rust-spike.Dockerfile -t hauntboard-actions-rust:1.97.1 .
docker build --target tools -f infra/docker/node.Dockerfile -t hauntboard-actions-node:22.21.1 .
rust_run() {
 docker run --rm --cpus 2 --memory 6g -v "$PWD:/workspace" -v hauntboard_actions_rust_target:/target -v hauntboard_actions_cargo_registry:/usr/local/cargo/registry -e CARGO_TARGET_DIR=/target -e CARGO_BUILD_JOBS=2 -w /workspace hauntboard-actions-rust:1.97.1 "$@"
}
rust_run sh hauntboard/template-public/test-engine.sh
rust_run sh -c 'cd hauntboard/template-public && cargo build --locked --release --target wasm32-unknown-unknown && cp /target/wasm32-unknown-unknown/release/hauntboard_public.wasm hauntboard_public.wasm'
docker run --rm -v "$PWD:/workspace" -v hauntboard_actions_sdk_modules:/workspace/hauntboard/browser-sdk/node_modules -v hauntboard_actions_pnpm_store:/pnpm/store -w /workspace hauntboard-actions-node:22.21.1 sh -c 'pnpm --dir hauntboard/browser-sdk install --ignore-workspace --frozen-lockfile && pnpm --dir hauntboard/browser-sdk build'
rust_run sh hauntboard/wallet-recovery/build.sh
rust_run sh hauntboard/transaction-identity/build.sh
docker run --rm -e GITHUB_SHA -v "$PWD:/workspace" -w /workspace "$node_image" sh -c 'node hauntboard/scripts/package-public-contract.mjs && node hauntboard/scripts/verify-public-contract.mjs && node --test hauntboard/tests/component-provider.mjs hauntboard/tests/delivery.test.mjs hauntboard/tests/operations-backup.test.mjs hauntboard/tests/output-ledger.test.mjs'
docker build -f infra/docker/hauntboard.Dockerfile -t "hauntboard-actions-app:$GITHUB_RUN_ID" .
docker run --rm --read-only --cap-drop ALL --security-opt no-new-privileges --tmpfs /companion:uid=1000,gid=1000 -v "$PWD/hauntboard/tests:/tests:ro" "hauntboard-actions-app:$GITHUB_RUN_ID" node /tests/public-server.mjs
