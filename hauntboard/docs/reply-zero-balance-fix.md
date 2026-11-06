# Reply feedback and zero-balance funding repair

Date: November 6, 2026

The user reported that Reply appeared to do nothing and that a newly created wallet had zero available posting funds. This repair builds on release `b17bcd5`; the reporter's browser secrets and exact wallet state were not accessed.

## Reproduction and findings

A regression using the previous application source reproduced an empty Reply action without an inline error. HTML required-field validation prevented the submit handler from running, leaving only the browser's native validation indication. The application did not explain the problem beside the reply.

The funded-wallet GUI fixture previously gave a newly created wallet synthetic funds immediately. That fixture failed to represent a real fresh wallet, which begins with no owned funds. A separate zero-balance fixture exposed the missing direct funding path beside the draft. Creating an additional wallet does not transfer tokens from an existing wallet.

Background incoming-fund checks could replace a posting-progress message with generic balance readiness. API requests and response-body reads also had no client deadline, allowing a stalled provider or server request to leave the posting action waiting indefinitely.

The Firefox regression also caught a balance-polling race that replaced an inline account-preparation quote with the generic preparation-needed state, hiding its confirmation button. The fix preserves both preparation-review and preparation-pending states across background balance refreshes.

## Changes

- Empty and whitespace-only replies show an inline explanation. Custom byte-limit validation is also surfaced beside the draft.
- Selecting a post's Reply action focuses the composer and explains that the user should write a reply, then use the form's Reply button to publish.
- A recently checked, unfunded browser wallet gets a direct funding action before expensive fee preparation. No message is submitted as part of that action.
- The composer displays an **Add free posting funds** panel for the selected empty browser wallet. Its explicit request uses the existing 100-test-TARI faucet API, receipt journal, cooldown and retry protections. It shares the receive address only through the existing disclosed funding request. No funding is automatic.
- Queued, uncertain, confirmed and failed funding states appear beside the draft. Checking incoming funds returns the user to the same draft, and a separate Reply action remains necessary to publish.
- Self-hosted clients without an enabled in-app faucet retain the external faucet link.
- Background balance updates no longer replace active posting progress. Repeated attempts receive visible feedback while the existing check runs.
- API requests, session refreshes and response-body reads have a 25-second client deadline. Timed-out writes retain their original operation/receipt and are not automatically retried or replaced.

Existing wallet keys, change-isolation choices, board/template pins and pending-operation records are preserved. No server-held participant wallet or automatic token grant is introduced.

## Verification

The new browser regression covers: empty reply feedback; zero funds with no quote or submission; inline funding without another wallet popup; reuse of one saved faucet receipt; preservation of an edited draft; discovering simulated incoming funds; and a subsequent explicit successful Reply. New-wallet fixtures now start empty, including the real SDK/WASM wallet lifecycle test.

Additional checks cover response/header timeouts, aborting stalled transport, no retry of a signed submission, and progress that remains visible across background polling. Provider execution and faucet payments in these fixtures are simulated; no public tokens are requested or spent by these tests. Public deployment verification remains read-only.
