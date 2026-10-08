#!/bin/sh
set -eu
cd /home/ubuntu/hauntboard/releases/0.5.0
expected=sha256:69b6e686d7f7eb64c87e1b14daffec85376ed1e08d9fb8ff8b3aea1033cef5b1
image=sha256:109afa4607d13a123cc163ffe139786fef162003d8993294473f10a31dca5801
test "$(docker inspect hauntboard-tunnel-app-1 --format '{{.Image}}')" = "$expected"
test "$(docker image inspect hauntboard-esmeralda-beta:0.6.8-recovery --format '{{.Id}}')" = "$image"
cp -p .env .env.before-0.6.8
sed "s|^APP_IMAGE=.*|APP_IMAGE=$image|" .env > .env.next
chmod 600 .env.next
mv .env.next .env
docker compose --env-file .env -f compose.tunnel.yaml -f compose.beta.yaml up -d --no-deps app preview
docker image save hauntboard-esmeralda-beta:0.6.8-recovery -o esmeralda-beta-0.6.8-recovery.tar
docker inspect hauntboard-tunnel-app-1 --format '{{.Image}}'
docker inspect hauntboard-tunnel-tunnel-1 --format '{{.State.StartedAt}}'
