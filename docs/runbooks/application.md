# Application and wallet setup

October 2, 2026. Production-built Esmeralda preview: http://localhost:8180/submit. Full local-chain application: http://localhost:5173/. The optional wallet-address input is visible on the submission form; **Get a wallet** provides participant and operator paths.

## Participant

Run `docker compose -f compose.participant.yaml up --build -d` on the participant's own computer. Open http://localhost:5103 in a regular browser, register a native Tari wallet passkey and create an account. Copy Account details → Address into the submission form. The wallet persists its own keys in its named volumes; Hauntbox accepts only its receive address. Receiving an optional reward does not require depositing funds with Hauntbox. The companion is Esmeralda testnet only.

Wallet passkey dialogs depend on the browser and operating system. A `NotAllowedError` can represent cancellation, timeout or an unavailable authenticator; it does not prove a single cause. If the embedded browser cannot complete the prompt, open the same localhost URL in a regular browser. Keep the hostname consistent with its configured WebAuthn origin.

## Operator

Receipt wallet: http://localhost:5101. Reward wallet: http://localhost:5102. Register real passkeys in both native wallet UIs and create separate accounts. Follow the Esmeralda runbook for Docker startup and private unlock backups. Wallet account generation and application curator registration are separate operations.

The application curator uses its own passkey at http://localhost:8180. Its first registration requires the private bootstrap code in the `hauntbox-production_production_secrets` volume. The owner may retrieve that code privately with `docker compose -f compose.production.yaml exec api cat /run/hauntbox/bootstrap-code`. Do not paste it into a public issue, recording or chat. Register it only at the intended app origin; domain migration requires an explicit credential migration plan.

A curator creates a room encryption key in the browser, exports its encrypted recovery file and stores the separate recovery code privately. The application verifies an actual recovery/decryption roundtrip before submitting room creation. Neither wallet backups nor the app bootstrap code replace room-key recovery.

## Reviewable public connection

`compose.production.wallets.yaml` connects private API/worker services to the existing beta wallet network. It is prepared, not activated. Create ignored `secrets/operator/wallet-settings.json` only after verifying public deployment identity and publishing the reviewed template. Its fields are `network` (esmeralda), `instance` (verified deployment witness), `template` (64 lowercase hex digits), `indexerUrl` (maintained Tari indexer), and separate `receipt`/`reward` objects with `account`, `rpcUrl` and `tokenFile`. Internal RPC URLs are `http://receipt-wallet:5101/json_rpc` and `http://reward-wallet:5102/json_rpc`. Token files belong under `/operator`, mounted read-only. Preserve strict private filesystem permissions and node runtime readability.

Obtain limited-lived scoped API keys through authenticated native wallet administration. Required reads are wallet/network info, balances/faucet balance and transaction lookup; receipt execution needs measured dry manifest plus instruction submission, reward execution needs native stealth transfer. Do not grant template publication, arbitrary key export or administration to the running app. Do not expose these credentials in the browser or public reverse proxy.

The overlay keeps all mutation flags false and the worker behind the `live-worker` profile. It does not perform public faucet claims. First complete M2b with exact public targets and reviewed fee limits using faucet-origin funds; verify the template and deployment witness, then review an explicit activation configuration. Matching network name/byte alone cannot detect a public reset. Mainnet needs a separately reviewed treasury provider and budget rather than faucet automation.

`compose.public.yaml` prepares HTTPS deployment with owner-approved `APP_DOMAIN`, DNS and infrastructure. It has not been launched. It exposes only the web proxy on 80/443; wallet/database listeners stay private. Keep registration origins and cookies consistent with the final HTTPS domain.

## Recovery and controls

Private backups must preserve PostgreSQL plus the matching intent key, both wallets' data plus their matching unlock material, and separate curator recovery material. The encrypted application database/intent-key restore drill passes for local and production-preview databases; see [backup/restore instructions](backup-restore.md). Wallet recovery, off-host custody and rollback drills remain required before public release; named-volume persistence alone is not a backup.

Keep submissions, anchoring and payouts off during maintenance. Do not automatically resubmit an unknown payment. Preserve its job and fee reservation, inspect the original transaction and wallet state privately, and reconcile before allowing any replacement operation. `/health/ready` checks the database; use `/api/funding/status` and authenticated funding details to assess wallet readiness separately.
