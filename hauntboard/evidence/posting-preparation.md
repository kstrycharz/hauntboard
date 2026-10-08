# Native posting-funds preparation — 0.6.10

Recovered Tari accounts can have revealed native funds but no spendable stealth outputs. The wallet now offers Prepare funds for posting, then a fee review and explicit confirmation. It converts 10 test TARI into four 2.5-TARI native stealth outputs using Tari's SDK and balance proofs. Account fees are dry-run estimated and capped at 1 test TARI. No application token or faucet claim is involved. The remaining account funds stay in the same wallet.

Preparation signs with the persistent account key and exposes the account, funding amount and common output origin. Later posts use one-time stealth spend keys. Output relationships, fees and timing remain observable; this is not full sender anonymity. Posting change remains quarantined under the existing privacy policy.

The exact signed transaction and operation ID are persisted before dispatch. A retry first reconciles the relay operation and reuses the same signed envelope. Pending preparation blocks wallet deletion/replacement. Recovery scanning can rediscover the native outputs.

On 2026-10-08, Chromium and Firefox both recovered the user-supplied native seed in ephemeral contexts and ran two accepted dry runs against the actual public Tari Esmeralda indexer. Maximum estimated fee was 35,414 microtari (0.035414 test TARI). Test routes blocked every transaction submission. Both verified preserved pending intent, blocked deletion and exact-envelope retry. Chain writes: zero. Seed, keys and signed envelopes are absent from this report and source control.

Wallet create/recover/replacement/deletion regression checks passed in Chromium and Firefox. A successful broadcast/finalization of a preparation transfer is not claimed by these read-only checks; the wallet owner confirms that action in the UI.

Release image: `sha256:0ef38d7ab600d5606823d1fc95887bb23252fedff0d9cccbc2bf31c2558afcb8`. Base image verified as the deployed 0.6.9-balance image. Local source and release script are preserved in this repository.

## 0.6.11 conversion explanation

The wallet names the action Convert to posting funds and confirmation Confirm conversion. The inline explanation covers native asset identity, account/available/total balance behavior, the 500-TARI example, account-paid fees, one output per post and visible funding links. About includes `/about#posting-funds`. Underlying transaction code is unchanged from 0.6.10. Node syntax checks passed for both changed modules. Image: `sha256:b89527c551cf9ee8520628348589b8660c3aff26f900639b3a3d4fc0a0e4ed5c`.
