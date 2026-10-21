#!/bin/sh
# Authorized website update. Retains board, operational data and faucet secrets.
set -eu
stage=${3:-/opt/hauntboard/room-keys-20261020}
case "$stage" in /opt/hauntboard/room-keys-*) ;; *) exit 1 ;; esac
archive=$stage/hauntboard-room-keys.tar
expected_config=${1:?Expected image config ID}
archive_hash=${2:?Expected archive SHA256}
registry_template=9de14a5ca71a3c243c0c8a4a9f5896de6f89a5d60f2f42da0ad9351ca0c08527
exec 9>/opt/hauntboard/deploy.lock
flock -n 9
test "$(sha256sum "$archive" | cut -d ' ' -f 1)" = "$archive_hash"
docker load -i "$archive"
docker image save hauntboard:room-keys-20261020 | python3 /usr/local/lib/hauntboard/verify-image.py "$expected_config"
image=$(docker image inspect hauntboard:room-keys-20261020 --format '{{.Id}}')
cd /opt/hauntboard
if test -e "$stage/env.before"; then
  cmp .env "$stage/env.before"
  cmp network.json "$stage/network.before.json"
else
  cp .env "$stage/env.before"
  cp network.json "$stage/network.before.json"
fi
previous=$(docker inspect --format '{{.Image}}' hauntboard-app-1)
printf '%s\n' "$previous" > "$stage/previous-image"
docker tag "$previous" hauntboard:before-room-keys-20261020
python3 - "$registry_template" "$stage/network.candidate.json" <<'PY'
import json,sys
with open('network.json') as f: config=json.load(f)
assert config['network']=='esmeralda' and config['schema']==4
assert config['board']=='component_594f90d8cb8c2d0f70d941ba1c513769727feceeabd9d2137b5b6a130a6aa28e'
assert config['template']=='f6773b90f8919097266a73e6c68e343724e2a4bdaf248f01e11b463bbc4e0b2d'
config['keyRegistryTemplate']=sys.argv[1]
with open(sys.argv[2],'w') as f: json.dump(config,f,indent=2);f.write('\n')
PY
candidate=hauntboard-room-candidate
docker run -d --name "$candidate" --network hauntboard_default --read-only --cap-drop ALL --security-opt no-new-privileges --tmpfs /tmp:size=16m,noexec,nosuid --tmpfs /companion:uid=1000,gid=1000 --memory 512m \
  -e HAUNTBOARD_PROFILE=public -e HAUNTBOARD_TESTNET_BETA=true -e ORIGIN=https://hauntboard.taritracker.com -e PORT=8280 \
  -e INDEXER_URL=https://ootle-indexer-a.tari.com -e APPROVED_PROVIDER_ORIGINS=https://ootle-indexer-a.tari.com,https://ootle-indexer-b.tari.com \
  -e CONFIG_FILE=/run/hauntboard/network.json -v "$stage/network.candidate.json:/run/hauntboard/network.json:ro" "$image"
trap 'docker rm -f "$candidate" >/dev/null 2>&1 || true' EXIT
sleep 2
docker exec "$candidate" node --input-type=module -e '
import assert from "node:assert/strict";
import {get as httpGet} from "node:http";
const get=(path,expected=200)=>new Promise((resolve,reject)=>{const request=httpGet("http://127.0.0.1:8280"+path,{headers:{Host:"hauntboard.taritracker.com"}},r=>{let text="";r.on("data",b=>text+=b);r.on("end",()=>{try{assert.equal(r.statusCode,expected,path);resolve({json:async()=>JSON.parse(text)});}catch(e){reject(e);}});});request.on("error",reject);});
await get("/health/ready");
const c=await(await get("/api/config")).json();assert.equal(c.keyRegistryTemplate,"9de14a5ca71a3c243c0c8a4a9f5896de6f89a5d60f2f42da0ad9351ca0c08527");
const s=await(await get("/api/key-registry?address=component_dd15b354b77523cb53cf8a6f64913926cf31062f8811102ca5804b8609b4681e")).json();assert.equal(s.generation,1);assert.equal(s.revision,2);
for(const path of ["/room-manager.mjs","/room-access-request.mjs","/room-vault.mjs","/room-keys.mjs","/vendor/hpke.mjs"])await get(path);
for(const path of ["/privacy-demo","/room-demo.mjs","/room-demo.css","/room-demo-evidence.json"])await get(path,404);
console.log("Candidate readiness, registry reads and assets passed.");'
cp "$stage/network.candidate.json" network.json
python3 - "$image" <<'PY'
import re,sys
p='.env'
s=open(p).read()
assert re.search(r'^APP_IMAGE=.*$',s,re.M)
open(p,'w').write(re.sub(r'^APP_IMAGE=.*$','APP_IMAGE='+sys.argv[1],s,flags=re.M))
PY
if ! docker compose up -d --no-deps --wait --wait-timeout 120 app; then
  cp "$stage/env.before" .env
  cp "$stage/network.before.json" network.json
  docker compose up -d --no-deps --wait --wait-timeout 120 app
  echo 'Candidate failed after switch; prior image and configuration restored.' >&2
  exit 1
fi
printf '%s\n' "$image" > "$stage/deployed-image"
docker inspect --format '{{.State.Health.Status}} {{.Image}}' hauntboard-app-1
