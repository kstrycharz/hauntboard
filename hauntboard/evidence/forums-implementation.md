# Forum categories and capacity

Historical release record below. Release 0.6.6 retires Crypt, makes General the default and connects a freshly deployed board. See `forums-refresh.md` for the current behavior and verification.

The Crypt, /tari/, /general/ and /pol/ are categories in the existing schema-4 board. Each thread is already a separate component created by the board; each thread's pages hold at most 16 posts. New opening payloads include a category field on chain. Existing or unsupported category metadata is displayed in The Crypt. The current template does not enforce a category registry.

The new /forums page explains the directory → thread → post-page structure, data locations, public text and privacy limits. It documents the actual shared 128-thread board cap, 2,048-post thread cap and 4,096-byte payload cap. Categories do not multiply directory capacity. Automatic board rollover and separate directory components for each category are not implemented.

Chromium and Firefox forum checks passed at 390px and 1280px against a staged application connected to Tari Esmeralda. Checks cover category links/navigation, posting-form defaults, draft recovery, category payload encode/decode, documentation and horizontal overflow. No chain writes were made. The mobile documentation screenshot was inspected.

Candidate image: sha256:84d6b1e4e59475e0482b16b0ae93dbea267d79560989f6f40dfd1f3a0b517daf, tag 0.6.3-forums. This standalone candidate was superseded by the combined wallet/forum release. Live image at the earlier coordination check was sha256:527f5d31e45cabe516aa0e9d46526a82852910bf569d858ee9d19aa5c59128c7 (0.6.1-gui).

Deployment was coordinated with the chat editing wallet PIN/reset controls in the same files. Shared remote build directory was discovered during staging; future snapshots should use a dedicated directory or a single release owner. The wallet task owned the combined release from an isolated pin-build snapshot.

An additional wallet-balance regression timed out in its reload phase against the overlapping PIN candidate. Direct creation and real zero-balance reads succeeded, and forum checks passed. This is not recorded as a successful complete wallet regression. The wallet task fixed the older-password input migration and validated the integrated PIN/reset flow before deploying.

Official references: https://ootle.tari.com/reference/fees/ and https://ootle.tari.com/reference/limits/. Contract-specific limits above come from template-public/src/lib.rs, rather than assumed network-wide capacities.

Combined release deployed with image sha256:e5c08d722a730fa45df408563bd889c5872c6be9a247f9133e67ca06c6216227. This task independently verified the public HTTPS /forums page, category navigation, posting defaults, draft recovery, category payload encoding and mobile/desktop layout in Chromium and Firefox. Both public checks passed; readiness returned ready. No public posts or funding actions were made. Live page: https://payroll-levels-sensitivity-bit.trycloudflare.com/forums. This task's validation container was removed.
