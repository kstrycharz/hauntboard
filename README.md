# Hauntboard

A message board on Tari Ootle Esmeralda testnet. Posts live in contract state; wallet keys and signing stay in your browser. Public threads contain readable text. The current source also supports sealed message bodies with public titles/categories and privately shared invitation keys. Test currency has no monetary value. Posts cannot be edited or deleted.

**Website:** https://hauntboard.taritracker.com
**Source and download:** https://github.com/kstrycharz/hauntboard

**Start with the privacy walkthrough:** open **Privacy evidence** in the app (`/proof`), or read the [judge walkthrough](hauntboard/docs/judge-walkthrough.md). Compare outsider, invited-reader and removed-reader access, then follow the eight recorded Esmeralda transactions. The optional registry lookup reports current provider availability separately from recorded execution.

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

## Wallet funding

The hosted wallet's **Need test tokens?** section includes **Get 100 test tXTR**, powered by the [TariTracker.com faucet](https://testnet-faucet.taritracker.com/). Hauntboard sends requests through its backend; the faucet API key never reaches the browser. Requests share your receive address with Hauntboard and the faucet. A saved receipt tracks queued, pending, uncertain and confirmed payments across reloads. Interrupted requests reuse the same receipt and payload; confirmation still requires the wallet to scan the incoming output before the balance updates.

The faucet allows one withdrawal per wallet owner per hour across its website and API. Hauntboard also limits each browser session to one new request per hour; shared faucet budgets and quotas apply. Self-hosted clients without a backend API key show the faucet link instead. Receive funds or recover a funded wallet, then use **Check for incoming funds**. For funds held in a standard Tari account, choose **Convert to posting funds** and review the network fee.

## Check posts on chain

Each forum row has **View thread on chain**, and each post has **View on chain**. These links open the relevant component directly at the configured Tari indexer. Expand **Post details** to see the page address and entry containing that post. Public post payloads are stored as byte arrays in the component state. This is an indexer-reported chain-state check, not proof of authorship or independent consensus verification.

## Contract and reproducible builds

The shipping schema-4 Rust contract is in [hauntboard/template-public](hauntboard/template-public). Source, Cargo lockfile, seven engine tests and compiled `hauntboard_public.wasm` are included. [release/SHA256SUMS](release/SHA256SUMS) records bundled artifact hashes. [network.public.json](hauntboard/deploy/network.public.json) identifies the existing board/template; routine deployment preserves both. Sealed bodies use the existing opaque byte payload ABI and require a compatible website release, not a new contract.

To rebuild the SDK, recovery adapters and contract using pinned containers and locked dependencies:

```sh
sh hauntboard/scripts/build-release.sh
```

Allow at least 8 GB RAM and compiler-cache storage for this full build. It runs contract/server tests and submits no chain transaction. Rebuilt artifacts require review against the published template before any new publication.

## Verify the privacy claims

Recipient-specific invitations, encrypted access backups and key rotation are available through **Room access** in a sealed thread. A guided setup helps users save their recovery code and download an encrypted backup before continuing. Users exchange copyable access requests, approve named invitations and select members to remove. See the [usage guide](hauntboard/docs/room-access.md) and [registry specification](hauntboard/key-registry/README.md). The standalone privacy demo has been removed; these controls operate on actual rooms. The companion registry authorizes key distribution; existing board writes remain permissionless. Classic invitations remain supported. Removal protects future messages; copied old keys and plaintext remain usable.

The [Esmeralda demonstration](hauntboard/evidence/room-key-esmeralda.json) records finalized template publication, native-stealth-funded posts, recipient delivery and removal/rotation. Four native registry engine tests and the Chromium/Firefox recipient/recovery/management scenarios are recorded separately. These checks establish the exercised behavior, not anonymity or a comprehensive security audit. Broader privacy/compatibility manifest flags remain unchanged.

Read the [threat model](hauntboard/docs/privacy-threat-model.md), [reproducible verification and judge walkthrough](hauntboard/docs/privacy-verification.md), and [contest submission draft](hauntboard/docs/contest-submission.md). The recorded local run has 38 passing Node test entries, seven native engine cases and ten browser scenarios per browser in Chromium and Firefox. These are separate evidence layers, not an inflated count of independent attacks.

Native fee signing omits stable wallet identifiers; it does not prove unlinkability. Shared funding origins, output graphs, fees, timing and network connections remain observable. The read-only [public audit](hauntboard/evidence/privacy-public-audit.json) records insufficient recent receipts for a two-post Esmeralda comparison. The later [room execution record](hauntboard/evidence/room-key-esmeralda.json), checked October 21 UTC, covers native-stealth-funded sealed posting and recipient-key rotation. It does not complete the separate same-wallet multi-post comparison. Manifest verification flags remain false.

The October 28 source update hardens room-vault persistence: failed saves preserve prior keys, queued writes preserve different rooms, and locking cancels in-flight saves/unlocks. [Browser regression evidence](hauntboard/evidence/vault-browser.json) exercises real storage and cryptography in Chromium and Firefox. The browser SDK is now pinned to 0.11.1 and its crypto/transaction identity code to 0.47.0. A saved public transaction vector checks modern transaction identity without depending on indexer retention; its capture preserves large integer nonces exactly. [Native wallet checks](hauntboard/evidence/wallet-compatibility-browser.json) exercise local creation, PIN unlock and recovery in both browsers. These source changes need their own deployment; older deployment records do not establish that they are live. A funded post on the new library versions and the same-wallet public audit remain separate gates.

## VPS deployment

See [VPS deployment](hauntboard/deploy/VPS.md) for Cloudflare HTTP origin, the private deployment runner, checks and rollback. Contract publication is separate and requires an explicit account/fee budget.

## Support Hauntboard

If you would like to support Hauntboard development, donations are welcome at this wallet address:

```text
1213nhRFy9S3tevPWJyThkZpEuDruaa4L4LNLEgzAuc4PG6dL862KzsijZgyg68qrcKS2U3hCqzjkiJHdasrTDj3pwf
```

## Repository scope

This release contains Hauntboard client/server, contract, wallet adapters, tests and deployment tooling. The earlier Hauntbox application is removed from the current Git tree but remains in Git history. Older localnet scripts/evidence are development references; start with the current setup above.

Original code is [MIT](LICENSE). See [third-party notices](THIRD_PARTY_NOTICES.md), [security](SECURITY.md), and [architecture](hauntboard/docs/tari-l2-architecture.md).
