# M2a local capability acceptance

Checked October 2, 2026. **M2a passes locally; M2b public Esmeralda proof remains open.**

The pinned 0.43.0 wallet/validator/indexer and template library 0.33.0 have now executed the original receipt spike publication through the actual Wallet Web UI, creation, and `get_receipt`. Publication, creation and read transactions were accepted. The expected synthetic digest and chain epoch returned. The independent indexer returned a verified component with the published template address. Original, rebuilt and UI-uploaded WASM have SHA-256 `ba6533705ef822fa35cb097567e8bde10c20511170fd7e46887aff1ddad351a9`.

Validator, indexer and both wallets were restarted, then the same persisted publication/create/read transaction IDs were checked again. The durable journal reused the accepted operations. No replacement publication, create or call was submitted during that run. Private transaction and wallet identifiers remain in the isolated job volume.

The six receipt-spike engine tests also pass: receipt roundtrip, malformed digest rejection, faucet-funded fee payment, repeated faucet-claim rejection, independent receiver funding/spend, and concealed transfer/change/receiver spend. Earlier actual-wallet private transfer and restart evidence remains in `local-private-transfer.json` and `local-wallet.md`. Those tests use local faucet-origin funds only.

The application room template additionally passes four engine tests covering signer access rules, public reads, immutable idempotent receipts, capacity, closing, malformed inputs, future closing configuration, and the exact closing epoch boundary. Its WASM has been published through the local Wallet UI with byte matching. Full application integration has also passed against the isolated chain: actual passkey authentication, browser JWE, room creation, receipt anchoring, local decryption, private reward and independent recipient scanning. Reload and clean-browser recovery passed; recovery submitted zero new transactions. See `local-app-journey.json`. Public beta acceptance remains separate.

This acceptance unlocks M3–M5 local integration under the plan. It does not authorize public spending, replace M2b, establish public faucet availability, or satisfy human comprehension and release trials. Public operations remain faucet-only and prepared for review.
