# Hauntbox

**Seal your story. Prove it arrived. Reward it privately.**

A haunted post office for Tari's October 2026 **Spooky Secrets** contest. The clickable mock is implemented; browser encryption, live Ootle receipts and native stealth rewards remain gated on network feasibility.

## Start here

Read [PROJECT_PLAN.md](PROJECT_PLAN.md). M1 is accepted; the next integration milestone is M2 feasibility. The plan specifies the research gates, architecture, implementation tasks, tests, operations, and contest delivery.

Coding agents must also read [AGENTS.md](AGENTS.md).

## Current status

**M1 complete:** React + TypeScript + Vite frontend with a visitor/curator journey, deterministic typed adapter, receipt export, reward consent/outcome states, privacy inspector, recovery rehearsal, self-hosted fonts and Docker workflows. Seven unit tests and 22 Chromium/Firefox browser tests pass; supported widths are 360, 768 and 1440 px. [Acceptance evidence](docs/evidence/m1/README.md), [screen inventory](docs/screen-inventory.md), and [walkthrough](docs/evidence/m1/walkthrough.webm).

**M2 preflight implemented; gate not passed:** checksum-verified wallet 0.43.0 containers start and restart with separately mounted unlock material. Wallets and public indexers agree on Esmeralda network byte 38. A fresh October 2 read confirms the faucet is empty; the owner chose faucet-only funding. Ten disposable WebAuthn/API-key checks pass, including scope enforcement, expiry and revocation. Persistent operator authentication and live privacy remain unproved. The original receipt ABI probe builds to WASM with a crate lockfile. No accounts were funded, template published, or tokens transferred. [Capability report](docs/evidence/m2/capabilities.md), [operation worksheet](docs/evidence/m2/operation-review.md), and [pending compatibility ADR](docs/adr/001-network-wallet-versions.md).

**Review follow-ups:** BASE-01 is recorded in the local `m1-accepted` tag and [source-baseline note](docs/source-baseline.md). UX-01a promotes the guided demo, ends the participant path at the receipt, explicitly labels the curator transition, and explains optional testnet rewards. Fresh checks pass: seven unit tests and 22 Chromium/Firefox browser tests, including keyboard, reduced motion and accessibility at 360/768/1440 px. [PM-00 trial protocol](docs/research/mock-comprehension-trials.md) is ready; zero human trials have been completed.

**Funding plan:** [automated tests, public testnet and production migration](docs/funding-plan.md) now specify faucet configuration, claim/recovery logic, isolated CI funding, and future treasury funding. FUND-01/TEST-01 are the next implementation packages. Deterministic work may start now; M3–M5 integration follows M2a local proof, while public deployment still requires M2b public proof. The public empty-faucet observation is not a project-wide development blocker. Funding automation and both new gates are not yet implemented/passed. This repository is not a live testnet beta or a completed contest entry.

## Run the mock

From this directory, with Docker Desktop using Linux containers:

```sh
docker compose --profile mock up --build web-dev
```

Open [Hauntbox locally](http://127.0.0.1:5173). Choose **Try the guided demo** for the prefilled visitor → receipt → curator → reward journey. Use **Recovery & status** to try outages and unknown outcomes. **Reset fixtures** starts over.

The permanent banner says “Mock demo — no funds move.” This mock does not encrypt. Enter sample stories only; it accepts only the provided fictional recipient. State stays in tab memory and clears on reload/reset. The sample receipt is not live chain evidence.

## Verify in containers

```sh
docker compose --profile tools run --rm node-tools pnpm install --frozen-lockfile
docker compose --profile tools run --rm node-tools pnpm format:check
docker compose --profile tools run --rm node-tools pnpm check
docker compose --profile tools run --rm node-tools pnpm test
docker compose --profile tools run --rm node-tools pnpm build
docker compose --profile test run --rm e2e
docker compose --profile tools run --rm node-tools pnpm audit --prod
```

For a compiled, non-root local preview:

```sh
docker compose --profile preview up --build web-preview
```

Open [the compiled preview](http://127.0.0.1:4173). Vite preview is a local M1 convenience; production serving/TLS are not configured.

Stop while preserving named volumes with `docker compose down`. The development and preview ports bind to loopback. Modules, pnpm cache, Cargo cache/targets and wallet data stay in separate named volumes.

## Read-only Tari preflight

This is an optional isolated research workflow, separate from the app. It exposes no wallet ports and uses authentication-disabled disposable wallets solely for the preflight. Keep it unfunded until the funded/authenticated integration package is approved and configured.

```sh
docker compose --profile tools run --rm node-tools node scripts/research-tari.mjs
docker compose --profile tools run --rm node-tools node scripts/init-spike-secrets.mjs
docker compose -f compose.spike.yaml up -d --build sender receiver
docker compose -f compose.spike.yaml run --rm probe
docker compose --profile tools run --rm rust-spike
docker compose -f compose.spike.yaml down
```

The secret initializer preserves existing files. Do not replace unlock material for an initialized wallet or delete volumes to fix a startup problem. Full commands, scope changes, observed permissions and remaining gates are in the [M2 report](docs/evidence/m2/capabilities.md).

## Development policy

All development, builds, tests, databases, and Tari services run in containers. Use the existing Docker installation or a remote Docker host. Do not install project toolchains on the Windows host.

The sibling folders `../tari-development` and `../tari-ootle-development` are reference snapshots, outside this repository. Do not copy them into the project or commit them.

## License

Original project code is [MIT](LICENSE). [Third-party notices](THIRD_PARTY_NOTICES.md) retain React and font licenses plus Tari provenance. See [privacy status](PRIVACY.md) and [security scope](SECURITY.md).
