#!/bin/sh
set -eu
cd /workspace/hauntboard/key-registry
cargo test --locked --test registry -- --test-threads=1
cargo build --locked --release --target wasm32-unknown-unknown
cp /target/wasm32-unknown-unknown/release/hauntboard_key_registry.wasm /workspace/hauntboard/key-registry/hauntboard_key_registry.wasm
