# Posting setup and reliable balance checks

Date: November 6, 2026 (local)

This repair follows the report that checking and refreshing funds still did not help a person unfamiliar with crypto. It builds on the [thread-to-reply repair](thread-reply-change-fix.md), with changes to balance recovery, feedback, onboarding and mobile publishing.

## Balance behavior

- The wallet recognizes verified current-provider down states as spent entries, alongside the older explicit spent-input error. It retires only a matching verified spent entry; unverified state, missing data, conflicts and outages preserve wallet records.
- Balance refresh checks the original saved transaction identity before reading funds. It does not require a second relay lookup when that identity is already saved, and does not create another transaction.
- Change reconciliation builds the new ledger only after its output lookups succeed. If the provider has confirmed a post but cannot yet return its change, the original reservation and signed operation remain available for the next check.
- The UI distinguishes a pending submission from an empty wallet, including when only the native wallet's pending record remains.
- Manual checks reuse a confirmed faucet receipt. They can retry verification immediately after a failure, share any existing verification in progress, and never request another payment as part of checking.
- Discovery scans run one bounded page at a time, checkpoint progress and continue automatically. A fresh completed native stream scan can establish readiness even if the optional faucet shortcut is unavailable. The strict reset/network check on that shortcut remains intact.
- Post and Reply recheck owned funds before rejecting a cached zero. Users do not have to refresh a stale zero before trying their draft again.

## Interface behavior

- **Posting setup** opens device setup first. Sapient is an optional existing-wallet choice; installing an extension is not the first instruction shown to a new user.
- Existing users see the PIN first, with recovery options below it. New users get a clear distinction between a device PIN and the recovery words needed on another device. Recovery confirmation remains required.
- The main display says **Ready to post**, **Enable your remaining tokens**, **Checking your saved post** or **Balance check unavailable**. Detailed balances and posting settings are available under an expandable section.
- **Use my remaining tokens for posting** is a prominent explicit action for held change. It discloses the Standard posting/linkability consequence, enables the tokens and preserves the unsubmitted draft. The existing direct remaining-token Post/Reply action remains available in the composer.
- **Check posting funds** is one shared action across setup and composers. It shows progress, disables duplicate checks, reports a check time and gives an actionable result. Failure keeps the last verified amounts and allows retry.
- A held balance explicitly explains that another refresh is unnecessary; the user must enable the already-owned tokens instead.
- The composer uses a short fee/permanence disclosure, hides routine byte counts, and keeps publishing actions within reach on narrow screens. Public titles for encrypted messages remain explicit.
- Initial loading does not show an empty forum. Failed loading has its own retry state. Public testnet and privacy-verification limits remain visible in simpler language.

The user keeps the original funded wallet. This release does not create another participant wallet, grant funds automatically, move keys to the server, change the board/template, sponsor fees, remove recovery protection or make public posts editable.

## Evidence and limits

Native browser regressions use released SDK/WASM crypto, actual signed fee change and encrypted local storage. Provider responses, faucet funding and execution acceptance are simulated. They cover verified/unverified spent state, stale funding receipts, delayed change lookup, original-operation recovery, change reuse for a reply, input reservations and rejection provenance.

GUI regressions cover a stalled check, repeated clicks, discovery, provider failure retaining the last amount, immediate retry, a prominent setting-only recovery action preserving a reply, and a cached zero followed by newly received tokens. Existing preparation, unknown-submission, direct posting and recovery scenarios remain release gates.

The affected person's private wallet was not accessed. The current public provider still supports the older spent-input error as well; the typed down-state regression establishes support for the alternate response shape, not an account-specific diagnosis. Deployment and read-only public checks are recorded after the release is verified.
