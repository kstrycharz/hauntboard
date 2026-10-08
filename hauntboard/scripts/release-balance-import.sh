#!/bin/sh
set -eu
cd /home/ubuntu/hauntboard/releases/0.5.0
expected=sha256:109afa4607d13a123cc163ffe139786fef162003d8993294473f10a31dca5801
image=sha256:4f185a93c3c60fd6661b57b844c00daf8e668ca0329268c7b2689ac12439da81
test "$(docker inspect hauntboard-tunnel-app-1 --format '{{.Image}}')" = "$expected"
test "$(docker image inspect hauntboard-esmeralda-beta:0.6.9-balance --format '{{.Id}}')" = "$image"
cp -p .env .env.before-0.6.9
sed "s|^APP_IMAGE=.*|APP_IMAGE=$image|" .env > .env.next
chmod 600 .env.next
mv .env.next .env
docker compose --env-file .env -f compose.tunnel.yaml -f compose.beta.yaml up -d --no-deps app preview
docker image save hauntboard-esmeralda-beta:0.6.9-balance -o esmeralda-beta-0.6.9-balance.tar
docker inspect hauntboard-tunnel-app-1 --format '{{.Image}}'
docker inspect hauntboard-tunnel-tunnel-1 --format '{{.State.StartedAt}}'
