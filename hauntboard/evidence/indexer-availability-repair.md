# Indexer upgrade availability repair — October 14, 2026

The hosted app was unhealthy and returned HTTP 503 with `Public testnet identity, runtime, proof verification or validator checks failed.` The primary Tari indexer reported runtime 0.46.1, while the manifest recorded 0.46.0. Both approved providers still returned verified existing-board state.

Removed the public/client runtime witness from readiness and the global readiness preflight from API requests. Public readiness now requires readable, verified board state with an approved template and schema 4. Each API performs its own validation. The manifest's `providerRuntimeVersion` is retained as historical metadata and is no longer a required compatibility pin. The strict witness utility remains available to the read-only diagnostic probe.

Preserved the existing manifest, board/template addresses, reset identity, operations volume, compatibility/privacy evidence flags, wallet ownership checks, signed transaction identity, CSRF enforcement and uncertain-operation reconciliation. Synced the latest source changes before the final build to preserve faucet discovery and HTTPS behavior.

Built the normal pinned application Dockerfile on the VPS and deployed image `sha256:c0d756fa7176d636de48d3532aebafc89f980ae278a94ed904f437509d369722`. The previous image `sha256:37a144af9d47e4bdeea0921c930db641e59f4d609c682abcbd1cf9cdf9c6a108` and configuration backups remain under `/opt/hauntboard/repair-20261014`. The candidate passed live readiness before the switch; Compose reported the replacement healthy. The deployed manifest is byte-for-byte unchanged.

Validation:

- 32 container tests passed, covering provider fallback, manifest/schema validation, wallet output ownership, operation persistence/reconciliation, backup recovery, API session retries, faucet discovery and existing UI helpers.
- The public/client availability regression passed with unavailable diagnostic endpoints and an old runtime pin. It also checked fallback readiness, unavailable/unverified board state, wrong templates, legacy schemas, independent API access during board failure and retained CSRF enforcement.
- The non-root, read-only public image smoke test passed. Bundled release checksums, WASM and published board identity verified against Git's canonical text bytes.
- Public HTTPS `/health/ready`, `/api/config` and `/api/board` returned 200. The board response retained schema 4, `verified: true` and the existing four thread entries. Compatibility/privacy evidence flags remained false.
- A browser loaded the forum and completed conversation previews and reply counts.

No transaction was signed or submitted and no funds were spent. Read availability does not establish complete transaction compatibility with a new indexer release; genuine upstream read or transaction failures still surface on the operation that needs them.
