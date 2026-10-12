# Agent operating instructions

## Scope

Maintain the shipping Hauntboard app under `hauntboard/`, the schema-4 contract, wallet adapters and deployment tooling. The current setup starts in README.md; historical Hauntbox versions remain in Git history. Sibling Tari snapshots are read-only references.

## Tooling and releases

Run Node, package managers, Rust, browser tests and Tari binaries in containers. Keep runtime data and compiler caches in named volumes or ignored directories. Never mount the Docker socket into the application. Pin release tool images and dependencies; verify network/runtime compatibility rather than assuming source snapshots match testnet.

Preserve the existing board/template and pending operation state during website updates. Contract publication and chain spending are separate actions requiring explicit target/account/budget authorization. Do not retry an uncertain transfer: reconcile the original signed operation first. Verify health and retain the previous image for rollback.

## Privacy and claims

Never commit or log wallet phrases, private keys, plaintext secret submissions or private payout details. Wallet signing and key storage remain in the browser. Public posts are intentionally public and immutable. Esmeralda is testnet; no mainnet funds or participant deposits are supported. Do not claim anonymity, trustlessness, guaranteed rewards or complete decentralization. The current local client uses approved Tari-hosted providers.

Retain honest compatibility/privacy evidence flags. Testnet beta mode is explicit; do not change verification flags to make readiness pass. Report what tests actually prove and any remaining device/network limitations.

## Delivery

Keep current local and VPS instructions accurate and runnable. Use targeted tests for behavioral changes, contract tests for contract changes and readiness/browser checks for deployments. Preserve third-party licenses. Public pull requests must never execute on the private VPS runner. Report changes, verification and outstanding user setup.
