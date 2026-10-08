#!/bin/sh
set -eu
export CARGO_TARGET_DIR=/target
export CARGO_BUILD_JOBS=2
cd /workspace/hauntboard/template-public
mkdir -p /workspace/hauntboard/evidence candidate
cargo test --locked --test privacy -- --test-threads=1 > /workspace/hauntboard/evidence/delivery-contract-tests.log 2>&1 || { tail -80 /workspace/hauntboard/evidence/delivery-contract-tests.log; exit 1; }
tail -24 /workspace/hauntboard/evidence/delivery-contract-tests.log
cargo build --locked --release --target wasm32-unknown-unknown
cp /target/wasm32-unknown-unknown/release/hauntboard_public.wasm candidate/hauntboard_public-0.2.1.wasm
count=$(grep -c '^#\[test\]' tests/privacy.rs)
source=$(sha256sum src/lib.rs | cut -d' ' -f1)
tests=$(sha256sum tests/privacy.rs | cut -d' ' -f1)
wasm=$(sha256sum candidate/hauntboard_public-0.2.1.wasm | cut -d' ' -f1)
cat > /workspace/hauntboard/evidence/delivery-contract-engine.json <<EOF
{"status":"PASSED","schema":4,"version":"0.2.1","engine":"0.45.0","templateLib":"0.34.0","checkedAt":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","passed":$count,"sourceSha256":"$source","testsSha256":"$tests","wasmSha256":"$wasm","publicDeployment":false}
EOF
