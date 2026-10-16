# Public content and poster privacy

Current review: October 15, 2026. This replaces the October 6 investigation notes, which mixed historical author-retaining templates with the later schema-4 implementation. Historical evidence remains in Git and the evidence directory.

Hauntboard's default remains a publicly readable message board. The schema-4 contract stores no author field. Native stealth fee posting omits the persistent wallet owner signature and named account input. The browser uses official Tari SDK/WASM proofs and one-time authorization, adds a fresh fee signer and quarantines posting change.

These properties remove particular stable identifiers. **They do not prove transaction unlinkability.** Input ancestry, shared funding origins, spent-output graphs, public fees, timing, text and network connections can correlate posts. Outputs created by one conversion transaction share that origin even when their one-time spend keys differ.

Optional sealed bodies are now implemented in the current source as version-2 browser envelopes inside existing schema-4 mode-0 payloads. Titles/categories remain public; bodies are encrypted with AES-256-GCM. This is separate from historical schema-3 sealed mode. The contract is payload-agnostic and does not enforce encryption, membership or author identity. A compatible website release and live funded verification are still required before calling the new sealed flow demonstrated on Esmeralda.

## Evidence and reproduction

- [Threat model and exact claims](docs/privacy-threat-model.md)
- [Reproducible tests, public audit and three-minute walkthrough](docs/privacy-verification.md)
- [Contest submission draft](docs/contest-submission.md)
- [Local Node report](evidence/privacy-tests.json) and [TAP output](evidence/privacy-tests.tap)
- [Native engine report](evidence/public-contract-engine.json)
- [Chromium/Firefox browser report](evidence/gui-regression.json)
- [Read-only Esmeralda audit](evidence/privacy-public-audit.json)

The local native fee tests create two synthetic outputs for one real SDK wallet and inspect the resulting signed transactions and spend keys. This is cryptographic implementation evidence using synthetic provider rows. Browser fixtures exercise actual WebCrypto/key storage with simulated transaction execution. Native engine tests exercise the actual Rust contract. These evidence layers are identified separately from public-chain receipts.

The October 15 public audit found insufficient Hauntboard posting receipts in the latest 100 provider transactions. It does not establish that no Hauntboard posts exist. Known public post IDs can be supplied to inspect multiple finalized transactions. Full funding-ancestry inspection and an anonymity-set argument remain open. The `compatibilityVerified` and `posterPrivacyVerified` manifest flags remain false.

Earlier localnet evidence in `evidence/poster-privacy.json` records one real stealth-funded local post. Older public deployment and funding receipts establish those specific operations; they do not certify the new sealed flow or strong multi-post privacy. Use the current [architecture](docs/tari-l2-architecture.md) and dated evidence for deployment status.

Protocol context: Tari's [privacy documentation](https://ootle.tari.com/concepts/privacy/) and [application privacy patterns](https://ootle.tari.com/concepts/privacy-in-applications/) distinguish hidden ownership/amounts from graph, fee and caller-identity leakage.
