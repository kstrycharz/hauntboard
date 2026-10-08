# Esmeralda deployment — October 7, 2026

Status: **contract published, public board created, and frontend wallet application activated on the actual Tari Esmeralda testnet**. Public posting privacy verification remains pending; the owner is testing with their own frontend wallet.

## Confirmed deployment

- Template: `f6773b90f8919097266a73e6c68e343724e2a4bdaf248f01e11b463bbc4e0b2d`
- Board: `component_ff8fd992a498d7c9b32e96fb8cb557029d2f96dbb033ae61932b45cbf9187a4b`
- Template publication transaction: `a285bf80b4e257187156979068ef6d8b2aaba2e6ecbe5c7f99c43317574ab67f`
- Board creation transaction: `4cea075beef93e8a5cd7203f030006c88a236d53e02c809f158378d24045811e`
- Burn claim transaction: `c9273612ae49bc78b3740cba79f8b9c2033ac86273b3f99cd24eeef892b96369`

Both Tari-hosted providers, `https://ootle-indexer-a.tari.com` and `https://ootle-indexer-b.tari.com`, returned verified board state with schema 4, version 0, the published template address, and owner rule `None`. See `esmeralda-contract.json` and `esmeralda-contract-verification.json` for receipts and independent provider checks.

The Rust template was rebuilt in Docker using locked dependencies. The resulting WASM is 141,153 bytes and matches the shipping artifact's SHA-256: `75d3ab7a2e9265e1565ddd293aa651ae7a4e7687ccc1f148d371acc0c66d9582`. All five native contract tests passed against engine 0.45 and template library 0.34. See `esmeralda-contract-build.json` and `public-contract-engine.json`.

## Funding and transaction history

The dedicated operator wallet and its recovery phrase are retained only in the protected Docker volume `hauntboard-esmeralda-operator`. No private keys or recovery words were copied into application assets or public evidence. The owner authorized faucet-origin testnet funding and contract deployment with a 100-test-TARI fee ceiling.

Both built-in public Ootle faucets were empty. A single recorded request to the community Minotari testnet faucet supplied 10,000 test XTM. The official checksum-pinned Minotari 6.1.0 wallet burned 10 test XTM to the verified deployment wallet, with an L1 fee of 0.000740 test XTM. Its native inclusion proof was retained privately.

The first claim, `a70386354c7a2a5822f133d72b37e531282a998541f1097da170176b3ef923ca`, finalized as `NotYetValid` with zero fee payment. It was reconciled before preparing the subsequent claim. The later claim listed above committed successfully after public epoch progress, creating the funded Ootle deployment account. Publication and board creation then committed using the official SDK 0.7.0 and WASM 0.43.0.

The confirmed deployment stages report required fees of 7,879, 1,000,886 and 1,861 microtari respectively. These are receipt-required fees; exact amounts paid should be taken from fee receipts rather than inferred from the script's legacy `actualFee` field. Their signed maximum fee ceilings were 8,879, 1,211,063 and 12,233 microtari, well within the authorized budget.

## Hosted application and remaining verification

The Ubuntu server at `192.168.1.200` now serves the application through the existing Quick Tunnel at `https://payroll-levels-sensitivity-bit.trycloudflare.com`. The owner clarified that they will create their own frontend wallet and the backend wallet is for contract deployment. An explicit `HAUNTBOARD_TESTNET_BETA=true` mode enables that workflow without fabricating completed verification: `compatibilityVerified` and `posterPrivacyVerified` remain false. Mainnet, older schemas, unexpected providers, invalid live network witnesses, and mismatched board templates remain rejected. Normal public release mode retains its stricter evidence gates.

The current imported application image is `sha256:6dd9573d1dd1465176ae79047e069e346b01a0e96a1623b0146ca37df2be51ff` (0.5.6). An internal HTTP gateway replaces the preview at the existing tunnel destination so its URL is preserved. No operator keys or wallets are mounted into the app. Frontend wallet creation/recovery and browser-signed posting are enabled. The removable faucet option retains 500 test TARI in four native outputs, returning unused grant principal through Tari's builtin deposit method. The UI displays verified numeric balances. It checks on-chain liquidity first and accurately explains that the shared faucet needs a refill when it cannot support the native grant. Seed-confirmation and faucet buttons remain disabled while another wallet action finishes, preventing ignored clicks. See `esmeralda-faucet-refill-incident.md` for the later 7,000-token refill operation.

Eight focused tests passed, and the standard public-profile smoke checks passed. Live hosted checks passed for readiness, readable board state, mobile create/recover controls, absence of the preview banner, actual About addresses, missing backend wallet routes, and CSRF rejection. See `esmeralda-hosted-beta.json`. These checks did not create a wallet, transfer funds, or publish content.

