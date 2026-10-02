# Funding plan: automated tests, public testnet, and production

Date: October 2, 2026. Status: FUND-01 policy, ledger, released-wallet adapter and local bootstrap job implemented; TEST-01 engine and full local-wallet profiles execute successfully. There are 42 funding/RPC/adapter tests and six faucet-funded engine tests. Actual isolated wallets demonstrate faucet bootstrap, private reward/memo recovery, receiver spend and restart recovery. Original receipt publication/call and the final M2a review remain open, as does M2b public proof. See [local wallet evidence](evidence/m2/local-wallet.md) and [engine evidence](evidence/m2/funding-engine.md). Owner direction: automated transaction tests use faucet funds; preserve a production path. Mainnet spending and publication remain outside this work.

## 1. What the faucet actually does

The [official wallet guide](https://ootle.tari.com/guides/setup-a-wallet/) documents a faucet claim and distinguishes an initially empty public-testnet faucet from a funded local-network faucet. The [v0.43.0 wallet handler](https://github.com/tari-project/tari-ootle/blob/v0.43.0/applications/tari_walletd/src/handlers/accounts.rs) exposes `accounts.get_faucet_balance` (including `claim_amount`) and `accounts.create_free_test_coins` (`account`, `max_fee`). The latter requires Admin, builds a faucet withdrawal and fee payment, and reports empty/already-claimed outcomes. A locally created account can bootstrap without an existing on-chain fee balance. The source fixes the claim at 1,000 TARI; confirm deployed base units and `claim_amount` before building a request. A claim is a transaction, not an unrestricted mint or an arbitrary-size refill API.

Recorded evidence at 16:47:39 UTC on October 2 showed `empty` through both research wallets. No claim was submitted. This supports an availability observation, not a demonstrated failed claim. Earlier reporting overstated that observation as a project-wide blocker. Public funding remains unproved, but local tests and independent engineering can progress.

No additional public faucet endpoint was verified in this review. Do not assume a Discord bot, L1 faucet, old tutorial or generic faucet site funds the same Ootle network. Recheck current official sources and runtime identity when executing; do not treat the recorded read as permanent availability.

## 2. Environments and funding ownership

| Environment | Funding source | Automation and ownership | Evidence meaning |
|---|---|---|---|
| Unit/UI tests | None; typed fixtures | Every PR, no wallets or network | Logic and interface behavior only |
| Engine/template tests | Official harness faucet helpers | Every relevant PR in Docker; isolated state per test | Real engine execution, no public consensus proof |
| Local integration network | Built-in faucet funded by supported local genesis/bootstrap | Docker-only independent sender/receiver; reset isolated CI state per job | Wallet, service, chain and recovery integration on a controlled network |
| Public Esmeralda integration | Public faucet claims, optionally a dedicated reserve previously funded by that faucet | Protected workflow, reused test identities, bounded job allocation | Actual public-network compatibility, privacy and receiver-spend evidence |
| Publicly deployed testnet beta | Dedicated operator fee/reward wallets funded from faucet-origin tokens | Operator funding job, separate from CI and visitor endpoints | Public service with testnet disclosures and live gates |
| Future mainnet production | Owner-funded treasury, bounded operational wallets | Approved treasury transfers; faucet capability disabled | Real-value service under a separate mainnet launch gate |

“Production deployment” and “mainnet” are separate settings. The October production-engineered beta is still Esmeralda. Testnet tokens, claims, room components and keys do not become mainnet assets by changing a URL.

All chain-executing automated tests use faucet-origin funds. Pure logic/UI tests retain fixtures and need no faucet. Mainnet deployment checks are read-only health/configuration checks; automated transaction regression stays on localnet/testnet.

## 3. Funding configuration and service boundary

Add a small internal funding module/job, separate from the payout API. Its adapter exposes `inspectFunding`, `prepareFaucetClaim`, `submitFaucetClaim`, `reconcileFunding` and `allocateTestBudget`. These are proposed application methods, not upstream RPC names. There is no visitor-facing faucet route and no faucet Admin token in the web app or ordinary reward worker.

Required validated configuration:

| Setting | Contract / default |
|---|---|
| `APP_ENV` | `development`, `ci`, `staging`, `production`; independent of network |
| `NETWORK` / `NETWORK_INSTANCE_ID` | Explicit verified network and deployment/genesis identity; byte/name alone cannot detect a reset |
| `EXPECTED_NATIVE_RESOURCE` | Resolved from the selected deployment and verified before funding |
| `FUNDING_PROVIDER` | `local-faucet`, `public-faucet`, `treasury`, or `disabled`; never infer from missing secrets |
| `FAUCET_ENABLED` | Only true on explicitly allowed localnet/Esmeralda; mainnet rejects true at startup |
| `FUNDING_AUTOMATION_ENABLED` | False until the environment's target accounts and budget are configured; enabled for isolated CI bootstrap by its checked-in test policy |
| `FAUCET_ADMIN_TOKEN_FILE` | Secret-file reference available only to funding job; short expiry, restrict network access, revoke after bootstrap when practical |
| `FEE_ACCOUNT`, `REWARD_ACCOUNT`, `CI_RESERVE_ACCOUNT` | Separate purpose-bound targets; independent receiver for privacy proof; never share CI/mainnet seeds |
| `FAUCET_MAX_FEE_BASE_UNITS` | Required positive integer decimal string; measured/pinned per environment; no guessed fee default |
| `MAX_CLAIMS_PER_ACCOUNT_INSTANCE` | Default 1; respect actual deployed eligibility; account/network reset handling requires evidence |
| `MAX_PUBLIC_CLAIMS_PER_RUN` | Default 1 across the workflow; additional predefined independent targets require an explicit capped policy |
| `MAX_RUN_SPEND_BASE_UNITS`, `MAX_DAILY_SPEND_BASE_UNITS` | Required integer caps covering fees and transfers; persisted reservations prevent concurrent overspend |
| `FEE_LOW_WATERMARK`, `REWARD_LOW_WATERMARK`, `TARGET_BALANCE`, `HOT_WALLET_CAP` | Base-unit strings per purpose; reject inconsistent thresholds and targets above cap |
| `READ_RETRY_LIMIT`, `READ_RETRY_MAX_SECONDS` | Defaults 3 attempts / 60 seconds total with jitter; applies only to safe reads |

Resolve token decimals from the verified resource metadata. Convert readable amounts exactly using integers; reject overprecision, overflow, wrong network and wrong resource. Calculate required funds as reserved in-flight spend + measured suite cost + bounded fee reserve. A nonzero wallet balance is insufficient if it contains unusable/revealed inputs or cannot pay the required fees.

A fixed-size claim may exceed the desired top-up. Check the entire projected credit against policy, not merely the balance gap. Use a capped faucet-funded CI reserve for allocations where permitted; do not loop claims or create public accounts to circumvent eligibility restrictions. Reserve transfers are testnet transactions and count toward spend/fee limits.

Faucet Admin scope is a release-specific constraint. Use an ephemeral isolated job credential with the smallest practical lifetime; do not pretend an upstream faucet-only scope exists. Funded shared/persistent environments require real operator authentication. Disposable local CI may use test-only credentials inside an isolated network; the current auth-disabled public preflight must remain unfunded.

## 4. Faucet bootstrap and reconciliation

1. Verify runtime authentication, network instance, resource, target account ownership and configured caps. Create local test accounts using the released wallet API; check local account identity before any claim. Source credentials from isolated CI secrets or local ephemeral test setup.
2. Read existing spendable balance and persisted funding history first. Reuse enough existing faucet-origin funds; do not claim on every test run.
3. Read faucet balance and claim amount. Require `balance >= claim_amount`, not merely a nonzero balance. Distinguish empty, missing faucet, read failure, wrong network and already-claimed. Verify the deployed faucet's eligibility/claim record where supported.
4. Reserve the claim operation and budget durably, keyed by network instance + account + purpose. Use one funding lease per account. Validate the complete fixed claim and maximum fee. No recipient address or private reward details in public evidence/logs.
5. Submit one `accounts.create_free_test_coins` request using the approved environment policy. Initial bootstrap does not require separately prefunding the fee account, subject to runtime proof of the released claim path. The claim endpoint has no assumed dry-run field: validate actual supported estimation or use a pre-established bounded cap, and record actual fees afterward.
6. Persist transaction identity when available, reconcile final result, then verify the wallet's actual spendable balance. A successful RPC response alone does not satisfy the funded-state check. If the connection drops before returning an ID, inspect the account-linked wallet transaction history and claim state; do not resend while the outcome is unknown.
7. For private-transfer tests, prepare verified concealed inputs through supported native wallet operations. Faucet acquisition itself may be publicly linkable and is not proof of payment privacy. Inspect real inputs, outputs, memo, fees and change.

Funding states: `unfunded → inspecting → eligible → claiming → funded`; terminal/actionable branches: `empty`, `ineligible`, `unavailable`, `rejected`, `unknown`, `budget_exhausted`. Persist state across process restart. An unknown claim remains unavailable for fresh claims until reconciled. Re-read after a known empty/eligibility result only under the bounded retry/run policy; never retry a mutation as if it were a read.

## 5. Automated test policy

**Every PR:** current fixture tests plus deterministic crypto/API tests as implemented. Engine/template tests use the official harness's faucet facilities; follow the [template testing guide](https://ootle.tari.com/guides/testing-templates/) and validate pinned harness/library compatibility. These do not require public faucet access.

**Local integration:** add a separate container profile that starts a supported pinned local network with a funded built-in faucet, two independently keyed wallets, and Hauntbox services when available. Avoid requiring a full local chain for frontend-only changes. Record faucet genesis state and network identity; test real claim, fee deduction, private transfer, receipt publication/call, receiver spend and restart recovery. Use disposable local volumes with explicit cleanup boundaries; never reset public or operator wallet data. The harness is the first usable test layer if full local-network bootstrap is still being resolved; do not label harness-only tests full-network E2E.

**Public integration:** protected manual workflow initially, eligible for scheduled CI after implementation and owner configuration. No scheduled task is created by this plan. Secrets are unavailable to fork PRs. Serialize use of a small persistent faucet-funded reserve and public identities. Read existing funds, claim only when eligible and needed, reserve a bounded suite budget, run the same core scenarios, then reconcile all pending work and publish sanitized evidence. Reclaim/reuse test funds through bounded transfers where supported; do not farm the public faucet.

**Failure reporting:** public faucet exhaustion or outage produces `BLOCKED_INFRA` with a dated reason, not a passing live test and not a regression in unrelated deterministic tests. The required public release check remains unsatisfied. Auth/type/assertion/privacy failures are test failures even if another funding check is unavailable. Run independent local tests in either case. Do not catch all wallet errors as “faucet empty.”

Mandatory tests: enough existing funds means zero claims; successful bootstrap from zero; insufficient faucet balance including positive balance below claim size; missing faucet; already claimed; concurrent jobs; restart after submit; timeout before transaction ID; revoked/expired credentials; excessive fixed claim; exhausted daily cap; wrong network/resource/instance; claim fee accounting; public response/log redaction; mainnet rejects faucet config and makes zero faucet calls. Fault fixtures exercise error handling; at least one actual local faucet claim must fund the end-to-end suite. Required public releases also need an actual public test run.

## 6. Keep engineering moving without weakening release evidence

Split feasibility into **M2a local capability** and **M2b public-network proof**. M2a requires pinned compatible artifacts, engine tests and local two-wallet claim/transfer/receiver-spend/receipt behavior with sanitized evidence. The unfunded preflight and disposable authentication probe do not yet pass M2a.

Funding/test infrastructure and deterministic crypto/API/schema work may start now using explicit provisional interfaces. After M2a passes, M3–M5 may proceed against the pinned local network while M2b continues. Keep version-specific wallet code behind the adapter; revalidate against public runtime before launch. M2 remains incomplete until M2b passes. Public deployment/release and any live privacy claim remain gated on M2b plus the existing security, recovery and UX gates. This supersedes the blanket instruction to stop all backend work while the public faucet is empty.

If the public faucet cannot fund an eligible claim: retain exact source/runtime/error evidence, continue local tests, prepare an operator-facing request for official faucet replenishment, and review the public release schedule. Sending a support request is a separate explicit action. Do not silently switch to purchased funds, L1 burns or mainnet funds. Existing faucet-origin reserve use stays within faucet-only funding. Localnet is a development/testing target, not public-testnet release evidence.

## 7. Production funding and migration

For the Esmeralda beta, use operator-controlled fee/reward wallets and a separate faucet funding job. Protect enough fee reserve for reconciliation and existing work; pause new intake when anchoring is unaffordable, and disable new reward quotes when reward capacity is insufficient. Keep saved receipts/status views available. Show participants accurate availability; show funding details only to the operator. Refill only within the configured policy and actual faucet eligibility.

For future mainnet, the same balance/reservation/reconciliation interfaces use a **treasury provider**. Fund limited operational wallets from an owner-controlled treasury; the app has no treasury root key. Define sponsor budget, replenishment approvers, maximum hot balance, daily limits, fee reserve, alert owner and reconciliation ledger before launch. Begin with deliberate reviewed top-ups; bounded automation may follow a verified operating policy. Do not assume a bridge, purchase or burn as the funding source: choose and verify a supported mainnet acquisition/deposit path separately. Faucet fields and test credentials are rejected in mainnet configuration and excluded from the production funding job.

Mainnet migration checklist: supported released network/runtime; separate reviewed custody/threat model and financial operating budget; fresh keys and authenticated secret rotation; verified native resource/denomination and new template/component manifest; restore and incident drills; closed/reconciled testnet jobs; independent security review; owner-approved first funding and deployment targets. Keep the historical beta read-only or separately labeled; never reinterpret testnet receipts as mainnet receipts. Do not copy CI wallet databases or private keys into mainnet. Mainnet remains outside the October implementation scope; this is its architectural path.

## 8. Delivery packages and exit criteria

| Package | Scope / dependency | Completion evidence |
|---|---|---|
| FUND-01 | First: network/config validation, funding state machine, faucet provider, fixed-claim/fee/budget controls | Zero-balance bootstrap and negative/concurrency/recovery tests; no secret leakage; mainnet rejection |
| TEST-01 | In parallel with FUND-01: pinned engine/harness then local-network faucet profile | Reproducible container command; actual faucet-funded independent wallets; private transfer/spend and original receipt tests; M2a report |
| FUND-02 | FUND-01 + TEST-01: protected public funding/test workflow and operator beta funding | Eligible public claim or reused verified faucet-origin funds; bounded test run; receipts/fees/receiver/public-observer evidence; M2b report |
| FUND-03 | Before beta deployment: low-balance behavior, operator status, alerts and refill runbook | Intake/payout pause tests; reservations honored; no duplicate claim or reward after recovery |
| PROD-01 | Future mainnet planning only | Treasury/custody policy, hard faucet disablement, migration/launch checklist and independent review; separate implementation authorization |

Immediate next work is FUND-01 and TEST-01, with public eligibility investigation inside FUND-02. PM-00 trials continue independently. Re-estimate the existing M2/infra/QA allowance after the first local claim and test-harness build; record any added container-build time rather than hiding it in frontend polish. Acceptance of this document does not mark any implementation package complete.
