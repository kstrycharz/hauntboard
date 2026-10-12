# Hauntboard implementation map

Locate the `hauntbox` repository by its `AGENTS.md` and `hauntboard/` directory; do not assume a fixed absolute checkout path. Read `hauntboard/docs/tari-l2-architecture.md` for the complete app documentation when available. This reference preserves the important integration decisions for use outside that checkout.

The current app is the public schema-4 Hauntboard. Legacy Hauntbox stores encrypted stories off chain with digest receipts; historical schema-3 Hauntboard stores sealed envelopes on chain. Do not mix their product or privacy claims.

| Concern | Repository entry point |
|---|---|
| Public contract | `hauntboard/template-public/src/lib.rs` and `Cargo.toml` |
| State decoding and companion RPC | `hauntboard/lib/state.mjs`, `lib/chain.mjs` |
| Durable submission | `hauntboard/lib/relay.mjs`, `server.mjs` |
| Local wallet lifecycle | `hauntboard/web/browser-wallet.mjs` |
| Native seed/recovery adapter | `hauntboard/wallet-recovery/src/lib.rs` |
| Fee proofs/instructions | `hauntboard/web/stealth-fee.mjs` |
| Coin scanning/change | `hauntboard/web/output-ledger.mjs` |
| Native transaction identity | `hauntboard/web/transaction-identity.mjs`, `transaction-identity/` |
| SDK bundling | `hauntboard/browser-sdk/package.json`, `src.mjs` |
| Network/reset identity | `hauntboard/web/network-profile.mjs` |
| Release and evidence | `hauntboard/evidence/`, `deploy/`, `docs/smart-contract-review.md` |

Source pins reviewed October 8, 2026: template lib 0.34.0; engine/test tooling 0.45.0; browser Ootle/indexer/secret-key-wallet 0.7.0; browser WASM 0.43.0; recovery common types 6.0.1 and wallet crypto 0.45.0. Verify manifests before changing code. These are not upstream latest-version claims.

Contract state has board/thread/page roles, 128 threads per board, 16 posts per page, 2,048 posts per thread and 4,096 payload bytes. No author key is stored. Public thread mode is 0. Page writes require the owning thread component. Post nonce page hints occupy the first four little-endian bytes; remaining bytes are random. Exact retries compare parent and bytes; stale page state requires refreshed review.

The stealth fee path verifies ownership, consumes a native UTXO, uses one-time authorization and a fresh fee signer, and omits the named account input/persistent owner signature. Move the SDK-hydrated fee program into fee instructions before signing; fee/main workspaces differ. Quarantine change to avoid automatically linking consecutive posts. Full reviewed fee allowance is paid on this path.

Native CipherSeed v2 phrases restore owner/view keys with the original optional seed passphrase and account index. New wallets use a six-digit local PIN; old password records remain supported. Total account holdings can exceed posting-ready funds. Revealed funds preparation and faucet claims are spending/funding operations, not automatic side effects of recovery.

Localnet byte 16 and Esmeralda byte 38 are app-supported profiles; reset identity is pinned separately. The browser trusts indexer verified responses without independently checking consensus. Seeds and credentials remain local. Public text, fees, output graphs, timing and connections remain observable.

Use the newest dated evidence for deployment status: older READMEs and release candidates retain obsolete pending-gate wording. GUI deployment/asset checks do not establish native public posting privacy. Preserve existing user edits, wallets and volumes; run toolchains in containers and keep sibling Tari snapshots read-only.
