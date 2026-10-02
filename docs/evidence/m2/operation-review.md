# M2 operations worksheet — prepared, not executable approval

October 2, 2026. Owner instruction: **keep funding faucet-only; prepare operations for review**. A fresh `wallet-preflight.json` read at 16:47:39 UTC (12:47:39 p.m. EDT) found the public faucet empty from both wallets. No account was created, faucet claimed, template published or transfer submitted. No alternate source, L1 burn, rental or purchase is authorized.

The [current wallet guide](https://ootle.tari.com/guides/setup-a-wallet/) says public-testnet faucets start empty and remain unavailable until funded. A recheck can resolve availability; it cannot establish a spend budget. Do not add a recurring monitor unless requested.

## Authentication evidence and remaining setup

`wallet-auth.json` records actual v0.43.0 / Esmeralda / byte 38 observations. Ten checks passed using Chromium's virtual authenticator and an unfunded tmpfs wallet: unauthenticated reads and anonymous login rejected; passkey enrollment succeeded; second enrollment rejected; `accounts:read` key read accounts; ungranted settings read and key management rejected; revocation took effect; a short-lived key worked before its deadline and failed afterward. Authentication error codes are retained without raw messages or credentials. The anonymous-login rejection is RPC 500, not a successful auth session; upstream error classification should be considered in the adapter.

Exact enrollment RPC methods are `webauthn.reg_start` and `webauthn.reg_finish`; the latter receives the browser's WebAuthn credential. Admin enrollment yields a JWT used in memory for `auth.create_api_key`. The request uses `permissions: ["accounts:read"]`, `confirm_admin: false` and an integer Unix expiry. Present the returned API key directly as a bearer token. Revoke with `auth.revoke_api_key` and its integer key ID. These tested permission strings differ from the older examples in the [official API-key guide](https://ootle.tari.com/guides/agent-api-keys/).

The probe allows no account, faucet, transfer, signing, publication, seed-export or wallet-setting mutation RPC. Its admin access is only for enrollment/key-lifecycle verification. No secrets, screenshots or traces are retained. The browser maps its `http://localhost:5100` origin to the isolated wallet service for the test; no host wallet port is opened. Its virtual passkey and wallet disappear when the test container and tmpfs wallet are removed. This is not the production authentication setup and proves neither persistent restart nor human hardware-passkey recovery.

Reproduce with Docker; the force-recreate affects **only the disposable auth wallet**, never sender/receiver data:

```sh
docker compose -f compose.spike.yaml -f compose.auth-spike.yaml up -d --force-recreate auth-wallet
docker compose -f compose.spike.yaml -f compose.auth-spike.yaml run --rm auth-probe
docker compose -f compose.spike.yaml -f compose.auth-spike.yaml stop auth-wallet
```

Before funds: create separate persistent authenticated sender and receiver wallets, enroll the operator's passkeys, issue narrowly scoped expiring service keys, prove restart/read/revoke, and keep RPC internal. Never fund the `--auth none` preflight or the disposable virtual-passkey wallet.

## Transaction sequence to prepare after the prerequisites exist

| Step | Request / operation | Required private inputs and acceptance evidence |
|---|---|---|
| Independent accounts | `accounts.create` with `account_name`, `is_default`, `key_index` | Separate wallet seeds and same-network addresses; retain private material only in secret storage; prove independent control later by receiver spend |
| Faucet availability / claim | Read `accounts.get_faucet_balance`; only then prepare `accounts.create_free_test_coins` with `account`, `max_fee` | Non-empty faucet, authenticated persistent target, exact approved fee cap; reconcile the returned transaction ID and finalized result |
| Private-input preparation | Inspect actual funded output types; select supported released native conversion if required | Faucet funding alone does not prove concealed inputs; verify input origin, output ownership and fees |
| Native transfer dry run | `accounts.stealth_transfer` with `owner_account`, `fee_params`, `input_selection`, `resource_address`, `transfers`, `max_fee`, `dry_run: true` | Positive integer `blinded_output_amount`; `revealed_output_amount` zero; verified recipient; explicit concealed change/fee policy; memo below 120 UTF-8 bytes; disable sender-address attachment; no room/envelope reference |
| Deliberate submit | Same reviewed transfer with `dry_run: false`, once | Exact amount, recipient, native resource, fee estimate and total cap; persist intent before submission; RPC returns a transaction ID, not confirmation |
| Reconcile | `transactions.get`, result/wait endpoints and independent public-indexer inspection | Finalized success or rejection; treat timeout/unknown response as reconciliation; never blind retry |
| Receiver detection / spend | Released receiver scan/recovery and one bounded spend | Recovered encrypted memo and spendable privately owned output; independently finalized receiver spend |
| Original template | Wallet Web UI publication, followed by create/call/read | Optimize the actual WASM; quote publication fee; record original/optimized SHA-256, published template address and actual transaction receipts; include engine positive/negative tests |
| Public observer | Read transaction/substate from public indexer | Field-by-field inspection of hidden values/ownership/memo, visible fees/structure/signatures/timing and any correlations; publish only sanitized public evidence |

The request field inventory comes from `clients/wallet_daemon_client/src/types.rs` and RPC dispatch in `applications/tari_walletd/src/server.rs`, checked against the supplied read-only snapshot. The [v0.43.0 types](https://github.com/tari-project/tari-ootle/blob/v0.43.0/clients/wallet_daemon_client/src/types.rs) govern the final runnable payload. Fee/input/memo enum encodings, denomination, required mutation scopes and finality semantics still require released-type/runtime validation. This worksheet intentionally contains no invented address, denomination, transaction ID, amount or fee quote.

## Review packet still required before any funded operation

Record the exact Esmeralda sender/receiver, native resource, independently verified addresses, faucet-funded balances, token denomination/integer conversion, each proposed operation and its fee quote, per-operation and aggregate base-unit caps, expiry, optimized WASM checksum, and recovery/reconciliation procedure in ignored private working material. Publish a sanitized description of the bounded operation; never expose private recipient/amount data in public evidence. Obtain the owner's exact-target/budget authorization on that concrete packet. These fields are **pending** because no funds or accounts exist; this document does not grant spending permission.

Gate remains **not passed**. Human/persistent authentication, funded inputs, actual native transfer/memo/change/fees, receiver recovery/spend, engine tests, publication/call and public-field inspection remain open. M3–M7 remain gated. PM-00 human trials may proceed independently. Localnet/recorded demonstration remains a proposed contingency requiring a scope decision.
