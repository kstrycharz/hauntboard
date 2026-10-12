# Integration decisions

## Contract and client

A template defines Rust/WASM logic; publication returns a template address. Calling its constructor creates a component with a distinct address. Publishing, instantiating and interacting require different transactions and evidence. Native resources are held in persistent vaults and moved in transaction-local buckets. Do not allow buckets or unstored vaults to escape transaction lifetime rules.

Choose state/limits around worst-case serialized bytes and engine memory rather than UI character counts. Make write authorization explicit per method, including cross-component callers. Owner rules and method rules are separate concerns. Test unauthorized direct calls, invalid parent references, exact retries and conflicting replay IDs. Client validation does not substitute for contract assertions.

Check macro origins: template invocation arguments and client/test transaction arguments can have different types even when named `args!`. Confirm the crate and version from working examples in the same released source. Test harness and template library versions need demonstrated compatibility, not numerical equality.

## Wallet and privacy

Identify owner, view and one-time spend keys. Use native mnemonic formats and derivation paths; generic BIP39 support alone does not establish native Tari recovery. Retain original seed passphrase/account index distinctions. Verify recovered account ownership before presenting its balance. A PIN encrypts local access; it does not change on-chain identity.

Separate revealed account balances, private outputs, posting-ready coins and quarantined change. Scans must check actual ownership and verified substates, handle pagination/lag and avoid treating an incomplete scan as an authoritative zero balance. Recovery of keys does not recover unsaved transaction intent.

Describe stealth guarantees narrowly. Removing a persistent signer from contract state does not remove transaction-level linkage. Inspect required signers, account inputs, fee receiver, revealed inputs/amounts, output ancestry and change behavior. Use official WASM/SDK proof machinery rather than reimplementing cryptography.

## Submission and operations

Compute identity with the native transaction implementation. Persist envelope, network/reset identity and input reservation before sending. Bind idempotency records to exact signed bytes. Keep uncertain reservations until reconciled; missing provider data is not permission to release them. Finalized rejection, finalized acceptance and Pending have distinct states.

Keep template/source hashes, immutable runtime identity, network/provider versions and confirmed publication/component receipts together. Preserve original data during upgrades. Independent providers test provider dependence; one local validator cannot establish public consensus resilience.

## Evidence selection

| Change | Useful validation |
|---|---|
| Template access/state/limits | Engine positive and negative calls; maximum-byte/page boundaries |
| Signatures/fees | Native transaction inspection and real isolated funded execution |
| Relay/retry | Lost acknowledgement, conflicting bytes, restart and provider failure |
| Wallet recovery/balances | Native derivation fixtures, wrong passphrase/address, scan lag and spent outputs |
| Browser lifecycle | Supported browsers, background/reload locking, tab races and secure context |
| Deployment | Actual target health, asset hashes, preserved volumes and rollback |

Official entry point: https://ootle.tari.com/. Consult its template, testing, transaction, authorization, stealth transfer and fee sections as needed; avoid freezing mutable upstream examples into this skill.
