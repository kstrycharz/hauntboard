#!/bin/sh
set -eu
base='hauntboard-esmeralda-beta:0.5.9'
expected='sha256:3ce7aaeb4597b2d7100f48a6f06c0a166cb8c70ff4fedf54f199cef253f31cca'
actual=$(docker image inspect "$base" --format '{{.Id}}')
if [ "$actual" != "$expected" ]; then
  echo 'GUI base image changed; inspect the current deployment before building.' >&2
  exit 1
fi
docker build --pull=false -f Dockerfile.gui --build-arg "BASE_IMAGE=$base" -t hauntboard-esmeralda-beta:0.6.4-gui .
test "$(docker image inspect "$base" --format '{{.Id}}')" = "$expected"
docker image inspect hauntboard-esmeralda-beta:0.6.4-gui --format '{{.Id}}'
