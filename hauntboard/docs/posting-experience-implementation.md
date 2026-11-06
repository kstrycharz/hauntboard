# Posting experience implementation

Date: November 6, 2026

This release addresses the immediate posting and funding failures in the [remediation plan](posting-experience-remediation-plan.md). It retains the published schema-4 board, contract, network/reset identity and server operation volume.

## User-visible behavior

- **Post** and **Reply** check the fee and submit directly, without Hauntboard's additional review popup. The composer discloses a maximum network fee of 1 test TARI before the user submits. The browser path calculates a fee within that authorized limit, displays it during posting and pays that calculated fee in full. Sapient retains its extension approval.
- Completing wallet setup, unlocking or funding never automatically publishes a preserved draft. A missing prerequisite is explained beside the draft, with a specific action.
- New browser wallets use **Standard posting**. Verified, unreserved change can fund later posts. Setup explains that network activity can link those posts.
- Existing wallets keep **Reduce links between posts**. An explicit **Use remaining tokens** action and wallet setting permit the user to switch to Standard posting. The output remains marked as change, including after recovery or a rejected spend; eligibility follows the saved policy.
- Standard-account funds can be prepared from the composer, with their own disclosed preparation amount and fee and a separate confirmation. The original draft stays in place.
- Browser-wallet balances are not shown as Sapient posting funds. The UI identifies the selected adapter and explains that Sapient checks its own funds and fee.
- Test-token wording is consistently **test TARI** in the app and its faucet controls. Faucet request amounts and API fields are unchanged.

## Transaction and readiness behavior

The posting guard starts before asynchronous payload preparation, and the browser's cross-tab lock covers the posting intent. Rapid clicks join no additional operation. Logical thread/reply identifiers remain stable for an unchanged draft while the user resolves prerequisites or retries an operation known not to have been submitted.

The browser wallet refreshes funding discovery under its wallet lock. Known usable funds can be used despite an incomplete incoming-fund inventory. Held change, account preparation, pending funds, discovery failure and empty discovered funds have different explanations and recovery actions.

The one-token simulation prerequisite is removed. A smaller input may fund its actual simulated fee, subject to the same fee ceiling and a positive change requirement. The current path still uses one input per post; it does not consolidate fragmented funds.

The native transaction identity is copied into the app's pending record before relay dispatch, while exact signed bytes and the input reservation remain in the wallet's existing journal. Lost acknowledgements and unknown results retain the original operation. The relay's exact-envelope protections remain in place. Finalized rejection reports any actual network fee, and accepted messages remain pending for display until the indexer returns the intended post.

Spent inputs are removed from the tracked-output set after finalized execution. A rejected spend restores its prior change classification rather than accidentally making isolated change eligible.

## Validation and limits

The release gates include targeted Node tests, Chromium/Firefox GUI scenarios, native wallet creation/recovery checks, and a new real-SDK/WASM browser test of two consecutive posting operations with synthetic execution receipts. That test checks remaining-fund eligibility, policy persistence, pending-input protection, identity persistence before dispatch and change provenance after rejection.

These browser fixtures use simulated provider execution. They do not establish new funded public-chain execution, independent consensus verification, mobile-device compatibility or anonymity. The deployment verification is read-only and must not request test funds or publish a validation post.

The release pipeline runs the new readiness and wallet-lifecycle regressions for future runtime releases. Sanitized deployment evidence is recorded separately after the actual server update.

## Remaining plan items

App-paid posting remains a separate funding and service-design task. This release does not advertise free posting or silently charge another funding source when one is unavailable. It makes the existing self-funded flow understandable and usable.

The preparation transfer still uses the existing 10-token/four-output policy and its current account-balance threshold. Further work includes a variable preparation amount, optional preview, fee quotes displayed while composing, broader typed provider errors, consent-aware operational metrics and usability checks with non-crypto participants. The direct flow uses the disclosed fee ceiling as authorization rather than requiring an additional exact-quote review step.
