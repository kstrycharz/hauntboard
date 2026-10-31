# Sapient implementation decision

October 30, 2026. Outcome: implement provider discovery and connection checks; retain the current browser wallet for all posting, funding, and room administration. Sapient has not passed Hauntboard's promotion gates. This is the fallback outcome allowed by the [project plan](sapient-wallet-project-plan.md), not a claim of completed Sapient spending compatibility.

## What ships

Wallet → Sapient & wallet options discovers `window.tariProviders` and `window.tari`, deduplicates provider objects, and rechecks after provider announcements or a manual refresh. Users select among detected providers. Nothing connects automatically, no remote connector script is loaded, and the existing posting wallet stays selected.

Connect checks the network name before prompting for the public account, then reads account capabilities. Wrong networks, malformed responses, rejection, timeout, and account-change events clear the compatibility snapshot. A timed-out response cannot revive it. The check requests no private-view grant and reads no private balances. Disconnect is explicit. This release does not store external account details or a wallet preference and never requests seed material.

The provider adapter only permits network/account/capability checks and disconnect. Request creation, signing, submission, and private-view methods are rejected before provider access. There is no environment switch that promotes unsupported spending. All existing post review, browser signing, fee preparation, room-admin signing, relay journals, and pending operations retain their current paths. Continuing with the browser wallet never replays an external transaction.

The UI and README describe fallback risks: an unlocked wallet trusts site code; a copied encrypted wallet may be attacked offline; six-digit PIN protection has limits; browser storage loss and incomplete scans affect recovery; room access requires separate backups; provider trust, funding ancestry, timing, and testnet resets remain material. Neither path promises anonymity.

## Why primary promotion failed

Review pins:

- [Sapient 0.6.17 source](https://github.com/chironbuilds/tari-wallet/tree/e2f7bf9772faa35c4bce55f5e2b741a37b38a36c).
- Its lockfile resolves `@chironbuilder/ootle-sdk` to **0.1.30**, integrity `sha512-FjDO4yVhvoxMo6H1QKRgPsI+3xgUmmZ+28pDmrYC6Up16n2xnTY+WqxlcpnqAA/56fUEe2/lKdltJm2bgXUUiA==`.
- The published npm tarball was inspected as data, without executing its code. [Package metadata](https://registry.npmjs.org/@chironbuilder/ootle-sdk/0.1.30), [published wallet implementation](https://unpkg.com/@chironbuilder/ootle-sdk@0.1.30/dist/wallet.js).

Concrete findings in that package's `dist/wallet.js`:

1. `execute()` (around lines 390–450) builds generic instructions with a private fee signer as an **additional** signer. `submitReal()` (around lines 590–615) calls `signTransaction([this.signer, ...extraSigners], resolved)`. This generic private-fee route therefore retains the persistent wallet signer. Hauntboard's [current fee builder](../web/stealth-fee.mjs) intentionally uses an ephemeral transaction signer and one-time fee authorization. A true `supportsPrivateFees` capability does not establish parity.
2. `recordPrivateFeeSpend()` adds the unspent fee-change output to the wallet's normal shielded output ledger. `resolvePrivateFee()` selects from that ledger. The reviewed generic provider request type has no Hauntboard quarantine/exclusion control. Hauntboard's application-side bookkeeping cannot enforce isolation inside another wallet.
3. `submitReal()` submits the sealed envelope directly, then receives the native transaction ID. The generic execute path does not expose an original signed envelope/identity journal before transmission. The extension does persist approval request records and atomically claim submission, but its [background request handler](https://github.com/chironbuilds/tari-wallet/blob/e2f7bf9772faa35c4bce55f5e2b741a37b38a36c/src/background/index.ts) records the result after execution; a worker interruption can strand `submitting`. An exception labeled `failed` does not prove the chain did not commit. Several specialized SDK paths have their own pending bookkeeping; that does not establish durability for generic Hauntboard calls.
4. `tari_getNetwork` exposes the name, not Hauntboard's pinned reset identity. The connection check is explicitly a name/capability check, not a verified chain/reset handshake.
5. The [generic request interface](https://github.com/chironbuilds/tari-wallet/blob/e2f7bf9772faa35c4bce55f5e2b741a37b38a36c/src/lib/messages.ts) accepts instructions, inputs, fee options, and a ceiling, but no external co-signer. Current room administration uses a separate browser-held registry signer. No authority migration or contract modification was attempted.

The reviewed SDK also contains a useful fee-only-commit fix: it records spent fee inputs/change on `FeeCommittedError` and does not retry that spent input. This improves one failure path; it does not resolve the persistent-signer, quarantine, or generic submission durability gates. Broad statements that every retry blindly resubmits a spent fee input would be inaccurate for this version.

## Validation and limits

`sapient-wallet.test.mjs` covers discovery, no automatic connection, strict network checks, response validation, capability gating, account-change races, timeout, disconnect, and the no-spend method boundary. The GUI suite covers late injection, deduplication, connection rejection/wrong network, account changes, and returning to the existing wallet in Chromium and Firefox. Those provider calls are simulated; they do not establish extension-binary provenance or funded-chain execution.

No upstream wallet code was vendored or executed. No seed, account, chain volume, board/template, compatibility flag, or reset identity is migrated. No funded chain transaction is required for this fallback implementation, and none is performed as part of these checks.

To reconsider promotion, update the pinned review after upstream supports signer omission for generic calls, enforceable change isolation, durable native identity/envelope recovery, and an adequate reset binding. Room-admin support can remain an explicitly documented operation-specific fallback if the product accepts that limitation. Then implement the adapter's spend flow and run the plan's authorized funded-chain gates before changing the recommendation.
