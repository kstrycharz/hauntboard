# Fresh public wallet flow — October 12, 2026

Target: https://hauntboard.taritracker.com, existing Esmeralda board.

A new native Tari wallet was generated through the actual mobile-width Chromium UI, using a randomly selected PIN. Its 24-word recovery confirmation completed. Reload and PIN unlock preserved the same receive identity. A second clean browser recovered the same wallet through the UI using a separately chosen PIN.

The normal 500-token claim stopped at the frontend balance check. No /api/faucet-submit request was made, and no new public post was submitted. Funding was therefore a prerequisite blocker for testing new-wallet posting.

To distinguish an app-only guard from a network restriction, a separate isolated browser used the same validation wallet with only the balance guard bypassed in a test-served module. It retained the real provider state and submitted only the real transaction dry-run. Every faucet submission endpoint was explicitly blocked in that diagnostic browser.

Tari's dry-run rejected the fee-instruction claim with ExecutionFailure / InsufficientFunds at instruction 3: required 1000000000 microtari; available 999651320 microtari. This confirms that the deployed network's take() flow requires the 1,000-token withdrawal and cannot process this claim at the observed balance. The tagged v0.45.0 builtin faucet source independently defines this fixed amount: https://github.com/tari-project/tari-ootle/blob/v0.45.0/crates/template_builtin/templates/faucet/src/lib.rs.

Outcome: wallet generation, recovery confirmation, persistent PIN unlock and fresh-browser recovery passed; real funding and subsequent posting remain blocked by the faucet's revealed balance. Existing posts and their on-chain links were validated separately. This is not a successful funded end-to-end posting test.

Recovery words, PIN, encrypted browser storage and diagnostic details are retained only in the protected Docker volume hauntboard_fresh_wallet_validation_20261012 on the validation host, with private files restricted to mode 0600. None are copied to this repository, the public VPS or chat. The user's previously shared phrase was not used. The test refuses to overwrite an existing validation wallet; use a new private volume for a new run and reconcile existing signed operations separately.
