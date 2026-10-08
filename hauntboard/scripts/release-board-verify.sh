#!/bin/sh
set -eu
cd /home/ubuntu/hauntboard/releases/0.5.0
expected=sha256:b89527c551cf9ee8520628348589b8660c3aff26f900639b3a3d4fc0a0e4ed5c
image=sha256:265a53e92386cd53ec8daf222bb1a1d43a214559610939e90747a74f9e07c0f5
test "$(docker inspect hauntboard-tunnel-app-1 --format '{{.Image}}')" = "$expected"
test "$(docker image inspect hauntboard-esmeralda-beta:0.6.12-verify --format '{{.Id}}')" = "$image"
cp -p .env .env.before-0.6.12
sed "s|^APP_IMAGE=.*|APP_IMAGE=$image|" .env > .env.next
chmod 600 .env.next
mv .env.next .env
docker compose --env-file .env -f compose.tunnel.yaml -f compose.beta.yaml up -d --no-deps app preview
docker inspect hauntboard-tunnel-app-1 --format '{{.Image}}'
docker inspect hauntboard-tunnel-tunnel-1 --format '{{.State.StartedAt}}'
