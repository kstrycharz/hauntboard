#!/bin/sh
set -eu
cd /workspace/hauntboard/wallet-recovery
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-/target}"
export RUSTFLAGS='--cfg getrandom_backend="wasm_js"'
cargo build --locked --release --target wasm32-unknown-unknown
if ! command -v wasm-bindgen >/dev/null 2>&1; then
  cargo install wasm-bindgen-cli --version 0.2.100 --locked
fi
mkdir -p /workspace/hauntboard/artifacts/recovery-glue
wasm-bindgen --target web --out-dir /workspace/hauntboard/artifacts/recovery-glue --out-name wallet_recovery "$CARGO_TARGET_DIR/wasm32-unknown-unknown/release/hauntboard_wallet_recovery.wasm"
cp /workspace/hauntboard/artifacts/recovery-glue/wallet_recovery.js /workspace/hauntboard/web/vendor/wallet-recovery-glue.mjs
cp /workspace/hauntboard/artifacts/recovery-glue/wallet_recovery_bg.wasm /workspace/hauntboard/web/wallet-recovery.wasm
