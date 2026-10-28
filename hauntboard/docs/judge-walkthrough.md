# Hauntboard: verify the privacy behavior

Hauntboard combines public conversations stored in Tari contract state, native stealth fee authorization and optional encrypted message bodies. Managed rooms add recipient-specific key delivery and a Tari registry that authorizes grants and key rotation. The chain does not receive plaintext room keys.

## Start without a wallet

Open **Privacy evidence** (`/proof`) from the board. Its perspective selector explains what an outsider, invited reader and removed reader can read. It does not pretend to execute a transaction. The eight explorer links come from the [dated Esmeralda record](../evidence/room-key-esmeralda.json). **Check current registry availability** makes a read-only lookup through the configured provider; it does not revalidate the whole run or independently verify consensus.

## Record the actual access change

Prepare a funded Esmeralda wallet and a sealed room you administer. Use separate browser profiles for the administrator and invited reader. Do not put invitation secrets, backups, wallet words or recovery codes in a public recording. Publishing uses test currency. Automated chain spending requires an explicit target, account and maximum budget; this walkthrough supplies none.

1. Show the sealed room without access. Its title/category and ciphertext are public; the body is locked.
2. On the reader's device, open **Room access**, complete the recovery-kit setup and create an access request. Exchange it through a trusted private channel.
3. In the administrator's **Room access**, choose **Invite someone**, verify the request and review the fee. Wait for the original operation to confirm; reconcile an uncertain result before taking another action.
4. Share the managed room link privately. Demonstrate that the invited reader opens a message. Managed links contain registry bindings rather than the AES message key.
5. In **Manage members**, remove that reader and confirm rotation. Wait for confirmation, then publish a new message. The remaining reader opens it; the removed reader's old key does not.
6. Show that the removed reader still opens historical messages. Removal cannot erase saved keys or plaintext. Download a fresh encrypted access backup after changes.

Allow time for confirmation and indexing. The same test wallet playing both roles demonstrates access behavior, not independent participants or funding unlinkability.

## Evidence boundaries

- [Eight recorded transactions](../evidence/room-key-esmeralda.json): publication, fund preparation, sealed opening, registry creation, grant, message, rotation, future message. Recorded execution is dated October 21, 2026 UTC.
- [Registry engine checks](../evidence/key-registry-engine.json): authority, revisions and bounded state.
- [Recipient browser checks](../evidence/room-browser.json): actual browser cryptography and management controls with simulated registry transport.
- [Vault persistence regressions](../evidence/vault-browser.json): failed creation/save/restore, concurrent writes, lock during save/unlock, detached records and stale export rejection.
- [Public posting audit](../evidence/privacy-public-audit.json): a separate incomplete same-wallet comparison. Do not relabel it as passed based on the room run.

Existing board writes remain permissionless. Recipient pseudonyms, administration, funding/output ancestry, fees and timing are observable. Members can share keys. Group encryption provides neither authenticated individual authorship nor forward secrecy. The client trusts approved Tari-hosted providers. Testnet resets and indexer retention can remove old records.

## Reproduce the source checks

From the repository root, use the pinned Node image and browser image described in `infra/docker/local-tests.Dockerfile`. Run `node hauntboard/scripts/test-privacy.mjs`, `node hauntboard/tests/gui.mjs`, `node hauntboard/tests/room-browser.mjs`, `node hauntboard/tests/vault-browser.mjs` and `node hauntboard/tests/proof-browser.mjs` inside containers. Browser dependencies belong in a named volume mounted at `/workspace/node_modules`. The public pull-request workflow runs these without private runners, wallet credentials or chain spending.

The current client uses SDK 0.11.1 and WASM/native transaction identity 0.47.0. Run `node hauntboard/tests/wallet-compatibility-browser.mjs` for browser-local native phrase creation, PIN protection and same-address recovery. The ordinary transaction-identity suite checks a saved public Esmeralda vector; its optional live check requires `HAUNTBOARD_LIVE_IDENTITY_TX` with a currently available, blob-free public transaction ID. The live comparison proves identity encoding, not acceptance of newly constructed fee transactions. Historical localnet scripts pinned to engine 0.43.0 are not current SDK acceptance evidence.
