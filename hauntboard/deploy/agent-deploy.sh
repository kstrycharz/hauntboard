#!/bin/sh
set -eu
exec 9>/opt/hauntboard/deploy.lock
flock -n 9 || { echo 'Another deployment is running.'; exit 0; }
cd /opt/hauntboard
tag=$(curl --retry 3 --max-time 30 -fsSL https://api.github.com/repos/kstrycharz/hauntboard/releases/latest | python3 -c 'import json,sys,re; tag=json.load(sys.stdin)["tag_name"]; assert re.fullmatch("release-[0-9a-f]{40}",tag); print(tag)')
if [ -f CURRENT_RELEASE ] && [ "$(cat CURRENT_RELEASE)" = "$tag" ]; then
  docker compose ps --format json
  echo "Already running $tag"
  exit 0
fi
mkdir -p downloads
stage=$(mktemp -d /opt/hauntboard/downloads/candidate.XXXXXX)
candidate=hauntboard-release-candidate
switched=false
cleanup() {
  status=$?
  if [ "$status" -ne 0 ] && [ "$switched" = true ] && [ -f .env.previous ]; then
    cp .env.previous .env
    docker compose up -d --wait --wait-timeout 150 || true
    echo 'Restored previous application image.'
  fi
  docker rm -f "$candidate" >/dev/null 2>&1 || true
  rm -f "$stage"/*
  rmdir "$stage"
  exit "$status"
}
trap cleanup EXIT
base="https://github.com/kstrycharz/hauntboard/releases/download/$tag"
for name in hauntboard-image.tar.gz IMAGE_ID SOURCE_COMMIT SHA256SUMS network.public.json hauntboard_public.wasm; do
  curl --retry 3 --max-time 180 -fsSL "$base/$name" -o "$stage/$name"
done
(cd "$stage" && sha256sum -c SHA256SUMS)
test "$(cat "$stage/SOURCE_COMMIT")" = "${tag#release-}"
# Routine website releases must never replace this board or manifest.
cmp network.json "$stage/network.public.json"
image=$(cat "$stage/IMAGE_ID")
printf '%s' "$image" | grep -Eq '^sha256:[a-f0-9]{64}$'
gzip -dc "$stage/hauntboard-image.tar.gz" | docker load
test "$(docker image inspect "hauntboard:$tag" --format '{{.Id}}')" = "$image"
docker rm -f "$candidate" >/dev/null 2>&1 || true
docker run -d --name "$candidate" --read-only --tmpfs /companion:uid=1000,gid=1000 --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges --memory 512m \
  -e HAUNTBOARD_PROFILE=public -e HAUNTBOARD_TESTNET_BETA=true -e HAUNTBOARD_FAUCET_ENABLED=false -e PORT=8280 -e ORIGIN=https://hauntboard.taritracker.com \
  -e INDEXER_URL=https://ootle-indexer-a.tari.com -e APPROVED_PROVIDER_ORIGINS=https://ootle-indexer-a.tari.com,https://ootle-indexer-b.tari.com \
  -e CONFIG_FILE=/run/hauntboard/network.json -v /opt/hauntboard/network.json:/run/hauntboard/network.json:ro "$image"
attempt=0
until docker exec "$candidate" node -e "require('http').get('http://127.0.0.1:8280/health/ready',{headers:{Host:'hauntboard.taritracker.com'}},r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"; do
  attempt=$((attempt+1)); test "$attempt" -lt 12; sleep 5
done
cp .env .env.previous
sed "s|^APP_IMAGE=.*|APP_IMAGE=$image|" .env > .env.next
chmod 600 .env.next
mv .env.next .env
switched=true
docker compose up -d --wait --wait-timeout 150
curl --max-time 30 -fsS -H 'Host: hauntboard.taritracker.com' http://127.0.0.1/health/ready
printf '%s\n' "$tag" > CURRENT_RELEASE
switched=false
printf '\nDeployed %s (%s); board preserved.\n' "$tag" "$image"
