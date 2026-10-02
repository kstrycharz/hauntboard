# Encrypted application backup and isolated restore

October 2, 2026. `compose.recovery.yaml` implements a private application database/intent-key drill. It passed for the populated local-chain application and the production Esmeralda preview. Sanitized results: `docs/evidence/m2/local-restore.json` and `production-preview-restore.json`. The populated local drill decrypted one restored approved payout intent; the unfunded production preview has zero payout intents.

```sh
docker compose -f compose.recovery.yaml run --build --rm drill
docker compose -f compose.recovery.yaml down
```

The default source is the production database and its private secrets volume. This reads the source in a read-only repeatable-read transaction, exports its PostgreSQL snapshot to pg_dump, and includes the matching intent key inside an authenticated encrypted JWE. No plaintext dump or service key is written to the repository. The encrypted archive is atomically written to `hauntbox-recovery_backup_data`; its independent 256-bit backup key is in `hauntbox-recovery_backup_keys`. Both persist after `down`.

The restore destination is hardcoded to `restore-database` / `hauntbox_restore` on a separate private network. Restore cleans only that disposable recovery database. It has no wallet connection or signing capability. It compares all application table fingerprints against the consistent source snapshot, checks that backed-up payout intents decrypt with the backed-up service key, rejects deliberately tampered ciphertext, then deletes restored sessions and login ceremonies. The source database is never restored over or modified.

For the local development source, set these environment variables only for the drill, then clear them:

```text
RECOVERY_SOURCE_NETWORK=hauntbox-app_application
RECOVERY_SOURCE_SECRETS=hauntbox-app_app_secrets
RECOVERY_SOURCE_PASSWORD=local-development-only
```

This password is the explicit disposable local development credential. Production uses its private password file; do not copy production credentials into environment variables or commands. Both source secret initializers retain existing values and give the non-root maintenance process read access with mode 0600.

This is a bounded drill, with a 64 MiB archive/bundle limit, and preserves the latest encrypted snapshot. A release operator must separately establish retention, archive naming, off-host encrypted copies and independently held backup-key custody. Copying ciphertext without its separately held key is insufficient recovery; storing that key beside a public ciphertext is unsafe.

Wallet data and matching unlock material, human wallet-passkey recovery, curator browser-key recovery and image/database rollback remain separate recovery boundaries. The browser-key restore has passed in the actual local journey; native wallet backup/restore, off-host custody and rollback drills still require release evidence. Do not attach the disposable restored database to a running payout worker. A live recovery needs all workers stopped, chain/deployment verification, preserved unknown-state reservations, fresh credentials, and deliberate reconciliation before execution resumes.

Schema version 4 also backs up participant accounts, passkey public keys, login ceremonies and sessions. The restore fingerprint check includes these tables and invalidates both participant and host sessions/ceremonies after verification. PINs and account codes remain hashed in the database; separately saved human account codes and curator recovery material require their own private custody.

The new participant browser wallet is not in the PostgreSQL backup. Its nonextractable device wrapping key stays in browser IndexedDB; backing up the encrypted payload alone is not cross-device recovery. Participants must retain both Hauntbox recovery phrases privately and can restore the same keys/address into a new browser with a new PIN. Native daemon cipher-seed imports use a different format and remain outside this path.
