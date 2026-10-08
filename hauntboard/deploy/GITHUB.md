# GitHub build and deployment

## Current dev/testnet deployment workflow

Repository: https://github.com/kstrycharz/hauntboard (private). The manual **Deploy fresh Tari testnet board to Ubuntu** workflow is in `.github/workflows/hauntboard-testnet-deploy.yml`. It runs only on `main`, on the repo-specific `hauntboard-testnet` runner at 192.168.1.200. It does not run on pull requests or automatically reset the board on pushes. Choose `deploy=false` to build and test without chain changes or a website switch.

With `deploy=true`, it tests the Rust contract, compiles locked WASM, builds the browser SDK and native wallet adapters, verifies the contract package, builds and checks the application image, then uses a dedicated backend testnet wallet to create a fresh board. Changed WASM is published as a Tari template; identical compiled WASM reuses the current known template. A new board component is created for each new GitHub run. Both Tari-hosted indexers must confirm the board and deployment transactions before staging and switching the app/preview containers.

Every run has a five-test-TARI maximum fee budget and a durable private Docker volume named `hauntboard-actions-deploy-RUN_ID`. Backend funding uses Tari's public testnet faucet; unused funds are returned after deployment. An empty faucet or failed contract verification stops before switching the website. Rerun the same GitHub run to resume the same signed transaction journal. A new run intentionally creates another fresh board. Do not delete the journal after an ambiguous submission.

The app release folder is `/home/ubuntu/hauntboard/releases/0.5.0`; configuration backups live in its `actions-backups/RUN_ID` directory. The network reset identity and existing participant wallets are preserved. The previous board/template remains in legacy metadata. The Cloudflare tunnel is not restarted. A failed live verification restores the previous app configuration; confirmed on-chain contracts remain on Tari.

Wallet secrets never become GitHub secrets, source files or artifacts. They remain in the run's private server Docker volume. Artifacts include the compiled WASM, checked source/WASM hashes and public receipts. The runner registration credentials stay in `/home/ubuntu/hauntboard/actions-runner` and are excluded from the repository.

The runner uses the host Docker daemon to build and deploy containers. This grants workflows administrator-equivalent access to the server despite limited file mounts. Keep this repository private and control who can modify `main` or dispatch the workflow. `compose.actions-runner.yaml` mounts only runner state/work folders, the app release folder, the Docker socket and read-only Docker tools. The web application itself has no Docker socket mount. Runner installation with Docker access requires the application owner's explicit approval.

The sections below describe the earlier build-only handoff and are retained for reference.

The first-version candidate is the public-only schema-4 contract in `hauntboard/template-public/`. Its state contains no author key. Posting uses Tari native stealth fee authorization and one-time spend signatures. The previous schema-3 contract is preserved for development history and is not the release candidate.

## Generate the contract in GitHub Actions

`.github/workflows/hauntboard-contract.yml` runs on relevant pushes/pull requests and can be launched from **Actions → Hauntboard contract artifact → Run workflow**. It uses GitHub-hosted Ubuntu runners, digest-pinned container toolchains and locked Rust dependencies. It tests the contract on native engine 0.45.0, compiles the WASM, packages the source and verifies checksums before uploading. No wallet credential is required and no chain transaction is submitted.

Download **hauntboard-public-contract-COMMIT_SHA** from the successful run. It contains:

- `hauntboard_public.wasm`, the deployment input.
- `hauntboard-public-contract-0.2.0-schema4.tar.gz`, including source and WASM.
- `public-contract-manifest.json` with hashes, engine/library versions and unset public locators.
- `PUBLIC_CONTRACT_SHA256SUMS.txt` and fresh native engine evidence.

Artifacts retain GitHub's directory structure and are kept for 30 days. Verify the WASM SHA-256 against the manifest. A passing build proves the recorded engine behavior; it does not prove a public Esmeralda posting transaction.

For local container generation from the repository root:

```sh
docker compose -f compose.localnet.yaml -f compose.hauntboard.yaml build board-engine board-build
docker compose -f compose.localnet.yaml -f compose.hauntboard.yaml run --rm --no-deps board-engine sh /workspace/hauntboard/template-public/test-engine.sh
docker compose -f compose.localnet.yaml -f compose.hauntboard.yaml run --rm --no-deps -w /workspace/hauntboard/template-public board-build sh -c 'cargo build --locked --release --target wasm32-unknown-unknown && cp /target/wasm32-unknown-unknown/release/hauntboard_public.wasm /workspace/hauntboard/template-public/hauntboard_public.wasm'
```

## Publish and validate on Tari

After selecting the exact Esmeralda publishing account and fee budget, use the supported Esmeralda Wallet Web UI to upload the reviewed WASM, simulate fees and publish. Record the confirmed template address, then call `Hauntboard::new(title)` and record the board component. Publication can include the operator's identity; participant posting follows the separate stealth fee path.

Before setting `compatibilityVerified` and `posterPrivacyVerified`, perform the real browser receive/discover/spend flow on Esmeralda and inspect the confirmed transactions through both Tari-hosted providers. Verify public readable state with no author fields, no persistent participant owner key or named account input, and recovery after a lost acknowledgement. Record transaction IDs, source/WASM hashes and fees. Do not copy the localnet proof flags into the public manifest.

## Where each piece runs

| Piece | Location |
|---|---|
| Source and workflows | Your GitHub repository |
| Temporary build/test agent | GitHub-hosted Actions runner |
| WASM and evidence | GitHub workflow artifacts |
| Application image, once a registry is selected | A registry such as GHCR |
| Web app and durable relay journal | Ubuntu VPS using the supplied Docker Compose deployment |
| Public post bytes and board/thread/page state | Tari Esmeralda components |
| Chain read/submission access | Tari-hosted indexer A or B |
| Owner/view secrets and private coin ledger | Password-encrypted participant browser storage/backups |

GitHub's agent is called a **runner**. It executes temporary jobs; the Ubuntu VPS hosts the live application. GitHub Pages cannot run the Node relay and its journal. A self-hosted runner is not required on the VPS.

`.github/workflows/hauntboard.yml` separately builds and smoke-tests the non-root application image and runs isolated chain/browser acceptance, including schema-4 native fee posting in Chromium and Firefox. No active registry push or SSH deployment is configured until the repository, registry, VPS/domain and public manifest exist. The files are prepared locally; no hosted GitHub run has occurred.

## Ubuntu VPS handoff

Use [RUNBOOK.md](RUNBOOK.md), `compose.hauntboard.vps.yaml`, the env example and the fail-closed network manifest. Deploy a reviewed immutable application image and edge image by digest, keep the operation volume across updates and retain the previous image digest for rollback. Only the TLS edge exposes application ports. Readiness stays false until the public contract and privacy gates pass.

Automatic contract publication on every push is deliberately absent. Once exact targets are supplied, an app deployment workflow can push the tested commit image and update the VPS over restricted SSH; on-chain publication remains a separately reviewed operation with a bounded fee budget.
