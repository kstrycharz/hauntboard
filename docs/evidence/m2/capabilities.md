# M2 capability gate — unfunded preflight

Inspected October 2, 2026. **Gate not passed.** The local mock is complete; no actual stealth transfer, recipient spend, template publication or live receipt has been demonstrated.

| Capability | Result / evidence |
|---|---|
| Published artifact research | Wallet v0.43.0 asset, SHA-256, prerelease status, crate/npm versions, Rust toolchain and source hashes in `release-research.json` |
| Dedicated container wallet runtime | Checksum-verified binary runs on pinned Ubuntu base, non-root UID 10001; OpenSSL and libdbus runtime dependencies resolved |
| Headless startup / restart | Separate sender/receiver data and unlock volumes; both report 0.43.0 / Esmeralda / network byte 38 after restart, without Windows keyring |
| Public indexer identity | Both `https://ootle-indexer-{a,b}.tari.com/network` reads return HTTP 200, Esmeralda / 38 |
| Actual wallet indexer connection | Explicit indexer override corrects a localhost default; current epoch read succeeds |
| Read scopes | Unauthenticated account read rejected (401); read-only in-memory session permits account, substate and settings reads |
| Funding | Faucet confirmed empty; each wallet has zero accounts; no funds acquired or spent |
| Original template compile | `spikes/receipt-template`, locked 0.33.0 library, Rust 1.97.1; original 89,766-byte `receipt-spike.wasm` |
| Independent keys / funded private inputs | Not demonstrated; separate runtime/storage is not proof of independently controlled spendable outputs |
| Native concealed transfer / memo / change / fees | Not executed |
| Receiver detection / recovery / spend | Not executed |
| Public observer transaction/substate inspection | Not executed; no fabricated transaction IDs |
| Engine test harness / publication / call / receipt | Not executed; compile alone is not engine or network compatibility |
| WebAuthn / scoped API keys / expiry / revoke | Ten unfunded disposable virtual-passkey checks pass in `wallet-auth.json`; persistent operator setup/restart remains unverified |
| Final go/no-go ADR | Pending; see `docs/adr/001-network-wallet-versions.md` |

The wallet preflight files intentionally retain only allowlisted public/aggregate fields. Token/password/seed/recipient/amount fields are not exported. `wallet-preflight.json` and `wallet-restart.json` are actual runtime observations. `release-research.json` is registry/source/network research, not transfer proof.

## Exact read requests

On the private Docker network, to each wallet's `/json_rpc` endpoint:

```json
{"jsonrpc":"2.0","id":1,"method":"wallet.get_info","params":{}}
{"jsonrpc":"2.0","id":1,"method":"auth.request","params":{"permissions":[{"Accounts":["Read",null]},{"Substates":"Read"},{"Settings":"Read"}],"credentials":"None"}}
{"jsonrpc":"2.0","id":1,"method":"accounts.list","params":{"offset":0,"limit":10}}
{"jsonrpc":"2.0","id":1,"method":"accounts.get_faucet_balance","params":{}}
{"jsonrpc":"2.0","id":1,"method":"settings.get","params":{}}
```

The last three reads use the returned bearer token only in memory. The account read is also attempted without a token to verify rejection. The script does not allow account creation, funding, signing, seed export, API-key creation, template publication or transfer methods. Public evidence reports faucet availability as `empty` rather than exporting balance data.

## Reproduction and boundaries

```sh
docker compose --profile tools run --rm node-tools node scripts/research-tari.mjs
docker compose --profile tools run --rm node-tools node scripts/init-spike-secrets.mjs
docker compose -f compose.spike.yaml up -d --build sender receiver
docker compose -f compose.spike.yaml run --rm probe
docker compose -f compose.spike.yaml restart sender receiver
docker compose -f compose.spike.yaml run --rm probe node scripts/probe-wallets.mjs --post-restart
docker compose --profile tools run --rm rust-spike
docker compose -f compose.spike.yaml down
```

RPC readiness can lag process startup; only safe reads may be repeated. These commands publish no wallet ports. The probe network is distinct from the app network, although it allows outbound access to the public indexer. Docker logging is disabled for research wallets; their ignored/named runtime files may still contain private diagnostics. No Docker socket is mounted. Do not fund or expose this auth-disabled configuration as a deployed service.

Compile probe SHA-256: `ba6533705ef822fa35cb097567e8bde10c20511170fd7e46887aff1ddad351a9`. The compiled module has not been through the wallet's publishing optimizer or engine validation. Source/compiled-byte linkage to a deployed template remains a release blocker.

## Findings fixed during the probe

- Missing libdbus was added to the runtime image after `ldd` identified it.
- Root-owned host secret files were unreadable by UID 10001. A root init service with no network copies secrets into separately owned unlock volumes; wallet processes remain non-root.
- The release's secret config expects serialized bytes. An initial upstream error echoed unused unlock material in an ignored diagnostic; it was replaced before wallet initialization. Raw startup/RPC errors are not public evidence. Do not reuse that old unused material.
- The candidate chose a localhost indexer when started with the secret config. Explicitly pinning the intended public endpoint restored substate/faucet/epoch reads.
- Permission names from earlier docs are stale for this release. The read-only structured CRUD permissions were verified against released source and actual RPC behavior.
- Fixed-array ABI arguments fail macro expansion. The bounded-vector probe compiles; the M3 ABI must include engine-level positive/negative tests.

## Next ready package

Continue **INT-01** using the [prepared operation worksheet](operation-review.md). The owner confirmed faucet-only funding on October 2. A fresh read at 16:47:39 UTC found the faucet empty from both zero-account wallets. Ten disposable authentication checks now pass, including scope enforcement, API-key expiry and revoke; human passkey and persistent authenticated restart remain unverified. Prepare authenticated persistent wallets, independent test keys/accounts, exact native-transfer/publication operations, fee estimates and a bounded owner-approved testnet budget before funds move. An L1 burn or purchased funding is outside scope. Keep the full M2 transfer/public inspection/receiver spend checklist open.

Funding-plan amendment: [docs/funding-plan.md](../../funding-plan.md) makes FUND-01/TEST-01 the next work, with local faucet-funded tests and separate M2a/M2b gates. The earlier empty result is a balance observation; no claim was attempted. Deterministic work can proceed now and M3–M5 integration after M2a; public release still requires M2b. Both gates remain open. Existing observations are unchanged by this planning revision.
