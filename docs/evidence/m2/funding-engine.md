# FUND-01 / TEST-01 implementation evidence

October 2, 2026. **Funding core and in-process engine layer implemented; both work packages remain in progress. M2a/M2b are not passed.**

This records the earlier core/engine implementation. Subsequent [local wallet evidence](local-wallet.md) adds the released-wallet adapter/job and actual isolated faucet/private transfer/spend/restart proof, with 42 total funding/RPC/adapter tests. Receipt network publication/call and M2a review remain open; M2b public proof remains open.

## Delivered

- `scripts/lib/funding.mjs`: checked integer policy/env configuration, mainnet faucet rejection, SQLite funding ledger with immediate transactions, per-account claims shared across purposes, per-run/daily fee reservations, fixed-claim credit caps, confirmed-balance verification and explicit reconciliation. An unknown claim never auto-resubmits. Unresolved reservations still count after day rollover. Credentials/identity/resource/provenance failures are failures, not faucet outages.
- `scripts/lib/wallet-rpc.mjs`: funding-only RPC allowlist, secret-file bearer credentials, exact configured claim target/fee binding, bounded safe-read retries, no claim retry, redirect rejection, and sanitized errors. It is a transport boundary, not a complete released-wallet funding adapter.
- `scripts/check-funding-config.mjs`: read-only environment validation with value-free output; automation defaults off. Select fee/reward/CI target through FUNDING_PURPOSE. Native denomination and fee caps remain deployment-specific.
- `tests/funding`: 34 passing tests exercising positive bootstrap, reuse, insufficient/missing faucet, claim eligibility, independent ledger connections, cap enforcement, persistence/reopen, unknown outcomes, stopped-worker recovery, different transaction IDs, provenance checks, auth errors, mainnet prohibition and RPC boundaries. These use fault adapters and synthetic amounts; they are not real wallet claims.
- `spikes/receipt-template/tests/engine.rs`: six passing real-engine tests using pinned `tari_template_test_tooling` 0.43.0 and template library 0.33.0. Engine dependencies are resolved in Cargo.lock. Dedicated Compose `engine-tests` service and CI job require no public faucet.

## Engine observations

1. The actual built-in harness faucet funds a new account; its native balance matches the harness's documented initial balance.
2. A zero-balance account claims funds and pays fees in the same fee intent. Fees are enabled for this test; remaining balance equals the claim minus actual charged fees. No external prefunding is used.
3. A second claim for the same account is rejected and does not change its balance.
4. Independently keyed accounts receive and spend native faucet-origin funds; a wrong signer is rejected.
5. Native revealed faucet funds are converted into a concealed input using Tari's official helpers, then spent into concealed recipient and change outputs. The transfer has zero revealed input and no revealed output. The sender cannot spend the receiver's output; the independent receiver can. This test uses real engine proof verification, not wallet RPC.
6. The original receipt spike instantiates/returns the digest and epoch; a short digest is rejected by the engine.

The engine fee-bootstrap test is separate from the concealed-transfer test. The latter runs with harness fees disabled and uses synthetic encrypted output data from official helpers. It proves neither memo recovery nor production address scanning/stealth-address construction; do not label explicit test spend keys as wallet-level hidden ownership proof. No synthetic transaction IDs/addresses/values are exported as live evidence.

## Reproduce

```sh
docker compose --profile tools run --rm node-tools pnpm test:funding
docker compose --profile engine run --rm engine-tests
docker compose --profile engine run --rm engine-tests cargo fmt --check
```

The first engine invocation builds dependencies and compiles WASM. Named `engine_test_target` and `rust_registry` volumes retain caches. Tests initialize their own in-memory engine/faucet state; no public wallet/indexer is contacted. Rustfmt is installed in the pinned Rust container only. Node's built-in SQLite is experimental in the pinned Node 22 runtime; it is used for this single-host internal funding job, not as a replacement for the planned PostgreSQL application datastore.

Other verified checks: seven existing frontend unit tests, TypeScript, Prettier, Vite production build, Rust formatting and Compose validation. Frontend behavior did not change, so the earlier 22-browser-test evidence was not regenerated. The new CI engine job was exercised locally through its Compose command; hosted CI has not run.

## Boundaries and remaining work

The funding service consumes a verified normalized adapter. Runtime account ownership, genesis/network-instance identity, resource metadata, spendable-input classification, faucet eligibility and faucet-origin provenance must be established by that adapter; setting strings from config is not proof. Reconciliation must use the same account-linked transaction and finalized wallet result; raw HTTP success is insufficient. No real RPC claim has been submitted by this code.

Keep ledger files under ignored private data directories with restricted permissions. Wallet aliases must be canonicalized to component identity before constructing the funding policy; otherwise different aliases cannot be assumed to share a claim lease. Stopped-worker lease recovery requires explicit operational proof the old worker is stopped. Do not expose these internal methods through the browser or public API. The core is ready for adapter integration, not production payout activation.

Next TEST-01 work: released local-network bootstrap with a funded genesis, persistent independent authenticated wallet containers, wallet-native private transfer/memo/scan/spend, original template publication/call and restart tests. The current engine profile is not a full validator/indexer/wallet network. Next FUND-01 work: implement normalized released-wallet adapter and CLI/job wiring, verified environment secrets/config and runtime zero-balance claim/recovery evidence. FUND-02/public claims remain subject to the configured faucet-only target/fee budget. Existing auth-disabled public preflight stays unfunded.
