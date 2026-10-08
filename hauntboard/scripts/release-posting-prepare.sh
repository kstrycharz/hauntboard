#!/bin/sh
set -eu
cd /home/ubuntu/hauntboard/releases/0.5.0
expected=sha256:4f185a93c3c60fd6661b57b844c00daf8e668ca0329268c7b2689ac12439da81
image=sha256:0ef38d7ab600d5606823d1fc95887bb23252fedff0d9cccbc2bf31c2558afcb8
test "$(docker inspect hauntboard-tunnel-app-1 --format '{{.Image}}')" = "$expected"
test "$(docker image inspect hauntboard-esmeralda-beta:0.6.10-prepare --format '{{.Id}}')" = "$image"
cp -p .env .env.before-0.6.10
sed "s|^APP_IMAGE=.*|APP_IMAGE=$image|" .env > .env.next
chmod 600 .env.next
mv .env.next .env
docker compose --env-file .env -f compose.tunnel.yaml -f compose.beta.yaml up -d --no-deps app preview
docker inspect hauntboard-tunnel-app-1 --format '{{.Image}}'
docker inspect hauntboard-tunnel-tunnel-1 --format '{{.State.StartedAt}}'
