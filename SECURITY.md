# Security scope

Supported state: local mock prototype, no participant funds, no production deployment. The optional wallet preflight is an isolated, unfunded research environment and is not a deployable wallet service. No database or wallet credentials are exposed to the browser.

Report a suspected issue privately to the repository owner through an already established private channel. A dedicated public reporting address is not configured yet and is a release prerequisite. Never post story text, wallet secrets, private payout fields, recovery files, or tokens in a public issue.

Pending release gates include browser encryption/recovery, immutable room keys, curator WebAuthn/session/CSRF controls, wallet scope enforcement, budgets, negative tests, payout reconciliation, private service ports, backup recovery, immutable image deployment and independent recipient proof. M1 tests do not certify those controls.

Dependencies are pinned in `pnpm-lock.yaml` and the spike's `Cargo.lock`; build images use recorded base-image digests. Runtime state is in named volumes and ignored `secrets/` / `data/` directories. Retain unlock material separately from wallet data; removing volumes or replacing secrets can prevent recovery. Raw upstream configuration errors can echo values, so keep startup diagnostics private and export only allowlisted evidence fields.
