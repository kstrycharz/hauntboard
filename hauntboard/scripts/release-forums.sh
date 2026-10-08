#!/bin/sh
set -eu
release=/home/ubuntu/hauntboard/releases/0.5.0
candidate=/home/ubuntu/hauntboard/forums-redeploy
expected=sha256:257e806b66bf8f31bb26a796bf2f2c2b78c0b2d971c9f3d33eac09d233bf3ab4
image=sha256:0f20688308885e3f247e0da8a832905d9cea22faeb01326c6ba8a9946bf29f11
test "$(docker inspect hauntboard-tunnel-app-1 --format '{{.Image}}')" = "$expected"
test "$(docker image inspect hauntboard-esmeralda-beta:0.6.6-forums --format '{{.Id}}')" = "$image"
cd "$release"
cp -p network.json network.before-0.6.6.json
cp -p .env .env.before-0.6.6
cp "$candidate/network.json" network.next.json
chmod 644 network.next.json
mv network.next.json network.json
sed "s|^APP_IMAGE=.*|APP_IMAGE=$image|" .env > .env.next
chmod 600 .env.next
mv .env.next .env
docker compose --env-file .env -f compose.tunnel.yaml -f compose.beta.yaml up -d --no-deps app preview
docker image save hauntboard-esmeralda-beta:0.6.6-forums -o esmeralda-beta-0.6.6-forums.tar
docker inspect hauntboard-tunnel-app-1 --format '{{.Image}}'
docker inspect hauntboard-tunnel-tunnel-1 --format '{{.State.StartedAt}}'
