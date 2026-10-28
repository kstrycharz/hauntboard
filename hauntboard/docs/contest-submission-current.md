# Hauntboard — public conversations, chosen readers

Hauntboard is a message board on Tari Ootle Esmeralda. Read public conversations without a wallet, or use sealed rooms whose message bodies are encrypted in the browser and stored in contract state.

**App:** https://hauntboard.taritracker.com/

**Open source (MIT):** https://github.com/kstrycharz/hauntboard

**Current source update:** https://github.com/kstrycharz/hauntboard/pull/3

## The privacy demonstration

An outsider sees the public title, category, reply relationships and ciphertext. An invited reader opens an encrypted room-key envelope with their browser-local recipient key. The room administrator can remove a member and rotate the key for future messages. The removed member retains historical access but their old key cannot decrypt a message encrypted under the fresh generation.

Open **Room access** inside a sealed room for named invitations, member management and encrypted access backups. Managed invitation links contain registry bindings rather than the shared AES message key. Recovery needs the exported encrypted access file and its separate recovery code; wallet recovery words do not restore room access.

## What Tari adds

- **Native stealth posting fees:** browser-local proofs and one-time spend authorization omit the persistent wallet owner key and named account from this client's posting calls. Schema 4 stores no author field.
- **Actual message storage:** full public text or sealed ciphertext lives in contract state, available to independently hosted clients through approved providers.
- **Authorized room-key distribution:** a companion Tari contract authorizes recipient-envelope grants and generation changes with a separate per-room administrator key and revision checks. The registry does not receive plaintext room keys.

Browser message encryption is a separate confidentiality layer. It does not turn the fee flow into an anonymity guarantee.

## Evidence

The [October 21 UTC Esmeralda record](https://github.com/kstrycharz/hauntboard/blob/27bd321/hauntboard/evidence/room-key-esmeralda.json) lists eight finalized transactions covering publication, preparing posting funds, sealed posting, registry creation, a grant, another message, removal/rotation and a future message. The run records recipient delivery, outsider rejection, encrypted recovery and future-message exclusion. It is dated execution evidence, not a fresh check of present indexer retention.

The [judge walkthrough](https://github.com/kstrycharz/hauntboard/blob/feat/recipient-encrypted-rooms/hauntboard/docs/judge-walkthrough.md) connects the room controls, transaction record and separate test layers. The new `/proof` evidence page is included in PR #3; verify that release is deployed before linking visitors to it.

The October 28 source update also hardens access-vault saves, locking and restoration, updates the pinned Tari client libraries, and adds a public transaction-identity regression vector preserving large nonces. Recorded browser checks cover native wallet creation, PIN unlock, recovery, recipient isolation and storage failure handling. Some interface checks simulate transport; they do not replace chain execution.

## Limits

Titles, categories, recipient pseudonyms, administration linkage, funding ancestry, fees, timing and network activity remain observable. The board accepts permissionless writes; key distribution is not posting membership. Members can share keys, and group encryption does not authenticate individual authors. Removal cannot revoke historical keys or saved plaintext. There is no forward secrecy.

The separate same-wallet public posting audit remains incomplete, and the newly updated client libraries still need a funded-post acceptance check. Testnet resets or indexer retention may remove old history. This is Esmeralda test software; test currency has no monetary value.

**Public Reddit announcement:** https://www.reddit.com/r/tari/comments/1x4eany/i_built_hauntboard_for_taris_spooky_secrets/

**Tari L1 winnings address:** `1213nhRFy9S3tevPWJyThkZpEuDruaa4L4LNLEgzAuc4PG6dL862KzsijZgyg68qrcKS2U3hCqzjkiJHdasrTDj3pwf`

---

Editing note: replace or update the existing submission in place and remove its evidence-link placeholder. Keep the original announcement and winnings address. This file does not publish a forum or social message.
