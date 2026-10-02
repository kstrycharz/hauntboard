# ADR 003 — participant sign-in, host authority and mainnet security

October 2, 2026. Implemented for localnet/Esmeralda testnet. Mainnet requirements below are a plan, not a completed mainnet integration.

## Who does what

A **participant** submits an encrypted story and can nominate an optional payout destination. A **host/curator** creates rooms, decrypts submissions and decides which entries receive rewards. The **operator** runs the installation, manages funding and maintains the service. For the initial Hauntbox installation Kyle fills both host and operator roles. A participant account cannot read the host inbox or authorize operator actions.

The participant's payout wallet remains participant-controlled. The app sign-in account is an identity/session, not a Tari wallet or a spending key. The host's separate receipt-fee wallet pays network fees; its reward wallet holds operator-custodied testnet sponsor funds. Funding infrastructure details belong in host setup, not participant onboarding.

## Frontend testnet sign-in

Participant accounts support **PIN or passkey** directly inside Hauntbox. Host setup also offers a testnet PIN path, protected by the existing private installation bootstrap code, or the existing passkey path. Only one host can be registered. Existing passkey host credentials remain valid; the bootstrap code cannot overwrite an existing host or silently add a weaker credential.

PIN login uses a separate random 256-bit account sign-in code plus an 8–12-digit PIN. The server stores only the hashed account code, random salt and scrypt-derived PIN hash (N=32768, r=8, p=1, 32-byte output). PIN hashing has a bounded two-job concurrency limit. IP and account attempt limits apply; five incorrect account attempts lock it for 15 minutes. PINs are cleared from frontend form state after a request. PINs and sign-in codes are never logged or placed in URLs. The account code is shown at registration and must be saved privately. There is no support-assisted PIN reset or invented wallet recovery promise.

Passkeys require user verification and exact origin/RP binding. Participants use discoverable credentials without a public list of every participant's credential IDs. Participant credentials, challenges and sessions live in separate tables and a separate HttpOnly/SameSite cookie from the host. CSRF protects session mutations. PIN/passkey sign-in does not grant wallet RPC access or generate a payout address.

The account screen stores a participant's chosen payout address only in that browser. On submission it stays inside the encrypted story payload. No participant-account ID is appended to the public receipt or chain transaction. Participant sign-in remains optional for the existing capability-based submission flow; it does not establish anonymous participation or wallet ownership.

Tari's built-in Wallet UI is removed from the application user flow. The participant companion is stopped locally, with its volumes retained. Native host wallet services remain internal infrastructure; administrative publication/recovery remains a separately controlled operator task. No custom wallet cryptography is introduced.

## Mainnet implementation gates

1. **Separate application identity from custody.** Prefer participant-controlled wallet connection and a nonce/origin/network-bound ownership proof supported by a reviewed Tari client. An embedded wallet requires a separately reviewed official SDK, browser key storage, recovery and independent recipient spending proof. Do not create server-held participant keys and label the result participant-controlled.
2. **Treat a short PIN as local convenience.** The current server PIN endpoints explicitly reject mainnet. A future local wallet PIN may unlock an already securely wrapped key; it must not be the sole encryption entropy for an exportable wallet seed or sole authorization for real-value spending. Offer a reviewed recovery phrase/strong passphrase or hardware-backed key path for devices without passkeys. WebAuthn PRF support must be detected and cannot be assumed.
3. **Require transaction-specific spending approval.** Bind recipient, exact integer amount, fee cap, network and expiry to the approved intent. Validate address ownership where needed, keep signer keys isolated, and retain durable one-shot submission/reconciliation. Uncertain transactions freeze; neither account recovery nor worker restart may replay a payment.
4. **Isolate host funding.** Mainnet treasury uses separate seeds, credentials and budgets from testnet/faucet wallets. Use hardware/HSM or other custody controls only after verifying Tari compatibility. Keep a bounded hot balance, per-operation/day limits and a reviewed replenishment procedure. No visitor faucet endpoint or participant deposits enter this release.
5. **Require stronger host controls.** Define supported MFA/credential recovery, secondary-key enrollment with fresh existing authorization, administrative revocation, alerting and custody ownership. Do not enable bootstrap-based recovery after host enrollment. Prove device loss, domain migration and account recovery without wallet key loss or privilege escalation.
6. **Complete operations and independent review.** HTTPS/CSP, trusted proxy configuration and rate limits, secret rotation, backup-key custody, complete wallet/database restore and rollback, public chain privacy evidence, dependency/runtime review and an independent security assessment precede mainnet activation. Mainnet is a new launch gate, never an environment-variable change to this testnet build.

SOOON reference: [sooon.fun](https://sooon.fun/) and its publicly served application shell were inspected on October 2. The observed pattern is an in-app wallet unlock experience within its shell. This informed the integrated account UI; no third-party code, claimed custody model or security certification was copied or inferred.
