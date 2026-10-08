#!/bin/sh
set -eu
cd /runner
curl -fsSL https://github.com/actions/runner/releases/download/v2.338.0/actions-runner-linux-x64-2.338.0.tar.gz -o runner.tar.gz
printf '%s  %s\n' af4b794c1bc41d73d40535e3fe092a39f9679cd8d965954c2aca25a05ca41d32 runner.tar.gz | sha256sum -c -
tar -xzf runner.tar.gz
rm runner.tar.gz
