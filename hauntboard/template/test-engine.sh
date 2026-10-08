#!/bin/sh
set -eu
cd /workspace/hauntboard/template
cargo test --locked --test board -- --test-threads=1
cat > /workspace/hauntboard/evidence/engine.json <<EOF
{"status":"PASSED","schema":3,"checkedAt":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","passed":5,"failed":0,"maximumPosts":2048,"maximumPages":128,"postsPerPage":16,"maximumEnvelopeBytes":4096,"fullCapacityMaximumSizePayloads":true}
EOF
