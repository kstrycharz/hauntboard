# Production Esmeralda configuration

October 2, 2026. Production-built application and wallet infrastructure are available locally. M2a passed and the actual application flow is proved on the isolated local chain. M2b public proof and operational release gates remain open; public mutations are paused. Mainnet is outside scope.

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

Observed verification is in `docs/evidence/m2/beta-indexers.json`: both Tari endpoints match Esmeralda byte 38; both beta wallets report the expected candidate version and network. Unauthenticated account reads are checked for rejection. This is read-only startup evidence, not a funded public compatibility or human-authentication pass. Four configuration tests cover wrong network/provider, unsafe endpoint URLs, premature mutation enablement and the public origin; the funding suite now has 50 passing tests.

The production app is at http://localhost:8180/submit; the full local-chain app is at http://localhost:5173. Both include the optional payout-address field and participant/operator wallet setup. API, worker, PostgreSQL, browser crypto, native receipt/reward adapters and production reverse proxy are implemented. See [application setup](application.md). Public HTTPS and funded public proof remain pending.

Stop while keeping wallet volumes:

```powershell
docker compose --env-file .env.beta -f compose.beta.yaml -f compose.beta.admin.yaml down
```

Frontend onboarding now uses Hauntbox /account and Host / Curator, with testnet PIN or passkey sign-in. The native UIs above are private operator administration tools; they are not linked from participant onboarding. App account credentials do not unlock the native wallets. The participant companion is stopped and its volumes retained. See docs/adr/003-sign-in-and-mainnet-security.md for the mainnet gates.
