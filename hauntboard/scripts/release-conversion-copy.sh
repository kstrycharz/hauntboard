#!/bin/sh
set -eu
cd /home/ubuntu/hauntboard/releases/0.5.0
expected=sha256:0ef38d7ab600d5606823d1fc95887bb23252fedff0d9cccbc2bf31c2558afcb8
image=sha256:b89527c551cf9ee8520628348589b8660c3aff26f900639b3a3d4fc0a0e4ed5c
test "$(docker inspect hauntboard-tunnel-app-1 --format '{{.Image}}')" = "$expected"
test "$(docker image inspect hauntboard-esmeralda-beta:0.6.11-conversion --format '{{.Id}}')" = "$image"
cp -p .env .env.before-0.6.11
sed "s|^APP_IMAGE=.*|APP_IMAGE=$image|" .env > .env.next
chmod 600 .env.next
mv .env.next .env
docker compose --env-file .env -f compose.tunnel.yaml -f compose.beta.yaml up -d --no-deps app preview
docker inspect hauntboard-tunnel-app-1 --format '{{.Image}}'
docker inspect hauntboard-tunnel-tunnel-1 --format '{{.State.StartedAt}}'