At 18:29 UTC, both Tari-hosted providers still returned a verified zero balance for the built-in faucet. The confirmed operator account had 8,988,374 microtari available. No individual frontend transfer was sent. The owner's later request for 500-token faucet claims superseded the proposed one-token transfer: one recorded 2,000-test-XTM burn funded the public faucet refill instead. Its proof was mined in epoch 11974. After consensus reached epoch 11975, native claim `8701fb0b7670ea016783155643899875820aa5616787564cd5f76ed0857e7f45` committed. The script's post-commit account check was corrected for an existing account whose component need not change when its vault is funded; the same committed transaction was reconciled without another burn or transfer. The protected journal retains the proof and exact transaction intents. See `esmeralda-faucet-burn.json`, `esmeralda-faucet-burn-proof.json` and `esmeralda-faucet-burn-claim.json`.

At 19:54:36 UTC, deposit `b771bc7a4cb16b81abeec7acf964cea15e8a7ce110fdf6b19dc4a8966cf771ed` refilled the builtin faucet with 2,000,000,000 microtari. The hosted frontend then claimed 500 test TARI in transaction `7ea07ec4e361e445395a9a017c34c6c77e02a753a8f320343e11fbb7bf45ba3c`, committed on both Tari-hosted providers. Verified owned outputs show exactly 500,000,000 microtari ready for posting, with total displayed balance 500,007,290 microtari including refunded fee credit. Both providers independently verified a remaining faucet balance of 1,499,961,260 microtari. The funded validation wallet's recovery is retained privately. No public test content was posted. See `esmeralda-faucet-refill.json` and `esmeralda-public-faucet-500.json`.

The hosted 0.5.5 wallet flow was exercised in a temporary isolated browser: real Esmeralda keys and a 24-word phrase were generated locally, the empty faucet was read from the live provider, and the actionable error appeared without dispatching a transaction. The unfunded browser wallet was discarded, no recovery words were recorded, and no public content was posted. See `esmeralda-hosted-funding.json`.

Automatic approval review rejected the separate public posting verification command before it ran: creating and funding another test wallet and publishing permanent verification content exceeded the contract-deployment authorization. Explicit user approval has been requested for transferring 3 faucet-origin test TARI and publishing one thread titled “Esmeralda launch verification.” No verification thread has been published by that command.

The rejected operator-funded posting test was not retried. The owner will perform frontend testing with their own wallet instead. Confirmed public transaction inspection is still required before recording public posting privacy verification or promoting the beta to a verified release. Seed recovery of actual public funds passed at 22:08:37 UTC: a fresh browser restored the retained validation wallet's same address and verified 500-token balance with a new device password, while preserving its already-claimed faucet status. Phrase and password remained local. That read-only recovery check sent no transfers, new claims or posts. See `esmeralda-public-wallet-recovery.json`. Existing posting privacy tests remain localnet evidence.

Official sources: [Publishing templates](https://ootle.tari.com/guides/publishing-templates/), [Wallet setup](https://ootle.tari.com/guides/setup-a-wallet/).

October 7 native wallet import update: release 0.5.7 accepts standard Tari L2 CipherSeed v2 phrases, their optional original seed passphrase and account index, alongside existing Hauntboard phrases. It verifies an optional original receive address before saving and discovers the standard account with public-key ownership checks. The adapter uses released Tari Rust code and generated browser bindings. Deployment image is `sha256:316c622062bbecd4f8a36596244a0fff37217fd0991a02ef2b8fc3e6c0211eea`; the existing Quick Tunnel URL is unchanged. See `native-wallet-import-implementation.md` for scope and compatibility evidence.

October 7 wallet balance update: release 0.5.8 shows the unlocked wallet's total balance in the board header and new-thread/reply forms, with the posting-ready amount when it differs. Lock/reload hides the balance and provider errors show an unavailable state. Public Chromium and Firefox checks passed at desktop and mobile widths. Image: `sha256:7988a9ae17fc024bbed82ae488ba46a621ced88beca386b2e206be4797a4b726`. See `wallet-balance-implementation.md`.

October 7 native wallet creation update: release 0.5.9 removes the proprietary Hauntboard recovery choice from participant onboarding. New wallets use standard Tari CipherSeed v2 with native birthday conventions. Native Rust independently verified browser-created keys and birthdays; Chromium and Firefox creation/recovery checks passed on the public HTTPS site. Native import and mobile/desktop balance regressions passed in staging. Image: sha256:3ce7aaeb4597b2d7100f48a6f06c0a166cb8c70ff4fedf54f199cef253f31cca. Public readiness passed; tunnel URL unchanged. See native-wallet-creation-implementation.md.
