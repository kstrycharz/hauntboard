# Hauntboard 0.2.0 - paged local PoC release

This package is a runnable **isolated localnet release**, with real Tari transactions. Public Esmeralda deployment is not part of this artifact. Requires Docker Desktop using Linux containers, PowerShell, ports 8280/8281 and internet access on first launch to fetch the pinned runtime images. Node and Rust run inside containers; no host package installation is required.

From the extracted package root:

```powershell
./hauntboard/scripts/start.ps1
```

Open http://localhost:8280/. Read the board without creating a wallet. Choose **Browser wallet**, enter a password of at least 12 characters, create the wallet, re-enter its password and **Claim local test funds**. Download an encrypted wallet backup after funding. Publish a public or sealed thread and review the signing wallet before confirming. Browser wallets sign board posts locally. Companion demo wallets remain available for the demo and private tips; the optional tip address belongs to the companion wallet.

The About page at http://localhost:8280/about explains exactly what is on chain and what stays on your device. The second client at http://localhost:8281/ uses a separate wallet and indexer on the same local network.

Stop with `./hauntboard/scripts/stop.ps1`. Start again with `start.ps1`; restarts preserve chain and wallet data and refresh the companion authentication sessions. Do not delete Docker volumes or browser storage unless you intend to reset those records. Wallet backups and secret-thread backups are separate.

To rebuild bundled assets and the contract, run `start.ps1 -Rebuild`. The bootstrap prevents accidentally replacing an already published contract with a different WASM binary. A changed contract needs an intentionally versioned deployment.

## Release evidence and limits

Schema 3 supports 2,048 posts per thread through 128 on-chain pages. Older schema-2 boards and wallet data are preserved during this upgrade; previous boards are available in the board chooser and retain their 32-post limit. `evidence/paging.json` records public and sealed 36-post conversations with independent clients and browser-signed rollover. `evidence/fresh-start.json` records the earlier explicit factory reset, not the current populated acceptance board. The CI workflow recreates its own synthetic board and runs the full acceptance suite. Do not run the posting acceptance suite on a board you want to keep empty for a user walkthrough.

`release-manifest.json` records the source and bundled-asset hashes. `SHA256SUMS.txt` records the distributable archive hash. The package contains source, frozen lockfiles, the compiled board contract, browser SDK bundle, Docker build definitions, licenses and sanitized evidence. It contains no wallet volumes, credentials, invitation fixtures, node_modules or Git metadata.

Localnet has one validator. Data persists only while its Docker volumes persist. Fees and limits do not provide public spam protection. The browser trusts its configured indexer. Private tips/scanning use companion wallets; browser-native stealth scanning/spending, public-network identity checks, HTTPS hosting and public Esmeralda deployment remain release gates for an internet-facing product. Do not expose these local companion services publicly.

