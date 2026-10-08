# Public content and poster privacy

Owner clarification, October 6, 2026: all first-version threads should be publicly readable, in the style of an imageboard. The private property is the poster's identity, not the message body. Existing sealed threads are a different feature and do not satisfy this requirement.

## Current exposure

- The template stores `CallerContext::transaction_signer_public_key()` in post and thread author fields. Retry lookup uses that signer too. Merely hiding the author in the UI leaves it on chain.
- The browser signs post transactions using its persistent wallet signer and pays fees from its owned account component. Removing the author field alone leaves transaction and fee-account linkage to inspect.
- AES-256-GCM encrypts optional sealed-thread content in the browser. It does not hide a post transaction's signer, account inputs, network connection or timing. Public posts need readable content rather than this encryption.
- The relay/indexer network path can observe connections. No Tor/private transport, traffic mixing or operator anonymity proof exists.

Tari distinguishes confidential amounts and stealth outputs from public-component interactions. Its documentation explicitly lists caller-signature and transaction-graph leakage: https://ootle.tari.com/concepts/privacy-in-applications/ and https://ootle.tari.com/concepts/privacy/. Do not infer anonymous application calls from the token being a stealth resource.

## Candidate paths to verify

1. Relay-sponsored posting: the participant submits public post content to a relay; the relay signs and pays the chain fee. Public chain observers see the relay instead of a participant wallet. This changes the existing signed-envelope-only relay trust model, introduces operator fee/spam budgets and censorship exposure, and leaves IP/timing visible to the relay. It is not complete anonymity. Adding Tor access and avoiding identifying logs would address some operator exposure, with separate traffic-correlation limits.
2. Direct posting with fresh transaction keys and privately funded fees: investigate the maintained Tari SDK's supported stealth input/spend/authorization flow. A fresh signer alone is insufficient if it touches the same persistent fee account or reveals a funding link. This path is unproven in this build and needs real Esmeralda transaction/indexer inspection. Do not substitute invented cryptography or advertise unlinkability without evidence.

## Release conditions

- Public thread bodies and titles readable without invitation keys; no mandatory stable display name, author identity or receive address in post payloads.
- A new contract candidate that does not retain participant signer identity; redesign retry handling and chain/client tests together rather than just blanking display fields.
- Measure signatures, fee inputs, account calls, funding paths, component state/events, indexer responses and relay logs for multi-post linkability.
- Define protection separately against public chain observers, indexer/relay operators and network observers. State residual timing/content correlation, censorship and denial-of-service limits.
- Keep the existing localnet demonstration and immutable board history available as development evidence, while clearly rejecting its use as anonymous-posting release evidence. Do not publish the current candidate to satisfy this changed requirement.

## Implemented native path and measured scope

The selected investigation now uses Tari-native stealth fee authorization rather than relay-sponsored posting. `web/stealth-fee.mjs` uses maintained SDK 0.7.0 / WASM 0.43.0 APIs for output generation, range/balance proofs, view-key ownership discovery and one-time spend signatures. It omits the persistent account-key signature (`mustSignWithAccountKey:false`), uses a fresh fee-receiver signer, and moves the hydrated native fee program before generating any transaction signatures. No named account is a posting input. Native stealth fee overpayment is non-refundable, so fee estimation subtracts the reported overcharge before applying the reviewed ceiling/buffer.

`template-public/` is a separate schema-4 contract using template library 0.34.0 and released engine 0.45.0. Its public state contains no author keys and rejects sealed thread modes. Random nonce plus exact parent/payload replaces signer-bound logical retries. The old templates/boards remain intact.

The isolated localnet confirmed a real public posting transaction funded by a native stealth output. Independent indexer transaction inspection found no persistent owner key or named wallet account input. Chromium and Firefox tests verify incoming-output discovery, public posting, readable no-wallet access, no stored author, encrypted coin-state recovery, and change quarantine. Evidence: `evidence/poster-privacy.json`, `evidence/public-wallet-chromium.json`, `evidence/public-wallet-firefox.json`, and `evidence/public-contract-engine.json`. These are local evidence: the network uses 0.43.0, while the separate native contract engine tests use 0.45.0.

This removes a particular stable wallet-key/account exposure. It does not hide funding ancestry, fees, spent-output graph, timing, public message clues or network connections. A fresh spend signature is not a proof that posts are unlinkable. Change is quarantined and is never automatically selected for the next post; the browser currently has no change-consolidation flow. Incoming funds are discovered from a confirmed transaction ID, not by a full wallet scanner. Encrypted backups retain a bounded 32-output ledger and known spent/quarantined states. Unknown submissions retain exact signed bytes and must reconcile.

Public readiness and deployment validation require schema 4, `posterPrivacy:stealth-fee-v1`, and separate measured `posterPrivacyVerified`/compatibility gates. Both remain false in the example manifest. No Esmeralda fee spend, public contract publication, VPS deployment or anonymity-set proof has been performed. This native path supersedes the assumption that optional encrypted threads are the requested privacy model.
