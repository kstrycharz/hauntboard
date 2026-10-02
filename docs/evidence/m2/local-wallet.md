# Local wallet funding and native privacy evidence

October 2, 2026. **Local wallet funding, native transfer/memo/scan/spend and restart checks pass. M2a remains open for original receipt-template network publication/call; M2b remains open for public Esmeralda proof.**

## Runtime and isolation

`compose.localnet.yaml` runs the checksum-pinned v0.43.0 validator/indexer/wallet release archive on the pinned Ubuntu base. The archive SHA-256 is `20c3a443b16ff223bcb73c9c1ac05d3503b2675479ce4beda77b7e4d951670db`. This is the existing prerelease candidate, not a new production approval. A supported configured epoch oracle seats one independently initialized local validator. Local genesis provides the built-in funded faucet; no L1 burn or public funding is used.

The Docker network is internal, has no published ports, and uses a reserved static validator address outside its dynamic allocation range. The released transport does not resolve the initial DNS multiaddress; the checked-in profile uses the validator public key and private IPv4 seed instead. The oracle/instance manifest, chain storage, independent wallet databases, unlock configs and private job state persist in separate Docker volumes. Initialization preserves existing secrets and rejects an oracle/identity mismatch. The witness verifies indexer network byte 16, validator roster and native resource type/divisibility. The funding domain also includes the persisted instance/oracle and database inode/birth time, so replacement storage does not inherit a prior claim lease. This is controlled local-network identity checking, not a general public genesis verifier.

Chromium virtual passkeys are used only for isolated CI wallets. Private passkeys persist in the job volume to prove authenticated restart. Funding API keys expire after ten minutes and are revoked at job completion. This does not establish a human operator's production passkey/recovery lifecycle. Browser traces, screenshots and raw wallet responses are not exported.

## Observed checks

- Both independently keyed owned accounts acquired tokens through actual `accounts.create_free_test_coins` RPC calls. Bootstrap paid its fees from the claim; no separate prefunding occurred.
- Repeated funding checks and the actual one-shot `fund-wallet.mjs` job reused those funds without another claim. Canonical component identities share the ledger lease.
- The released claim RPC requires the account enum `{ "ComponentAddress": "<private configured target>" }`. The top-level response `fee` is the requested maximum; settled expenditure comes from finalized `fee_receipt.total_fees_paid`. Unsafe JSON numeric amounts are rejected rather than rounded.
- A claim with an uncertain normalization result was reconciled through account-linked finalized wallet history after correcting the event schema (`substate_id`, `XtrFaucet.take`). It was not submitted again. An earlier isolated probe rejected the incorrect string-shaped claim before recording a wallet transaction; its old uncertain ledger was retained and that profile stopped. No public request was involved.
- The sender converted revealed faucet funds into a native concealed output. Its wallet scanned the output and recovered its encrypted memo.
- A subsequent reward consumed a concealed input with zero revealed input. The actual transaction produced concealed recipient and change outputs. Its only revealed output matched the reviewed fee payment and was consumed by `PayFeeFromBucket`.
- The independent receiver scanned the reward's actual amount and encrypted memo, then spent concealed funds back to the sender. The sender scanned that resulting output.
- An unauthenticated local-indexer transaction read matched the wallet's pruned transaction. It contained neither the plaintext memo, full receiver address nor receiver account owner key. The sender account owner key was also absent in this tested transaction. This observation does not erase timing/graph/fee metadata or prove general anonymity.
- The fresh transfer sequence submitted three actual transactions. After restarting validator, indexer and both wallets, the same assertions passed with **zero additional transaction submissions**. Confirmed transaction identities remain in the private durable journal.

`local-funding.json` records the actual bootstrap/job checks. `local-private-transfer.json` records the latest post-restart verification, including zero new submissions. The source tests and observation above record the fresh sequence; the last JSON is not a second fresh spending run. Hosted CI has not run.

## Reproduce

All tooling runs in Docker. Use a new isolated Compose project for a fresh chain; do not reuse operator/public wallet volumes. The configured subnet must be free on the host.

```sh
docker compose -f compose.localnet.yaml build integration
docker compose -f compose.localnet.yaml up --build -d validator indexer sender receiver
docker compose -f compose.localnet.yaml run --rm --no-deps probe
docker compose -f compose.localnet.yaml run --rm --no-deps integration
docker compose -f compose.localnet.yaml run --rm --no-deps integration node scripts/test-local-private-transfer.mjs
docker compose -f compose.localnet.yaml restart validator indexer sender receiver
docker compose -f compose.localnet.yaml run --rm --no-deps probe
docker compose -f compose.localnet.yaml run --rm --no-deps integration node scripts/test-local-private-transfer.mjs
docker compose -f compose.localnet.yaml down
```

`down` retains private volumes. Bootstrap is for initially unused accounts with revealed native faucet-origin balances. Run it before the private transfer suite; it deliberately refuses concealed balances or mixed/unverified transaction histories. It is not a general replenishment provider. Readiness polls only safe reads; claim/transfer mutations never retry. A persistent job lock is not stolen automatically after a crash: prove the old worker is stopped, inspect/reconcile the private journal, and only then recover the test job.

The one-shot funding job defaults to `FUNDING_ACTION=inspect`; `bootstrap` and `reconcile` use the configured core policy and `/private/funding.sqlite`. Its released-wallet adapter intentionally rejects public/mainnet execution. Mainnet remains a separate treasury path. CI policy caps each local claim at one attempt, two predefined accounts per run and bounded fees. Private-transfer fees are measured by wallet dry runs, capped per stage and reserved durably before the sole submission. Test allocation and maximum spend are fixed by the source scenario, not a visitor input. Its journals contain private identifiers and never belong in public evidence.

42 funding/RPC/adapter unit tests pass; six existing engine tests remain valid. Full-wallet integration is a separate CI job with a frozen dependency install during image build, so its internal runtime network needs no package-registry access.

## Remaining gates

Next: publish the original receipt WASM through the wallet Web UI, record source/WASM/template linkage, create/call/query it and verify local inclusion. Complete the field-by-field local privacy/recovery report and close M2a only after that proof. Then adapt identity/eligibility/provenance for the protected public Esmeralda workflow and prepare exact faucet-only targets/fees/budget for review. Public deployment and live capability claims continue to require M2b. Full room-template invariants and application integration belong to subsequent milestones.
