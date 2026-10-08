# Native Tari wallet creation

New participant wallets use standard Tari CipherSeed v2 phrases. The separate Hauntboard phrase option was removed at the owner's request because no participant had created one. Recovery defaults to native Tari format; optional original seed passphrase, account index and receive-address verification remain available.

The WASM adapter calls the released Tari `CipherSeed::random` and official mnemonic encoder. Cryptographic randomness comes from the maintained getrandom browser backend. The birthday is normalized to days since 2022-01-01, matching native Tari wallets. Owner and view derivation remain official Tari code. New phrases require confirmation before funding or posting.

Deprecated BIP39 decoding remains an explicit internal compatibility path for protected deployment/validation records. It is unavailable in participant onboarding and does not generate new wallets.

Chromium and Firefox creation checks passed against the staged app. A native Rust verifier independently decoded both browser-generated unfunded phrases, verified owner/view keys and checked wallet birthdays. Tests preserve seed words only in ignored unfunded fixture files, never public receipts or logs. No transfers, faucet claims or board posts are made by these tests.

Wallet adapter SHA256: `355b477039dfe19d007398383ae816b2eccaa330b1bb912ea0049c611858277e`.

Release 0.5.9 deployed successfully with image sha256:3ce7aaeb4597b2d7100f48a6f06c0a166cb8c70ff4fedf54f199cef253f31cca. Public HTTPS creation/recovery passed in Chromium and Firefox; readiness returned ready. Native import and wallet balance regressions passed in both browsers on staging. Existing public tunnel retained.
