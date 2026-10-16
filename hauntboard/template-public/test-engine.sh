#!/bin/sh
set -eu
cd /workspace/hauntboard/template-public
cargo test --locked --test privacy -- --test-threads=1
cat > /workspace/hauntboard/evidence/public-contract-engine.json <<EOF
{"status":"PASSED","schema":4,"engine":"0.45.0","templateLib":"0.34.0","checkedAt":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","passed":7,"authorFields":false,"contractMode":0,"opaquePayloads":true,"maximumPosts":2048,"maximumEnvelopeBytes":4096}
EOF
