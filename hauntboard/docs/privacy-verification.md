# Reproduce the privacy evidence

Use containers from the repository root. No commands in the first two sections sign or submit chain transactions. Source review and local evidence date: October 15, 2026.

## Local adversarial tests

```sh
docker run --rm -v "$PWD:/workspace" -w /workspace node:22.21.1-bookworm-slim@sha256:25b3eb23a00590b7499f2a2ce939322727fcce1b15fdd69754fcd09536a3ae2c node hauntboard/scripts/test-privacy.mjs
```

Outputs: [machine-readable report](../evidence/privacy-tests.json) and [complete TAP results](../evidence/privacy-tests.tap). The report records source hashes, Node version and actual test counts. There are 38 passing Node test entries in the recorded run; this includes one provider-suite entry containing several assertions. These are not 38 separately reviewed security attacks.

PowerShell users can run the same check with an explicit bind mount:

```powershell
docker run --rm --mount "type=bind,source=$($PWD.Path),target=/workspace" -w /workspace node:22.21.1-bookworm-slim@sha256:25b3eb23a00590b7499f2a2ce939322727fcce1b15fdd69754fcd09536a3ae2c node hauntboard/scripts/test-privacy.mjs
```

The real released Tari SDK/WASM test creates two distinct synthetic stealth outputs for **one wallet**, then builds and seals two posting transactions. It checks different one-time spend signer keys, no persistent owner public-key bytes in signed BOR, no named account input, no revealed fee input and separate fee programs. It does not execute those transactions on a network or establish funding unlinkability.

Native engine tests run with the pinned Rust image and locked dependencies through `hauntboard/template-public/test-engine.sh`; the full [build script](../scripts/build-release.sh) provides the container setup. The saved [engine result](../evidence/public-contract-engine.json) records seven passing cases including 2,048-post capacity, direct page-write denial, invalid parents and immutable retry conflicts. The opaque-byte test proves byte preservation; it does not make the contract an encryption verifier.

The [browser regression script](../tests/gui.mjs) exercises Chromium and Firefox with the actual frontend, WebCrypto and IndexedDB and explicitly simulated wallet/provider execution. It verifies sealed opening/reply, missing-key readers, invitation decryption/reload, no secret bodies or invitation keys in outgoing requests or draft storage, and no automatic second submission after a lost acknowledgement. [Browser results](../evidence/gui-regression.json) record ten scenarios per browser, including the existing responsive and accessibility checks. Run it in the repository's pinned Playwright integration image built from `infra/docker/local-tests.Dockerfile`, with `/workspace/node_modules` in a named volume.

## Public receipt inspection

The audit uses the two approved Tari Esmeralda indexers, reads the pinned board/template, requires matching provider state and finalized acceptance, and compares privacy-relevant transaction fields. It never publishes messages or signs transactions.

```sh
docker run --rm -v "$PWD:/workspace" -w /workspace node:22.21.1-bookworm-slim@sha256:25b3eb23a00590b7499f2a2ce939322727fcce1b15fdd69754fcd09536a3ae2c node hauntboard/scripts/audit-posting-privacy.mjs --ids FIRST_PUBLIC_POST_TX_ID,SECOND_PUBLIC_POST_TX_ID --owner-public-key PUBLIC_OWNER_KEY_HEX
```

Replace the three placeholders with **public** references. Do not supply a recovery phrase, private key, view secret, wallet backup or invitation key. Omit `--owner-public-key` if unavailable; the owner-omission result will be unknown. With no options the script searches only the latest 100 transactions and records an insufficient-receipt result when fewer than two posts are found. It exits nonzero for exposure or insufficient evidence.

Output: [public audit](../evidence/privacy-public-audit.json). `LIMITED_CHECKS_PASSED` means the listed checks found no listed exposure. It never means unlinkability. `EXPOSURE_DETECTED` must be reported even if signers differ. Full funding inspection remains incomplete in the current CLI. The audit library accepts known public funding origins for analysis, with tests showing that a common origin is flagged. The CLI does not infer missing origins or claim an anonymity set.

Two providers agreeing are corroboration, not independent consensus verification. An owner key supplied by the operator is a reference, not public proof that two posts share a wallet. Keep a local same-wallet attestation and the public receipt IDs together without exporting secrets.

## Three-minute judge walkthrough

Prepare a funded Esmeralda browser wallet in advance. Funding and conversion can take longer than three minutes. Record target, account and an explicit maximum test-TARI budget before automated spending. Preserve the board, pending operations and wallet data.

| Time | Demonstration | Evidence to show |
|---|---|---|
| 0:00–0:30 | Open the board in a fresh browser without a wallet | Public title/text and on-chain page link |
| 0:30–1:15 | From one funded wallet, review and publish a public thread and a reply from separate eligible outputs | Both transaction IDs and local same-wallet attestation; distinct signers and owner/account omission |
| 1:15–2:15 | Publish a sealed thread with a public title; open it in a separate browser without the invitation, then with it | Ciphertext in page state, locked reader, local decryption; no key in network requests |
| 2:15–3:00 | Open the saved multi-transaction audit and failing conventional-board control | Specific absent identifiers and any common funding/change links; unresolved timing/network observations |

This is a target recording script, not a guaranteed chain-finalization schedule or a claim that the flow has already been recorded on Esmeralda. If posting outputs share a funding transaction, show that link and explain the limitation. Do not describe common-origin outputs as independently anonymous funds. Invitation sharing requires a trusted private channel; never publish the invitation in the contest entry.

## Release boundary

The local source adds encrypted envelope support while preserving the published schema-4 contract, template/board addresses and existing manifest verification flags. A website release is needed before hosted users have the new envelope reader. Existing clients will not understand version 2 sealed envelopes; release compatible readers before inviting judges. A live sealed-post check and the two-post Esmeralda audit remain separate evidence gates.
