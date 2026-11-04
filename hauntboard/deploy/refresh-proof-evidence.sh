#!/bin/sh
# Evidence assets only; preserve the current network, operations and faucet.
set -eu
stage=/opt/hauntboard/proof-refresh-20261104
cd /opt/hauntboard
exec 9>deploy.lock
flock -n 9
old=$(docker inspect hauntboard-app-1 --format '{{.Image}}')
test "$old" = sha256:c7c422c6fcd2f2dc5864fb0219732865a3c3c81a392b72541e10715b84fd522f
test ! -e "$stage/deployment-complete"
cp .env "$stage/env.before"
cp network.json "$stage/network.before.json"
printf '%s\n' "$old" > "$stage/previous-image"
docker build --pull=false --build-arg "BASE_IMAGE=$old" -f "$stage/Dockerfile" -t hauntboard:proof-refresh-20261104 "$stage"
image=$(docker image inspect hauntboard:proof-refresh-20261104 --format '{{.Id}}')
switched=false
cleanup() {
 status=$?
 if [ "$status" -ne 0 ] && [ "$switched" = true ]; then
  cp "$stage/env.before" .env
  docker compose up -d --no-deps --wait --wait-timeout 120 app || true
 fi
 exit "$status"
}
trap cleanup EXIT
cmp network.json "$stage/network.before.json"
sed "s|^APP_IMAGE=.*|APP_IMAGE=$image|" .env > .env.next
chmod 600 .env.next
switched=true
mv .env.next .env
docker compose up -d --no-deps --wait --wait-timeout 120 app
curl --max-time 30 -fsS -H 'Host: hauntboard.taritracker.com' http://127.0.0.1/health/ready
docker exec hauntboard-app-1 node -e 'const f=require("fs");const e=JSON.parse(f.readFileSync("/app/hauntboard/web/proof-evidence.json"));if(e.resetIdentity!=="esmeralda-reset-2026-11-02"||e.registry!=="component_d3045c124ab069e63f98a711f3652c3b4a809093533036b6caf61e36006f543a")process.exit(1);console.log("Reset evidence installed")'
cmp network.json "$stage/network.before.json"
printf '%s\n' "$image" > "$stage/deployment-complete"
switched=false
