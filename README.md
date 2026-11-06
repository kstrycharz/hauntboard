# Hauntboard

A message board on Tari Ootle Esmeralda testnet. Posts live in contract state; wallet keys and signing stay in your browser. Public threads contain readable text. The current source also supports sealed message bodies with public titles/categories and privately shared invitation keys. Test currency has no monetary value. Posts cannot be edited or deleted.

**Website:** https://hauntboard.taritracker.com
**Source and download:** https://github.com/kstrycharz/hauntboard

The November 2 Esmeralda reset removed the previous on-chain forum state.
Hauntboard now uses a freshly deployed board and registry with the current
client runtime. Read the [General reset notice](https://hauntboard.taritracker.com/?category=general&thread=component_14ba1630afe627a87ac641b501fc74e5bbb6f505d0cc4148e2506a9eadcc58f0)
or the [reset deployment record](hauntboard/deploy/RESET.md). Updating the website
does not restore posts erased by the testnet reset.

**November 4 proof refresh:** fresh public posts, a new **SECRET THREAD!**, recipient access and key rotation now have [replacement on-chain evidence](hauntboard/evidence/room-key-esmeralda-reset-2026-11-04.json). Both indexers returned matching Commit receipts for all eight proof stages and the separate public post/reply. See the [saved receipt/state bundle](hauntboard/evidence/reset-proofs-2026-11-04/README.md). The hosted Privacy evidence page uses these reset addresses; October evidence remains historical.

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

**Posting:** write your message and press **Post** or **Reply**. The composer discloses a maximum network fee of 1 test TARI; the browser checks the actual fee within that limit and submits without another app review popup. The calculated browser-wallet fee is paid in full. If Sapient is selected, approve in its extension. Setup, funding and unlocking do not automatically publish your draft. Posting stores data on Tari, so it still uses a network fee; app-paid posting is not enabled.

New browser wallets use **Standard posting**, which can reuse remaining tokens for later posts. Existing wallets retain **Reduce links between posts**, which holds change aside. If you own tokens but none are available under that setting, choose **Use remaining tokens** beside your draft, or change **Posting setting** in your browser-wallet details. This explicitly allows later posts to use that change and may link posts through network activity. It does not guarantee anonymity. Pending funds remain reserved until the original operation is resolved.

New wallets start with **0 test TARI**. Creating another wallet does not move tokens from your existing wallet. Use **Get 100 test TARI** in **Add free posting funds** beside your draft, then **Check incoming funds** if discovery is delayed. Funding preserves the draft and does not publish it; press Post or Reply after usable funds arrive. Self-hosted clients without an in-app faucet show the external faucet link. An empty reply now shows an inline instruction to write a message before publishing.

**Wallet choice:** open **Wallet → Sapient & wallet options → Connect Sapient** to post with the stock extension. Connecting selects Sapient for posts and replies; approve each transaction in the extension. It requires native private-fee funds and enforces a maximum fee of 1 test TARI. No seed import or private-balance grant is required. Sapient manages signatures and fee change, so posts may be linked to the wallet; this differs from the browser wallet's isolated posting policy. Interrupted submissions retain their request ID and are checked rather than automatically replaced. Room administration uses the browser wallet. Choose **Continue with browser wallet** to switch back. See [stock Sapient posting](hauntboard/docs/stock-sapient-posting.md).

The browser-wallet fallback trusts this site's code while unlocked. Its PIN is a local convenience, browser data can be lost, and recovery words do not restore room-access keys or every pending operation. Keep the separate backups; a timeout or missing transaction body does not authorize another spend.

The hosted wallet's **Need test tokens?** section includes **Get 100 test TARI**, powered by the [TariTracker.com faucet](https://testnet-faucet.taritracker.com/). Hauntboard sends requests through its backend; the faucet API key never reaches the browser. Requests share your receive address with Hauntboard and the faucet. A saved receipt tracks queued, pending, uncertain and confirmed payments across reloads. Interrupted requests reuse the same receipt and payload; confirmation still requires the wallet to scan the incoming output before the balance updates.

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

Read the [threat model](hauntboard/docs/privacy-threat-model.md) and [reproducible verification and judge walkthrough](hauntboard/docs/privacy-verification.md). The recorded local run has 38 passing Node test entries, seven native engine cases and ten browser scenarios per browser in Chromium and Firefox. These are separate evidence layers, not an inflated count of independent attacks.

Native fee signing omits stable wallet identifiers; it does not prove unlinkability. Shared funding origins, output graphs, fees, timing and network connections remain observable. The read-only [public audit](hauntboard/evidence/privacy-public-audit.json) records insufficient recent receipts for a two-post Esmeralda comparison. The later [room execution record](hauntboard/evidence/room-key-esmeralda-2026-10-21.json), checked October 21 UTC, covers native-stealth-funded sealed posting and recipient-key rotation. It does not complete the separate same-wallet multi-post comparison. Manifest verification flags remain false.

The October 28 source update hardened room-vault persistence: failed saves preserve prior keys, queued writes preserve different rooms, and locking cancels in-flight saves/unlocks. [Browser regression evidence](hauntboard/evidence/vault-browser.json) exercises real storage and cryptography in Chromium and Firefox. The November 2 reset deployment uses browser SDK 0.12.0 and crypto/BOR/transaction decoding 0.49.1. It supports the current encoded state and receipt APIs and bounded private-output stream/fetch scanning. The archived pre-reset transaction vector remains preserved and is rejected by the new protocol decoder. [Reset browser checks](hauntboard/evidence/reset-client-browser-2026-11-02.json) cover native wallet creation, PIN recovery and live scanning in Chromium and Firefox. The [VPS verification](hauntboard/evidence/reset-vps-deployment-2026-11-02.json) records the deployed client and a finalized native-stealth-funded General notice. Broader compatibility/privacy flags remain false; this exercised posting path does not complete the separate same-wallet public audit.

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
