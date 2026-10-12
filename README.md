# Hauntboard

A public message board on Tari Ootle Esmeralda testnet. Full posts live in contract state; wallet keys and signing stay in your browser. Test currency has no monetary value. Posts cannot be edited or deleted.

**Website:** https://hauntboard.taritracker.com
**Source and download:** https://github.com/kstrycharz/hauntboard

## Run your own copy

Install Docker with Docker Compose, then:

```sh
git clone https://github.com/kstrycharz/hauntboard.git
cd hauntboard
docker compose -f compose.client.yaml up -d --build --wait
```

Open **http://localhost:8282** (use this exact hostname). Bundled SDK/WASM artifacts let you run without Node or Rust. This client reads the same published board through Tari indexers and does not call the hosted Hauntboard VPS. Browser wallets belong to this origin; privately restore your phrase if needed. Never put recovery words in GitHub issues or server configuration.

Stop with `docker compose -f compose.client.yaml down`. Do not add `-v`: that deletes local operation records. Back up recovery words separately; Docker volumes do not contain browser wallets.

This is an independently hosted **client**, not an independent network node. The current release only accepts two Tari-hosted Esmeralda indexers. You still trust the downloaded client, providers and testnet; resets can erase testnet state. Your own indexer requires additional integration and verification. We do not claim complete anonymity or full decentralization.

## Contract and reproducible builds

The shipping schema-4 Rust contract is in [hauntboard/template-public](hauntboard/template-public). Source, Cargo lockfile, five engine tests and compiled `hauntboard_public.wasm` are included. [release/SHA256SUMS](release/SHA256SUMS) records bundled artifact hashes. [network.public.json](hauntboard/deploy/network.public.json) identifies the existing board/template; routine deployment preserves both.

To rebuild the SDK, recovery adapters and contract using pinned containers and locked dependencies:

```sh
sh hauntboard/scripts/build-release.sh
```

Allow at least 8 GB RAM and compiler-cache storage for this full build. It runs contract/server tests and submits no chain transaction. Rebuilt artifacts require review against the published template before any new publication.

## VPS deployment

See [VPS deployment](hauntboard/deploy/VPS.md) for Cloudflare HTTP origin, the private deployment runner, checks and rollback. Contract publication is separate and requires an explicit account/fee budget.

## Repository scope

This release contains Hauntboard client/server, contract, wallet adapters, tests and deployment tooling. The earlier Hauntbox application is removed from the current Git tree but remains in Git history. Older localnet scripts/evidence are development references; start with the current setup above.

Original code is [MIT](LICENSE). See [third-party notices](THIRD_PARTY_NOTICES.md), [security](SECURITY.md), and [architecture](hauntboard/docs/tari-l2-architecture.md).
