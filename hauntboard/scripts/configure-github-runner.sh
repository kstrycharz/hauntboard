#!/bin/sh
set -eu
# Registration token arrives on stdin and is not stored in source or command arguments outside this container.
IFS= read -r registration_token
test -n "$registration_token"
cd /home/ubuntu/hauntboard/actions-runner
./config.sh --unattended --url https://github.com/kstrycharz/hauntboard --token "$registration_token" --name hauntboard-ubuntu-192-168-1-200 --labels hauntboard-testnet --work /home/ubuntu/hauntboard/actions-work
unset registration_token
