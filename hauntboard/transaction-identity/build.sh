#!/bin/sh
set -eu
cd /workspace/hauntboard/transaction-identity
export RUSTFLAGS='--cfg getrandom_backend="unsupported"'
cargo build --locked --release --target wasm32-unknown-unknown
cp /target/wasm32-unknown-unknown/release/hauntboard_transaction_identity.wasm /workspace/hauntboard/web/transaction-identity.wasm
