# Production Esmeralda configuration

October 2, 2026. Prepared wallet infrastructure, not a completed live application or approved release. Production is the intended Esmeralda beta; mainnet is outside scope. M2a receipt publication/call, M2b public proof, application backend and later release gates remain open.

Use Tari's maintained `https://ootle-indexer-a.tari.com/` as the primary indexer and `https://ootle-indexer-b.tari.com/` as the secondary. The upstream wallet source lists these Esmeralda defaults; the [official wallet guide](https://ootle.tari.com/guides/setup-a-wallet/) explains the public-indexer connection. We do not run a production validator or indexer. `compose.localnet.yaml` retains both for isolated faucet-funded automated tests.

`compose.beta.yaml` separates the receipt and reward wallets, uses WebAuthn, private RPC networking, non-root wallet processes, a read-only root filesystem, persistent independent volumes and separately generated unlock files. Both wallets explicitly select the primary public indexer. The secondary is checked and available for a deliberate endpoint change, not automatic transaction resubmission or implemented runtime failover. No virtual CI passkeys or auth-disabled research volumes are reused.

Copy `config/beta.env.example` to ignored `.env.beta` and set the public HTTPS application origin once a domain is chosen. The example works as a preparation configuration without a domain. No values are passed to the frontend. Network instance/deployment identity must be independently verified before live funding or release; matching network name/byte alone cannot detect a testnet reset. The current v0.43.0 runtime remains the provisional checksum-pinned candidate from ADR 001, requiring final compatibility and release review.

```powershell
Copy-Item config/beta.env.example .env.beta
docker compose --profile tools run --rm node-tools node scripts/init-beta-secrets.mjs
docker compose --env-file .env.beta -f compose.beta.yaml run --rm --no-deps indexer-check
docker compose --env-file .env.beta -f compose.beta.yaml up --build -d receipt-wallet reward-wallet
docker compose --env-file .env.beta -f compose.beta.yaml run --rm --no-deps indexer-check node scripts/probe-beta-indexers.mjs --wallets
```

The initializer preserves existing files and refuses changing existing volume unlock material. Preserve encrypted backups of wallet state and unlock material; never replace one side of that pair casually. The public profile exposes no ports. For local operator onboarding, add `-f compose.beta.admin.yaml` to the `up` command. It binds the receipt wallet UI to `http://localhost:5101` and reward wallet UI to `http://localhost:5102`, loopback only. Register a real operator passkey in each UI. On a remote server, use an administrator SSH tunnel to its loopback listeners. Wallet UI/RPC must not be forwarded through the public application proxy.

Funding stays faucet-only, with automatic claims, submissions, anchoring and payouts disabled. The startup validator rejects enabling those unfinished live paths. The local funding adapter deliberately cannot execute this public configuration. Public funding requires its own deployment witness/provenance adapter, exact accounts, reviewed fee limits, scoped credentials and bounded policy. Startup/probe commands create no public accounts, submit no transactions and request no faucet tokens. Do not fund the old auth-disabled research wallets. Mainnet needs a separate treasury configuration and launch review.

Observed verification is in `docs/evidence/m2/beta-indexers.json`: both Tari endpoints match Esmeralda byte 38; both beta wallets report the expected candidate version and network. Unauthenticated account reads are checked for rejection. This is read-only startup evidence, not a funded public compatibility or human-authentication pass. Four configuration tests cover wrong network/provider, unsafe endpoint URLs, premature mutation enablement and the public origin; the funding suite now has 46 passing tests.

The app at port 5173 remains the guided mock. API, worker, datastore, live receipt/reward adapters, reverse proxy/TLS, production resource/health/log policy and funded public evidence still need implementation before the complete application can be deployed. The wallet profile prepares these dependencies without fabricating live product functionality.

Stop while keeping wallet volumes:

```powershell
docker compose --env-file .env.beta -f compose.beta.yaml -f compose.beta.admin.yaml down
```
