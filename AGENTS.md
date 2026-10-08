# Agent operating instructions

## Objective and order

**October 5 owner-authorized pivot:** Build a functional Hauntboard proof of concept under `hauntboard/` using `PIVOT_PROJECT_PLAN.md`. This supersedes the legacy implementation order below for the board. Use a dedicated isolated localnet and new Docker volumes for actual contract and wallet evidence; preserve the existing application and wallets. Public board text is intentionally published by the author; secret-thread plaintext and keys remain local. No public-network deployment or spending is implied by the local PoC request. Report localnet/demo-wallet limits explicitly.

Implement the Hauntbox plan in PROJECT_PLAN.md and docs/funding-plan.md. M1 is accepted; continue with FUND-01/TEST-01 from the M2 preflight. Automated chain tests use faucet-origin funds. Funding/test infrastructure and deterministic crypto/API/schema preparation may start now; M3–M5 integration may proceed after M2a local capability passes. Public deployment and live capability claims require M2b public proof. Complete each milestone's actual evidence before claiming success; a public faucet outage does not block local testing. Human mock trials remain independent.

Use two review perspectives: the PM owns scope, usefulness, demo clarity, schedule, and acceptance; the architect owns privacy claims, trust boundaries, APIs, correctness, and operations. A single agent may perform both. If the user authorizes parallel agents, give each a bounded work package and a file ownership boundary; do not allow concurrent edits to shared schemas or lockfiles.

## Workspace and tooling

- Keep all project changes inside this repository. Treat sibling Tari source snapshots as read-only references.
- Run package managers, Rust, Node, browser tests, database tools, and Tari binaries inside containers. Do not install host packages, editor extensions, or global CLI tools.
- Keep node_modules, Rust targets, database storage, and wallet data in named Docker volumes or ignored data directories. Never mount the Docker socket into the app.
- Do not use mutable latest tags for a release. Record compatible versions, image digests, and checksums.
- The current Tari skill version examples may lag the provided sources. Verify the deployed network, released packages, wallet RPC types, and template library/test harness compatibility at M2. Do not assume a development snapshot matches public testnet.

## Product and privacy

- Follow the explicit mock, recorded evidence, and live testnet distinctions in the plan. Never show fabricated transaction IDs as live evidence.
- The initial deployment uses operator-custodied testnet reward funds. Do not accept participant deposits or describe the service as noncustodial.
- Keep secret submissions and payout addresses encrypted in the browser until the host deliberately opens them. Payout processing discloses the selected recipient and amount to the operator wallet service; make that visible in the product.
- Do not claim anonymous, trustless, guaranteed rewards, hidden fees, or timed decryption. The host can decrypt on receipt. Chain receipts prove inclusion of encrypted bytes, not authorship or payment.
- Never put plaintext submissions, private keys, reward amounts, or recipient addresses in public events, logs, error reports, analytics, or source control.
- Use established crypto APIs and Tari implementations. Do not invent proof systems or port wallet cryptography into handwritten JavaScript.

## Execution and delivery

- Follow the task dependencies, validation matrix, and release gates in PROJECT_PLAN.md. Add meaningful positive and negative tests with each implementation task.
- If a capability gate fails, record the evidence and apply the specified fallback. Do not silently substitute a public payment or a mock for required native privacy.
- Treat ambiguous payment submission outcomes as reconciliation work. Never blindly retry a funds transfer.
- Keep milestone evidence, source references, and ADR decisions in docs/. Update the plan's status table and README to reflect actual completion.
- Before external publication or spending, establish the user's authorization and exact target/budget. Prepare reviewable artifacts first. Do not post to social media or forums without explicit authorization.
- Finish with a concise record of changes, checks performed, limitations, and the next ready work package.
