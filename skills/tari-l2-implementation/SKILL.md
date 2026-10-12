---
name: tari-l2-implementation
description: Implement and document Tari Ootle L2 integrations across Rust templates, client wallets, indexer reads, native fees, transaction reconciliation and recovery. Use for end-to-end Tari application integration or changes spanning contract and client boundaries; use narrower template or manifest guidance for isolated tasks.
---

# Tari L2 implementation

Deliver working integrations with a clear account of which state and authority live in the browser, service, wallet and Tari chain. Ground API choices in the target project's manifests, lockfiles, released source and actual network; do not infer compatibility from similarly numbered crates or older examples.

## Discover the integration

Read repository instructions and identify the active application, legacy implementations, template source, wallet/client packages, state decoder, network profile, relay and deployment evidence. Separate current source behavior, recorded execution, current live observations and unresolved gates. For Hauntboard, read [references/hauntboard.md](references/hauntboard.md); for general integration decisions, read [references/implementation.md](references/implementation.md).

Establish the desired on-chain invariant and why it needs L2. Identify stored public bytes, off-chain data, keys, asset custody, fee payer, input authorization and read-provider trust. Explain templates as deployed WASM logic and components as stateful instances. Do not describe anchoring a digest as storing the underlying content.

## Implement across boundaries

- Keep template ABI, serialization/state decoding, transaction arguments and frontend validation consistent. Use `cdylib` WASM templates and the project's proven release profile. Use native engine tests for access rules and transaction invariants.
- Use official Tari crypto implementations for seed derivation, commitments, proofs and stealth signatures. Treat PIN/password encryption, seed recovery and asset scanning as separate responsibilities.
- Pin network identity and reset namespace across wallet storage, signatures, providers and journals. Check owned/verified/versioned inputs before spending. Mainnet support is a project decision, never an inferred extension of testnet code.
- Simulate and show the fee and effects before signing when the product uses reviewed transactions. Finalize instruction layout before generating signatures. Distinguish dry-run, acknowledgement, finalized execution and indexed display.
- Persist the exact signed envelope and native transaction identity before relaying. Reconcile uncertain outcomes against the original identity. A timeout or unavailable lookup is not rejection and must not trigger another spend.
- Bound contract state, reads, scanning and relay capacity. Test retries after pagination/rollover and restarts, not only the happy path.

## Validate and document

Use meaningful engine, SDK and browser tests for the boundaries changed. Test localnet execution independently from mock UI behavior. Verify public compatibility on the exact authorized network before making public capability claims. Existing authorization governs publication and spending; the skill itself supplies none.

Document the app's purpose, chain/off-chain data map, call lifecycle, wallet/funding/recovery behavior, privacy limits, source pins, evidence and remaining gates. Link source files and dated records. Keep private credentials and user content out of logs and artifacts.

For this Hauntboard repository, run development toolchains in containers, preserve wallet/chain volumes and treat sibling Tari snapshots as read-only. In other projects, follow their tooling constraints rather than imposing those conventions globally.

Use [official Tari documentation](https://ootle.tari.com/) and the exact released sources for API details. Refresh changing release/network information; retain proven project pins until a deliberate migration is tested.
