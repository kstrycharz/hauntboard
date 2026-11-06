# Plan: make Hauntboard posting understandable and reliable

Date: November 6, 2026

Status: initial self-funded improvements implemented; app-paid posting and additional work remain planned. See the [implementation record](posting-experience-implementation.md).

Scope: new threads, replies, wallet readiness, posting fees and recovery from interrupted submissions

## Intended outcome

A person unfamiliar with crypto should be able to write a message, understand any cost before submitting, press **Post**, and see a clear result. They should never need to repeatedly press the button to make progress or interpret “99 tokens owned, 0 available” without an explanation and a working next step.

The immediate release should fix readiness and simplify self-funded posting. The preferred longer-term experience is **posting paid for by Hauntboard**, so ordinary testnet participation does not require obtaining or managing tokens. Sponsorship needs a technical and operating-budget decision; changing button text alone cannot deliver it.

This document records the original plan and its baseline findings from commit `b1df1c6`. The implementation record describes the delivered subset and remaining work. The reporter's exact wallet session was not reproduced. Deployment evidence is recorded separately after verification.

## 1. What the feedback is telling us

| User concern | Product requirement |
| --- | --- |
| “It says I have no funds when I do.” | Explain why funds cannot currently pay for this post. Never present an incomplete check as a verified empty balance. |
| “I had to spam the button.” | One posting intent must progress reliably. Repeated clicks must neither restart checks nor create another spend. |
| “Review post opens my wallet.” | Make **Post** and **Reply** the primary actions. Show prerequisites and costs inside the composer before submission. |
| “Why can't I post with test tokens?” | Check the selected wallet, network, native asset, verified balance, pending operations and actual fee eligibility together. |
| “Why pay to post?” | Explain the network cost in one sentence and pursue an app-paid default for ordinary users. |
| “Why 99 total but nothing available?” | Identify held change, funds requiring preparation, pending funds or stale discovery, and provide the corresponding recovery action. |

Treat this as a posting failure and an unclear product model, rather than a need for users to learn wallet terminology.

## 2. Findings from the current source

These are findings from the pre-change source at `b1df1c6`, retained to explain the work. The exact cause of the reported incident remains unconfirmed because no transaction identity, selected-wallet state or balance breakdown was supplied.

| Finding | Evidence in this checkout | Implication |
| --- | --- | --- |
| Posting change is deliberately excluded from future posting. | [`browser-wallet.mjs`](../web/browser-wallet.mjs), `transactionResult()`, records owned change as `quarantined`. `privateReview()` selects only `ready` outputs. [`stealth-fee.mjs`](../web/stealth-fee.mjs) returns the input minus the fee as change. | A payout followed by one post can leave approximately 99 tokens owned but no eligible posting output. This is a plausible explanation for the report, not a confirmed diagnosis. The remainder was not necessarily charged or lost. |
| The wallet total includes funds that the posting selector will not use. | `privateBalance()` sums ready, quarantined, reserved and revealed account funds. | “Total” cannot serve as proof that the next post can be funded. The UI must explain the restriction. |
| Standard account funds need a separate preparation transaction. | `reviewPostingPreparation()` moves 10 test TARI into four 2.5-token outputs, with at least 11 required for its initial check. | A funded account can fail posting eligibility. The conversion amount and threshold are current app choices. |
| Even the ready amount can overstate immediate posting eligibility. | `privateBalance()` totals ready outputs, while `privateReview()` requires one output **greater than 1 test TARI** for its initial simulation. | A smaller output, or several small outputs whose sum looks adequate, can still fail. The displayed amount and the actual selector need the same eligibility rules. |
| Incoming-fund discovery and posting readiness run through different paths. | `refreshIncomingFunds()` refreshes in the background. `privateReview()` refreshes stored material and checks known coins without first doing the same incoming-fund discovery/full scan. | A click can race discovery. Repeated attempts may appear to help as state changes in the background; this has not been proven for this incident. |
| The active posting wallet and displayed balance can differ. | `review()` chooses connected Sapient for threads/replies, while `showWalletBalance()` reads the browser wallet. | “You have funds” may describe a different wallet from the one being asked to post. Sapient's private balance must not be inferred from the browser wallet. |
| The app deliberately adds a review dialog and can redirect to wallet setup. | [`app.mjs`](../web/app.mjs), `review()` and `publish()`; [`index.html`](../web/index.html), compose/reply and review controls. | The button leads to another workflow, with a second publishing action. |
| Some protection already exists, but it does not cover the entire user intent. | `publish()` checks busy/pending state; browser submission reserves a coin and saves its exact envelope; the relay journals operations. Compose/reply handlers generate a fresh UID/nonce per attempt, and asynchronous content preparation starts before `review()` sets `busy`. | Preserve the existing transaction protections and extend them from the first click through encoding, checks, signing and recovery. Do not assume spam clicking currently causes duplicate committed posts. |
| The asset labels disagree. | `units()` displays `test TARI`; faucet controls and [`faucet-client.mjs`](../web/faucet-client.mjs) say `test tXTR`; the report says “taro.” | Standardize the name after verifying the actual native resource, network and faucet receipt. A label is not sufficient evidence that an asset can pay fees. |
| The post methods do not collect an application posting charge. | [`template-public/src/lib.rs`](../template-public/src/lib.rs), `create_thread()` and `append()`. Fee payment is built by the wallet. | Explain the cost as a network fee. Do not imply the user is buying a post from Hauntboard. |

