# Frontend sign-in and host setup

October 2, 2026. Open http://localhost:8180/account for PIN/passkey sign-in inside Hauntbox. The production submission form is http://localhost:8180/submit. The local-chain application is http://localhost:5173/account.

## Participant

Choose **Use PIN** or **Use passkey**, then **Create an account**. PINs use 8–12 digits and must be confirmed. Save the separate account sign-in code privately; another browser needs that code plus the PIN. Passkeys use the device/browser authenticator. Neither sign-in method is a Tari wallet spending key or creates a payout wallet.

After sign-in you can save your optional same-network payout address in this browser and use it in a submission. The address remains inside the encrypted story payload when submitted. Receiving a discretionary reward does not require paying an entry fee or accessing host funding wallets.

The previous participant companion at 5103 is stopped, its named volumes retained, and there are no application links or frames to Tari's built-in wallet page. The application does not collect wallet seeds or spending keys. If an embedded participant wallet is introduced later, it must use a reviewed native SDK and explicitly define custody/recovery; do not label an operator-held wallet participant-controlled.

## Host and operator

The **host/curator** creates rooms, reads submissions and chooses optional rewards. The **operator** runs the service and manages its separate receipt-fee/reward wallets. Initially Kyle has both roles. Participants cannot access the host inbox.

Choose **Host / Curator** in the application. New setup offers PIN or passkey and requires the installation's private bootstrap code. The owner can retrieve it privately with `docker compose -f compose.production.yaml exec api cat /run/hauntbox/bootstrap-code`. Keep it out of recordings, public issues and chat. A PIN-configured host must save its separate host sign-in code before continuing. An existing host cannot be overwritten with the bootstrap code; use its originally enrolled method.

Host room encryption keys are separate from account sign-in and wallet keys. Export the encrypted room recovery file, keep its separate recovery code, and perform the required restore/decryption check before room creation.

## Private wallet connection and release

`compose.production.wallets.yaml` remains a prepared internal connection, not activated. Ignored `secrets/operator/wallet-settings.json` contains verified network/deployment witness, template address, maintained indexer URL and independent receipt/reward RPC accounts/token-file references. Native operator wallet services remain internal infrastructure. Scoped expiring service credentials and exact reviewed public faucet-only operations are required before M2b/activation; no sign-in account receives wallet Admin credentials.

The production preview keeps public mutations paused. `compose.public.yaml` prepares HTTPS with owner-approved domain/DNS/infrastructure. Mainnet requires the separate gates in ADR 003: reviewed participant custody, key recovery, spending authorization and treasury controls. The current PIN endpoints reject mainnet.

Encrypted application database/intent-key restore has passed; see [backup/restore](backup-restore.md). Schema v4 includes participant authentication tables. Restore invalidates participant and host sessions/ceremonies. Wallet data/unlock recovery, off-host custody and rollback remain separate release gates. Unknown payment outcomes preserve reservations and require reconciliation, never an automatic replacement transfer.
