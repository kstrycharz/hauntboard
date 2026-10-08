#!/bin/sh
set -eu
cd /home/ubuntu/hauntboard/releases/0.5.0
expected=sha256:0f20688308885e3f247e0da8a832905d9cea22faeb01326c6ba8a9946bf29f11
image=sha256:69b6e686d7f7eb64c87e1b14daffec85376ed1e08d9fb8ff8b3aea1033cef5b1
test "$(docker inspect hauntboard-tunnel-app-1 --format '{{.Image}}')" = "$expected"
test "$(docker image inspect hauntboard-esmeralda-beta:0.6.7-recovery --format '{{.Id}}')" = "$image"
cp -p .env .env.before-0.6.7
sed "s|^APP_IMAGE=.*|APP_IMAGE=$image|" .env > .env.next
chmod 600 .env.next
mv .env.next .env
docker compose --env-file .env -f compose.tunnel.yaml -f compose.beta.yaml up -d --no-deps app preview
docker image save hauntboard-esmeralda-beta:0.6.7-recovery -o esmeralda-beta-0.6.7-recovery.tar
docker inspect hauntboard-tunnel-app-1 --format '{{.Image}}'
docker inspect hauntboard-tunnel-tunnel-1 --format '{{.State.StartedAt}}'
