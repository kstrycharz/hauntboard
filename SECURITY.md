# Security scope

Supported implementation: containerized application, isolated local-chain integration and a production-built Esmeralda preview. Public mutations remain disabled pending public capability proof and operational release gates. Mainnet and participant deposits are outside scope. Database and wallet credentials stay behind private service boundaries.

Report a suspected issue privately to the repository owner through an already established private channel. A dedicated public reporting address is not configured yet and is a release prerequisite. Never post story text, wallet secrets, private payout fields, recovery files, or tokens in a public issue.

Local verification covers browser encryption/recovery, immutable room keys, curator WebAuthn/session/CSRF controls, contract authority, challenge/idempotency boundaries, concurrent payout confirmation, fee reservations, ambiguous submissions, worker restart and independent native recipient scanning. Unknown signing outcomes freeze for reconciliation and never automatically rebuild a transfer. This is developer verification, not an independent security audit. Encrypted application database/intent-key restore and tamper checks pass. Public proof, wallet recovery and rollback drills, external usability trials and soak testing remain release gates.

Dependencies are pinned in `pnpm-lock.yaml` and the spike's `Cargo.lock`; build images use recorded base-image digests. Runtime state is in named volumes and ignored `secrets/` / `data/` directories. Retain unlock material separately from wallet data; removing volumes or replacing secrets can prevent recovery. Raw upstream configuration errors can echo values, so keep startup diagnostics private and export only allowlisted evidence fields.
