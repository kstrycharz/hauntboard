# Sapient remediation kickoff

October 30, 2026. Implementation requested; production posting is not yet enabled.

## Source and distribution findings

- Official extension HEAD remains `e2f7bf9772faa35c4bce55f5e2b741a37b38a36c`, on `master`, package version 0.6.17. The previously reviewed blockers therefore still apply to that source.
- The authenticated GitHub account has pull permission and no push/maintain/admin permission on `chironbuilds/tari-wallet`. Hauntboard's main/release/VPS pipeline cannot publish an official extension update.
- The published SDK 0.1.30 package identifies `https://github.com/chironbuilds/ootle-sdk-ts` as its source. Retrieved repository HEAD is `52e04247300a0d2ef6d8f825709976d15276b4b4`, whose package manifest says 0.1.29. Reproducing the published 0.1.30 package from a confirmed source revision is an outstanding provenance check; repository HEAD must not silently substitute for the installed dependency.
- Source was downloaded into ignored `.cache/sapient-remediation-source` and `.cache/sapient-remediation-sdk` for inspection. No extension or upstream package code was executed.

## Concrete implementation boundaries

The extension's `submitApprovedTransactionRequest()` delegates generic instructions directly to `account.execute()`. Its existing request-level concurrency claim precedes execution, but does not provide a durable sealed native transaction before transmission. The SDK's generic `submitReal()` and dry-run path retain `this.signer` with additional signers. Modifying only Hauntboard's provider allowlist would leave these properties intact.

The SDK source exposes native transaction building/signing/sealing primitives, but this does not establish that the generic provider can support the required final-envelope co-signing and recovery protocol. Those changes must land in the wallet and SDK before enabling the application route. The existing browser-wallet helper is a reference implementation for ephemeral fee signing, not permission to extract a Sapient key into the website.

## Required distribution decision

Two routes have different user outcomes:

1. Target official Sapient: prepare wallet/SDK patches and integration, then require an official compatible extension release before enabling installed Sapient users.
2. Maintain a separate extension: implement and test a distinct Hauntboard-compatible build, with its own installation/update instructions and explicit support owner. Users must install that build; deploying the Hauntboard website alone does not update their official extension.

The user was asked to choose this route. No spending gates, verification flags, provider methods, production assets or wallet records were changed during kickoff. The detailed engineering work and acceptance criteria remain in [the remediation plan](sapient-remediation-plan.md).
