#!/bin/sh
set -eu
cd /home/ubuntu/hauntboard/releases/0.5.0
previous='sha256:3ce7aaeb4597b2d7100f48a6f06c0a166cb8c70ff4fedf54f199cef253f31cca'
candidate='sha256:26331c00e454c96cbbccf6d3d3290823a3e48f2facebca9ff013b98f3e9a523f'
actual=$(docker inspect hauntboard-tunnel-app-1 --format '{{.Image}}')
if [ "$actual" != "$previous" ]; then
  echo 'Deployment changed since review; preserve it and inspect before updating.' >&2
  exit 1
fi
test "$(docker image inspect hauntboard-esmeralda-beta:0.6.0-gui --format '{{.Id}}')" = "$candidate"
test ! -e .env.before-gui-0.6.0
cp .env .env.before-gui-0.6.0
sed -i "s/^APP_IMAGE=.*/APP_IMAGE=$candidate/" .env
if ! docker compose --env-file .env -f compose.tunnel.yaml -f compose.beta.yaml config --quiet; then
  cp .env.before-gui-0.6.0 .env
  exit 1
fi
if ! docker compose --env-file .env -f compose.tunnel.yaml -f compose.beta.yaml up -d --no-deps app preview; then
  cp .env.before-gui-0.6.0 .env
  docker compose --env-file .env -f compose.tunnel.yaml -f compose.beta.yaml up -d --no-deps app preview
  exit 1
fi
origin=$(sed -n 's/^ORIGIN=//p' .env)
for attempt in 1 2 3 4 5 6; do
  if curl --max-time 5 -fsS "$origin/health/ready"; then
    printf '\nGUI deployment ready.\n'
    docker inspect hauntboard-tunnel-app-1 --format '{{.Image}}'
    exit 0
  fi
  sleep 2
done
echo 'Readiness did not recover; restoring the previous image.' >&2
cp .env.before-gui-0.6.0 .env
docker compose --env-file .env -f compose.tunnel.yaml -f compose.beta.yaml up -d --no-deps app preview
exit 1