The existing [funding-discovery notes](faucet-discovery.md) document confirmed incoming outputs missing from general indexer listings. The [preparation evidence](../evidence/posting-preparation.md) and [imported-account balance evidence](../evidence/imported-account-balance.md) are historical observations, not proof of this incident or current live balances. Use the current manifests when implementing; the architecture guide contains older dependency pins.

## 3. Product decisions

### A. Put posting, costs and prerequisites in one place

- Rename the primary controls to **Post** and **Reply**.
- Keep an optional **Preview** for checking the rendered message. Preview must not connect a wallet, request funds or sign a transaction.
- Show the selected funding method, readiness and fee beside the primary action. A valid, displayed quote enables the ready-state button.
- Put a short notice by the composer: “Posts cannot be edited or deleted.” Explain sealed-body visibility separately when that mode is selected.
- Once a ready user presses Post, run the required final checks, sign and submit through the selected method, then show progress in the composer. Remove the app's additional review/publish dialog from this happy path.
- If setup, unlocking or funding is necessary, show that specific step inline and preserve the draft. Return to a ready composer with a visible fee; completing an unlock or funding step must not unexpectedly publish a message.
- If the quote changes beyond the amount the user authorized, stop inline and show the new amount before another Post action. Content, wallet, network/reset or privacy-setting changes invalidate the old authorization.

“One click” means one publishing action once prerequisites are ready. It does not mean silently authorizing additional funding transactions or bypassing an external wallet's approval.

### B. Make existing funds usable through an explicit posting policy

The current browser wallet holds change aside to reduce links between consecutive posts. That is an application privacy policy, not evidence that the tokens disappeared or that Tari universally prohibits reusing them.

Introduce two clearly explained browser-wallet settings:

| Setting | Behavior | User explanation |
| --- | --- | --- |
| **Standard posting** | Permit verified, unreserved owned change to fund later posts, subject to the actual fee and supported input selection. | “Use your remaining tokens for more posts. Network activity may link your posts.” |
| **Reduce links between posts** | Retain the existing isolated-output policy and held-change treatment. | “Some remaining tokens are held aside under this setting. This does not guarantee anonymity.” |

Recommend Standard posting for new non-crypto users, with the explanation visible during setup. Preserve existing wallets' policy on upgrade and offer a clear, explicit switch. Do not silently weaken an existing privacy choice or advertise Standard as anonymous. A connected Sapient wallet continues to use Sapient's own supported fee/change behavior; the site cannot impose these browser-wallet policies on it.

Keep output provenance separate from eligibility. A recovered output marked as posting change must remain eligible under an explicitly selected Standard policy; merely renaming `quarantined` to `ready` once would fail after rediscovery. Never reuse a reserved input or change from an unresolved transaction.

For account-held funds, offer **Prepare posting funds** inside the composer. Explain how much moves, the preparation fee, and what remains in the account. Obtain explicit confirmation for that separate transaction, reconcile it, verify the resulting outputs, and return to the original draft. Review replacing the fixed 10-token requirement with a bounded amount based on actual fees and supported output limits.

