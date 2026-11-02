#!/bin/sh
set -eu
exec 9>/opt/hauntboard/deploy.lock
flock -n 9 || { echo 'Another deployment is running.'; exit 1; }
cd /opt/hauntboard
stage=/opt/hauntboard/esmeralda-reset-20261102
test -f "$stage/network.next.json"
test -f "$stage/esmeralda-reset-image.tar.gz"
test ! -f "$stage/deployment-complete"
for file in .env network.json compose.yaml CURRENT_RELEASE; do
 if [ -f "$file" ] && [ ! -f "$stage/$file.before" ]; then cp "$file" "$stage/$file.before"; chmod 600 "$stage/$file.before"; fi
done
old=$(docker inspect hauntboard-app-1 --format '{{.Image}}')
docker tag "$old" hauntboard:before-esmeralda-reset-20261102
gzip -dc "$stage/esmeralda-reset-image.tar.gz" | docker load
image=$(docker image inspect hauntboard:esmeralda-reset-20261102 --format '{{.Id}}')
printf '%s' "$image" | grep -Eq '^sha256:[a-f0-9]{64}$'
docker image save hauntboard:esmeralda-reset-20261102 | python3 /usr/local/lib/hauntboard/verify-image.py "$(cat "$stage/IMAGE_CONFIG_ID")"
candidate=hauntboard-reset-release-candidate
switched=false
cleanup() {
 status=$?
 if [ "$status" -ne 0 ] && [ "$switched" = true ]; then
  cp "$stage/.env.before" .env
  cp "$stage/network.json.before" network.json.rollback
  mv network.json.rollback network.json
  docker compose up -d --no-deps --force-recreate --wait --wait-timeout 150 app || true
  echo 'Restored prior image and manifest.'
 fi
 docker rm -f "$candidate" >/dev/null 2>&1 || true
 exit "$status"
}
trap cleanup EXIT
docker run -d --name "$candidate" --read-only --tmpfs /companion:uid=1000,gid=1000 --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges --memory 512m \
 -e HAUNTBOARD_PROFILE=public -e HAUNTBOARD_TESTNET_BETA=true -e HAUNTBOARD_FAUCET_ENABLED=false -e PORT=8280 -e ORIGIN=https://hauntboard.taritracker.com \
 -e INDEXER_URL=https://ootle-indexer-a.tari.com -e APPROVED_PROVIDER_ORIGINS=https://ootle-indexer-a.tari.com,https://ootle-indexer-b.tari.com \
 -e CONFIG_FILE=/run/hauntboard/network.json -v "$stage/network.next.json:/run/hauntboard/network.json:ro" "$image" >/dev/null
attempt=0
until docker exec "$candidate" node -e "fetch('http://127.0.0.1:8280/health/ready',{headers:{Host:'hauntboard.taritracker.com'}}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; do
 attempt=$((attempt+1)); test "$attempt" -lt 12; sleep 3
done
# The operations volume and secret env_file reference remain on the existing service.
# Back up its journals while the old application is quiesced.
switched=true
docker compose stop app
docker run --rm --entrypoint sh --user root -v hauntboard_operations:/source:ro -v "$stage:/backup" "$image" -c 'umask 077; tar -czf /backup/operations.before.tar.gz -C /source .'
cp "$stage/network.next.json" network.json.next
mv network.json.next network.json
sed "s|^APP_IMAGE=.*|APP_IMAGE=$image|;s|^HAUNTBOARD_FAUCET_ENABLED=.*|HAUNTBOARD_FAUCET_ENABLED=false|" .env > .env.next
if ! grep -q '^HAUNTBOARD_FAUCET_ENABLED=' .env.next; then printf '\nHAUNTBOARD_FAUCET_ENABLED=false\n' >> .env.next; fi
chmod 600 .env.next
mv .env.next .env
docker compose up -d --no-deps --force-recreate --wait --wait-timeout 150 app
curl --max-time 30 -fsS -H 'Host: hauntboard.taritracker.com' http://127.0.0.1/health/ready
docker exec hauntboard-app-1 node -e "fetch('http://127.0.0.1:8280/api/config',{headers:{Host:'hauntboard.taritracker.com'}}).then(r=>r.json()).then(c=>{if(c.board!=='component_14d6f4fb8e5bb76f833220284e59f6e0ad866bd35385f30ededdafa282c3399b'||c.resetIdentity!=='esmeralda-reset-2026-11-02')process.exit(1);console.log(JSON.stringify({board:c.board,resetIdentity:c.resetIdentity,faucetEnabled:c.faucetEnabled}));})"
printf '%s\n' manual-esmeralda-reset-20261102 > CURRENT_RELEASE
printf '%s\n' "$image" > "$stage/deployment-complete"
switched=false
printf '\nReset client deployed: %s\n' "$image"
