#!/bin/sh
set -eu
test "${GITHUB_REPOSITORY:-}" = kstrycharz/hauntboard
test "${GITHUB_REF:-}" = refs/heads/main
test "${GITHUB_EVENT_NAME:-}" = workflow_dispatch
case "${GITHUB_RUN_ID:-}" in ''|*[!0-9]*) exit 1;; esac
release=/home/ubuntu/hauntboard/releases/0.5.0
expected=$(docker inspect hauntboard-tunnel-app-1 --format '{{.Image}}')
image=$(docker image inspect "hauntboard-actions-app:$GITHUB_RUN_ID" --format '{{.Id}}')
playwright=mcr.microsoft.com/playwright:v1.63.0-noble@sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27
node_image=node:22.21.1-bookworm-slim@sha256:25b3eb23a00590b7499f2a2ce939322727fcce1b15fdd69754fcd09536a3ae2c
modules=hauntboard_actions_playwright_modules
wallet="hauntboard-actions-deploy-$GITHUB_RUN_ID"
candidate="hauntboard-actions-candidate-$GITHUB_RUN_ID"
backup="$release/actions-backups/$GITHUB_RUN_ID"
docker run --rm -v "$modules:/deps/node_modules" "$node_image" npm install --prefix /deps --ignore-scripts --no-audit --no-fund @playwright/test@1.63.0
docker run --rm --network host -e HAUNTBOARD_RELEASE_ID="$GITHUB_RUN_ID" -v "$PWD:/workspace" -v "$modules:/workspace/node_modules:ro" -v "$wallet:/private" -w /workspace "$playwright" node hauntboard/scripts/deploy-esmeralda.mjs --ci-release
docker run --rm -e GITHUB_SHA -e HAUNTBOARD_RELEASE_ID="$GITHUB_RUN_ID" -v "$PWD:/workspace" -v "$release/network.json:/live/network.json:ro" -w /workspace "$node_image" node hauntboard/scripts/actions-verify-contract.mjs
docker rm -f "$candidate" 2>/dev/null || true
docker run -d --name "$candidate" -p 127.0.0.1:8299:8280 --read-only --tmpfs /companion:uid=1000,gid=1000 --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges -e HAUNTBOARD_PROFILE=client -e HAUNTBOARD_TESTNET_BETA=true -e HAUNTBOARD_FAUCET_ENABLED=false -e PORT=8280 -e ORIGIN=http://localhost:8299 -e INDEXER_URL=https://ootle-indexer-a.tari.com -e APPROVED_PROVIDER_ORIGINS=https://ootle-indexer-a.tari.com,https://ootle-indexer-b.tari.com -e CONFIG_FILE=/run/hauntboard/network.json -v "$PWD/hauntboard/artifacts/actions-network.json:/run/hauntboard/network.json:ro" "$image"
switched=false
rollback() {
 status=$?
 if [ "$status" -ne 0 ] && [ "$switched" = true ]; then
  cp -p "$backup/network.json" "$release/network.json"
  cp -p "$backup/.env" "$release/.env"
  (cd "$release" && docker compose --env-file .env -f compose.tunnel.yaml -f compose.beta.yaml up -d --no-deps --force-recreate app preview) || true
  printf 'Live release restored; the confirmed testnet contract is retained for reconciliation.\n'
 fi
 docker rm -f "$candidate" >/dev/null 2>&1 || true
 exit "$status"
}
trap rollback EXIT
docker run --rm --network host -e FORUM_ORIGIN=http://localhost:8299 -e RECOVERY_ORIGIN=http://localhost:8299 -v "$PWD:/workspace" -v "$modules:/workspace/node_modules:ro" -w /workspace "$playwright" sh -c 'node hauntboard/tests/forums.mjs && node hauntboard/tests/wallet-replace.mjs'
test "$(docker inspect hauntboard-tunnel-app-1 --format '{{.Image}}')" = "$expected"
mkdir -p "$backup"
chmod 700 "$backup"
if [ ! -f "$backup/.env" ]; then cp -p "$release/.env" "$backup/.env"; cp -p "$release/network.json" "$backup/network.json"; fi
cp "$PWD/hauntboard/artifacts/actions-network.json" "$release/network.next.json"
chown --reference="$release/network.json" "$release/network.next.json"
chmod 644 "$release/network.next.json"
sed "s|^APP_IMAGE=.*|APP_IMAGE=$image|" "$release/.env" > "$release/.env.next"
chown --reference="$release/.env" "$release/.env.next"
chmod 600 "$release/.env.next"
mv "$release/network.next.json" "$release/network.json"
mv "$release/.env.next" "$release/.env"
switched=true
(cd "$release" && docker compose --env-file .env -f compose.tunnel.yaml -f compose.beta.yaml up -d --no-deps app preview)
origin=$(sed -n 's/^ORIGIN=//p' "$release/.env")
attempt=0
until docker run --rm -e GITHUB_SHA -e HAUNTBOARD_RELEASE_ORIGIN="$origin" -v "$PWD:/workspace" -w /workspace "$node_image" node hauntboard/scripts/actions-verify-release.mjs; do
 attempt=$((attempt+1));test "$attempt" -lt 6;sleep 5
done
switched=false
printf 'Verified image: %s\n' "$image"
docker inspect hauntboard-tunnel-tunnel-1 --format 'Tunnel retained: {{.State.StartedAt}}'