### C. Answer why a fee exists, then remove that burden where feasible

Hauntboard stores posts in Tari contract state, so posting invokes network execution and storage. Someone must fund the network transaction. The current browser fee path pays from a bucket and pays the displayed allowance in full; it must not suggest unused allowance is refunded. These distinctions are described in the [official Tari fee reference](https://ootle.tari.com/reference/fees/).

Use this self-funded explanation near the fee:

> Posting saves your message on the Tari test network. It uses a small network fee in test tokens, which have no monetary value.

Use **test TARI** consistently in the app if native-resource verification confirms that name for the supported deployment. Coordinate faucet-facing wording without changing its API contract merely to rename a token. Never tell the user to buy cryptocurrency for this testnet app.

Make **Hauntboard pays the posting fee** the preferred longer-term ordinary-user experience. Investigate it before promising it:

1. Compare a sponsored submission service with a sponsor-funded browser-wallet allowance. Prove the chosen approach on isolated localnet using the pinned SDK/runtime; do not assume a stock Sapient API supports sponsorship or delegated approval.
2. For a submission service, keep the browser responsible for sealing private message bodies and preserve the exact intended public bytes/ciphertext. Constrain the service to the configured board's allowed post/reply methods, payload sizes and fee limits. Its funding key is separate from participant wallets and never ships to browsers.
3. For wallet allowances, verify that funds arrive in a usable form, existing change does not immediately strand them again, and replenishment cannot multiply on retry. Distinguish an allowance from direct sponsorship in internal accounting.
4. Specify testnet funding source, per-operation and daily caps, concurrency limits, abuse controls, replenishment, and how stored operation records survive a restart. Set concrete budgets before funded validation or rollout.
5. Document the additional trust and privacy effects: the sponsor may observe requests and metadata; on-chain histories remain observable. Sponsorship does not create anonymity.
6. If sponsorship is unavailable, show “Free posting is temporarily unavailable. Your draft is saved.” Offer a clearly selected self-funded option only with its fee and consent. Never silently fall back to charging the user's wallet.

The app-paid acceptance criterion is that an ordinary user's personal balance can be zero and a permitted post still succeeds. If neither design is feasible within the current architecture, record that blocker and retain the improved self-funded experience without labeling it free.

### D. Be honest about extension approvals

Stock Sapient currently requires user approval in the extension, as recorded in [the supported integration](stock-sapient-posting.md). Removing Hauntboard's review dialog cannot remove that approval.

- Keep Sapient as an explicit wallet choice and show **Approve in Sapient** when waiting for it.
- For the selected Sapient path, explain before Post that the extension will open.
- Do not switch to another wallet to bypass an unresolved approval or submit attempt.
- Deliver the no-wallet-popup ordinary-user route through a supported browser-local signing flow or the validated app-paid route. Any session authorization must be bounded, explicit and supported by the signing method; it is not permission to hide fees or retain keys on the server.

## 4. Implementation workstreams

### P0 — establish a correct readiness result

Create one posting-readiness service consumed by the composer, balance panel and submission code. Its result should bind to the selected wallet, network/reset, funding policy and draft revision, and include:

- Status and stable reason code, rather than a raw RPC error used as product copy.
- Verified eligible amount and whether the exact draft can be funded; total holdings remain a separate value.
- Balance-check timestamp, provider/discovery availability and scan completeness.
- Actual quoted fee or an explicitly unknown fee. For Sapient, distinguish the app's request ceiling from a fee quoted/approved by the extension.
- Existing operation reference, where applicable, and the one appropriate next action.

Required states: `checking`, `ready`, `wallet-required`, `unlock-required`, `approval-required`, `funding-needed`, `preparation-needed`, `change-held`, `insufficient-eligible-funds`, `pending-operation`, `provider-unavailable`, `wrong-network`, `unsupported-asset` and `capacity-reached`.

Implementation tasks:

1. Select the posting adapter first. Read/display the selected wallet's state. If Sapient does not expose the needed private-funds information, show “Checked by Sapient when you approve”; do not show another wallet's balance or invent a numeric zero.
2. Reconcile existing operations before selecting another input. Refresh incoming hints and verified known outputs, with bounded discovery work when needed. Share that result with the UI instead of running independent checks that contradict each other.
3. Treat incomplete scanning as an incomplete inventory, not automatically as unusable known funds. A verified eligible input may still support a post; missing discovery must not justify claiming the entire wallet is empty.
4. Retain last verified amounts on provider failure, visibly marked with their age. Failed checks yield `provider-unavailable`, never zero.
5. Replace the fixed greater-than-one-token simulation prerequisite with fee estimation and input selection validated against the actual transaction shape and supported runtime. Keep explicit fee ceilings. If a single eligible input is still required, state that constraint and test it rather than silently totaling unusable fragments.
6. Evaluate eligibility under the selected change policy. Include known spent outputs, reservations, account preparation, output capacity and actual fee coverage in the reason.
7. Verify native asset/resource and network identity. Match browser records to the pinned reset; note stock Sapient's documented reset-binding limitation rather than claiming equivalent verification.

Primary files: [`app.mjs`](../web/app.mjs), [`browser-wallet.mjs`](../web/browser-wallet.mjs), [`output-ledger.mjs`](../web/output-ledger.mjs), [`sapient-wallet.mjs`](../web/sapient-wallet.mjs), [`wallet-options.mjs`](../web/wallet-options.mjs) and [`stealth-fee.mjs`](../web/stealth-fee.mjs). A new `posting-readiness.mjs` can centralize the shared decision logic.

### P0 — make repeated clicks harmless and recovery automatic

1. Acquire a posting-intent guard at the beginning of the submit handler, before asynchronous encryption, key lookup or fee checks. Set the button's progress state immediately; release the guard only through defined state transitions.
2. Assign a stable intent/draft revision and retain the thread UID or reply nonce through preparation, checks and recoverable interruptions. Do not generate a fresh logical post every time the user checks readiness.
3. Keep one in-flight readiness check per intent. Discard late results after wallet, network, draft or policy changes.
4. Use cross-tab coordination around the pending journal and input reservation, building on the existing wallet lock. Do not rely solely on a page-local boolean.
5. Before dispatch, durably record the native transaction identity, exact signed bytes, input reservation, intent and network/reset. For Sapient, retain the existing request ID and attempted-submit state. Make recovery handle partial records across browser storage and relay journals.
6. Reconcile timeouts, lost acknowledgements, reloads, missing provider data and extension interruptions against the original operation. Poll with bounded backoff and offer **Check status**. A 404 or timeout is not proof that a transaction failed.
7. Distinguish full acceptance, fee-only acceptance, finalized rejection without a spend, and unknown outcome. Fee-only acceptance may consume funds even though the post failed; reconcile its outputs and show the actual fee. Do not automatically submit a new paid attempt.
8. Mark a post published only after finalized acceptance; show **Posted — appearing in the conversation…** while indexing catches up. Preserve pending records until the message is resolved and located.
9. Clear drafts only after the intended post is confirmed and located. Preserve current sealed-draft protections: do not add plaintext private drafts or room keys to ordinary localStorage, sessionStorage, logs or analytics. If sealed-draft recovery is added, encrypt it locally.

Primary files: compose/reply handlers, `review()`, `publish()`, `finishTransaction()` and `operationError()` in [`app.mjs`](../web/app.mjs); browser/Sapient adapters; [`lib/relay.mjs`](../lib/relay.mjs). Existing exact-envelope and nonce-based idempotency protections remain required.

### P1 — deliver the simpler composer and usable balances

- Replace app review dialogs for ordinary posts/replies with inline fee/readiness details and one publishing action.
- Implement the explicit Standard/change-isolation setting and migration described above.
- Move preparation/funding recovery into the composer and return to the same draft after completion. Keep wallet management available separately.
- Show a useful default summary: **Ready to post**, the selected funding method, and its fee. Put balance categories and output mechanics under **Details**.
- Render every blocked state with an explanation and a relevant action. Never send a funded user to the faucet merely because held change is excluded.
- Show inline setup/unlock progress and restore keyboard focus. Use accessible live status updates without announcing every poll.
- Update [`index.html`](../web/index.html), related styles, [`about.html`](../web/about.html), [`forums.html`](../web/forums.html) and README instructions together so guidance matches the actual flow.

### P2 — validate and deliver app-paid posting

Complete the sponsorship feasibility and budget work in section 3C, select one design, then implement its restricted funding/submission path behind a feature flag. Keep the improved self-funded path available by explicit choice. App-paid rollout depends on successful funded-path and abuse-limit validation; it is not a prerequisite for shipping P0/P1.

## 5. Proposed interface copy

Amounts below are examples or interpolated values, not live quotes. Show policy-specific messages only when the corresponding implementation exists.

| Situation | Message | Action |
| --- | --- | --- |
| Ready, app pays | “Hauntboard pays the network fee.” | **Post** |
| Ready, browser wallet pays | “Network fee: {fee} test TARI, paid from your browser wallet.” | **Post** |
| Sapient selected | “Sapient will ask you to approve this post and its network fee.” | **Post**, then **Approve in Sapient** status |
| Checking | “Checking whether your funds can cover this post…” | Progress indicator |
| 99 held as change | “You still own 99 test TARI. Your current setting holds these tokens aside to reduce links between posts.” | **Use remaining tokens**, with the explicit setting explanation |
| Standard account funds | “Your tokens need to be prepared before this app can use them. You will see the network fee before confirming.” | **Prepare posting funds** |
| Confirmed incoming payment, not yet discovered | “Your test tokens arrived. Checking them for posting…” | Automatic verification; **Check again** if delayed |
| Existing submission | “Your post is still being checked. You do not need to post it again.” | **Check status** |
| Provider unavailable | “We could not check your funds right now. Last checked: {time}. Your draft is saved.” | **Try again** |
| Wrong network | “This wallet is connected to {actual}. Hauntboard is using {expected}.” | **Switch network** instructions |
| Verified insufficient usable funds | “This post needs {fee} test TARI. This wallet can currently use {eligible}.” | **Get free test tokens**, or a more specific preparation/held-change action |
| Fee charged but post rejected | “The network charged {fee}, but did not publish this post. Your draft is saved.” | **View details**; a new attempt requires an explicit Post action |
| Accepted, awaiting indexing | “Posted. Waiting for it to appear in the conversation…” | **Check status** |
| Published and located | “Your post is published.” | **View post** |

Do not use “no funds” for unknown balances, held change, a pending operation, an unsupported asset, or funds in another wallet. Avoid UTXO, revealed balance, stealth output, quarantine and reconciliation in the primary user flow; keep technical details available for diagnosis.

## 6. Verification and acceptance criteria

Run implementation toolchains and browser tests in containers, following repository instructions. This planning change does not need runtime tests; the following checks are required for the later implementation.

| Scenario | Required result |
| --- | --- |
| Fresh funded wallet, then two consecutive posts | One Post action per ready draft. Both publish without another faucet request when usable funds cover both. |
| 100-token input, one accepted post, approximately 99 remaining | Remaining funds are accurately accounted for. Standard mode can use verified change; isolation mode explains the hold and provides the explicit policy action. |
| Existing isolated wallet upgraded | Privacy policy and pending state survive. Change is not silently released. Recovery scanning respects the recorded policy. |
| Funded standard account, no posting outputs | Preparation is offered inline with its own disclosed fee/confirmation; the original draft survives. No “empty wallet” message. |
| Positive ready total composed of small outputs | UI and selector agree on eligibility. Either the supported selector can pay the actual fee or a precise limitation/action is shown. |
| Incoming funds omitted from general output listing | Verified receipt hints/discovery find owned funds; the same posting intent becomes ready without repeated clicks. |
| Incomplete scan with a known verified usable input | Posting can proceed if all other checks pass. Incomplete inventory remains labeled honestly. |
| Browser wallet funded, connected Sapient unfunded | App displays Sapient as the posting method and does not present the browser balance as evidence that Sapient can pay. |
| Rapid clicks, Enter plus click, slow payload encryption, two tabs | One logical intent and at most one dispatched paid operation for that intent; no duplicate post or input reservation. |
| Slow provider, late balance result, wallet switch | Stale results are discarded. A failure is never rendered as a verified zero. |
| Lost acknowledgement, reload, relay restart, provider 404 | Original operation is retained and reconciled; no replacement signed spend is generated while its outcome is unknown. |
| Fee-only acceptance or finalized rejection | Correct fee and input/output disposition; draft retained; no automatic paid retry. |
| Fee rises, quote expires, reply page rolls over | Recheck against the authorized amount and intended bytes. Any necessary new consent is inline. Unresolved signed work is reconciled first. |
| Finalized post not yet indexed | UI says the post was accepted and is appearing; Post does not become an invitation to duplicate it. |
| Sealed post interrupted | No plaintext secret content enters ordinary draft storage or diagnostics; supported encrypted recovery preserves required keys. |
| Sponsored route, personal balance zero | Permitted post succeeds within sponsor limits; sponsor outage never silently charges the participant. |
| Sponsor limits, arbitrary methods/targets, duplicate requests | Disallowed calls are rejected, budgets enforced and identical retries reuse the original operation. |

Extend the existing `wallet-balance.mjs`, `fresh-wallet-flow.mjs`, `output-ledger.test.mjs`, `stealth-fee-privacy.test.mjs`, `sapient-wallet.test.mjs`, `faucet-discovery.test.mjs` and `relay-reconciliation.test.mjs` coverage. Add targeted readiness and posting-intent tests where the existing suites do not cover a boundary. The current fresh-wallet flow exercises a first post; explicitly add the second-post/change case.

Use Chromium and Firefox at desktop and narrow mobile-sized viewports. Check keyboard submission, focus return and screen-reader status updates. Use actual supported devices for any mobile compatibility claim. Validate real spending separately on isolated localnet; a mock extension is not funded Sapient evidence. Any public testnet spend needs an explicitly approved target/account/budget.

Release gates:

- Zero duplicate messages or duplicate paid operations in the rapid-click and interruption scenarios. Relaying the same saved transaction again must never become a new spend.
- No verified-empty message during incomplete/unavailable discovery.
- Displayed wallet and funding method always match the submission adapter.
- Button enters a visible progress state within 100 ms in the browser test; finality/indexing timings are measured separately, without an instant-posting promise.
- At least four of five participants unfamiliar with crypto complete two successive ready-state posts without assistance and can explain any displayed charge. Record failures and fix blocking confusion before broad rollout.
- Existing privacy guarantees are not broadened, and compatibility/evidence flags remain honest.

## 7. Delivery order and measurement

1. **Investigate and reproduce:** build deterministic fixtures for each 99-total/zero-ready explanation, active-wallet mismatch and delayed discovery. Record the incident's exact cause only if a privacy-safe diagnostic establishes it. Repeated-click success alone does not identify the cause.
2. **Ship P0:** shared readiness, truthful errors, early intent guard, stable IDs and interruption recovery. Include the second-post regression before release.
3. **Ship P1:** inline Post/Reply, explicit change policy, preparation recovery and consistent token names. Confirm two consecutive posts in usability checks.
4. **Ship P2 after feasibility:** app-paid posting with a funded validation record, explicit limits and operating ownership.

Measure the steps from first Post intent to submission, finalized result and indexed visibility separately. Track coarse readiness reason counts, repeat clicks while busy, first-post success, second-post success, time spent blocked on funding, and unresolved-operation age. Compare release cohorts; set latency targets after collecting a baseline.

Diagnostics must be optional or follow the project's established consent model. Use coarse reason codes and timing buckets. Exclude message text, sealed payloads, keys, recovery words, wallet addresses, output identifiers and signed envelopes from ordinary analytics. Keep any user-initiated support export minimal and clearly described; do not create a new cross-wallet tracking identifier.

Deploy client behavior behind appropriate flags with a rollback path that preserves board/template addresses, wallet records, output provenance and pending journals. Do not roll back to code that interprets newly eligible change unsafely; maintain storage compatibility or disable the new policy while preserving records. These UI/wallet improvements should start without a contract migration. Any later need for a new sponsored contract must be separately justified and authorized.

The work is complete when ordinary users can post twice without wallet confusion or repeated clicks, every funding block has a truthful explanation and working action, interrupted operations recover without another spend, and any promised app-paid route succeeds with no participant funds.
