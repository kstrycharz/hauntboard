# Hauntboard — public conversation without a persistent wallet author

## October 20 update: recipient-encrypted sealed rooms

Use **Room access** inside an actual sealed room on [Hauntboard](https://hauntboard.taritracker.com/). A guided setup asks users to save their recovery code and download an encrypted backup before continuing. Copyable access requests, named invitations and explicit member removal keep cryptographic implementation details out of the main flow. The standalone demonstration page has been removed in favor of these real room controls.

The new companion Tari contract authorizes recipient-envelope grants and room-key rotation with a separate per-room administration key. Managed invitations contain the registry binding, with no AES master key in the URL. The encrypted room vault stores recipient/admin private keys and key generations; restore requires the exported encrypted file and its separate high-entropy recovery secret. Wallet words do not restore it. Keep a new backup after access changes.

Eight finalized [Esmeralda transactions](../evidence/room-key-esmeralda.json) cover template publication, preparing native posting outputs, sealed posting, registry creation, a recipient grant, another managed message, removal/rotation and a future message. The run verified outsider rejection, recipient delivery, encrypted recovery, retained historical access, and rejection of future ciphertext under the removed recipient's old key. Transaction identities remain in the source evidence; the old demo endpoint is no longer served.

Verification includes 47 Node privacy/foundation cases, four native registry engine tests, the existing 11 GUI scenarios per browser, recipient/recovery/management UI tests, and public HTTPS checks in Chromium and Firefox. [Live browser evidence](../evidence/room-live.json), [native engine evidence](../evidence/key-registry-engine.json), [protocol](../key-registry/README.md), [user guide](room-access.md). These are different evidence layers, not a sum of independent attacks.

Existing board writes remain permissionless. Registry administration within a room is linkable. Titles, recipient pseudonyms, funding/output ancestry, fees and timing remain observable. Removal protects future messages under a fresh key; old envelopes, copied keys and saved plaintext remain usable. Members can share keys, and group encryption does not authenticate individual authors. Broad privacy/compatibility manifest flags remain unchanged. This is not an anonymity or strong unlinkability claim.

When updating the existing forum submission, retain its Tari winnings address and Bluesky/Reddit announcement link, and add this update to the same post. This document does not publish a forum or social message.

## Original submission text (historical)

Hauntboard is an accessible message board running on Tari Ootle Esmeralda. Full posts are stored in contract state and can be read from an independently hosted client. Its privacy demonstration asks a concrete question: can a public application call pay its network fee without publishing the poster's persistent wallet key or named account?

The browser uses Tari-native stealth inputs and one-time spend authorization to pay posting fees, with a fresh fee signer. The schema-4 contract stores no author field and has no edit/delete operation. Posting change is quarantined to avoid automatically funding the next post from a previous post's output. Browser wallet secrets remain local.

The current release also supports optional sealed threads: public titles/categories with AES-256-GCM encrypted message bodies stored on chain. Encryption, decryption and invitation-key storage happen in the browser. Invitations carry a shared key in the URL fragment and must be delivered through a trusted private channel. Every key holder can read and share the full history; there is no revocation or authenticated author identity. The compatible reader is deployed and has passed [live asset and browser checks](../evidence/privacy-deployment.json); a funded, on-chain sealed-post demonstration remains pending.

**What Tari adds:** native stealth fee funding and one-time authorization around public contract calls. Browser message encryption is a separate, general-purpose confidentiality layer. Neither property alone proves strong transaction unlinkability.

## Independently check the claims

- [Use the live board](https://hauntboard.taritracker.com/) and follow each post's **View on chain** link to its actual storage page.
- [Reproduce the tests and receipt audit](privacy-verification.md): the recorded local run has 38 passing Node test entries, seven native engine cases, and ten browser scenarios each in Chromium and Firefox. Counts describe different test layers and should not be summed as independent attacks.
- [Inspect the threat model](privacy-threat-model.md) for funding graph, timing, provider trust, key-sharing and network limits.
- [Review the Node results](../evidence/privacy-tests.json), [TAP output](../evidence/privacy-tests.tap), [native engine result](../evidence/public-contract-engine.json), and [browser results](../evidence/gui-regression.json).
- [Inspect the current public receipt report](../evidence/privacy-public-audit.json). The October 15 recent-history scan found insufficient Hauntboard receipts for a two-post comparison. Supply known public transaction IDs to reproduce a bounded audit; strong public unlinkability is unproven.
- [Run an independent client and reproduce artifacts](../../README.md#run-your-own-copy), using the pinned [network identity](../deploy/network.public.json) and [artifact checksums](../../release/SHA256SUMS).

## Honest limits

Titles, categories, public text, reply relationships, fees, timing and output graphs are observable. A common funding origin can link two posts even when their signers differ. Indexer `verified` flags are trusted provider assertions. Hauntboard does not independently verify consensus proofs, hide IP addresses, provide traffic mixing or claim complete anonymity. Sealed invitations are shared bearer secrets; encryption does not add contract-enforced membership or censorship resistance.

The strongest contest evidence still to capture is a funded, same-wallet multi-post Esmeralda recording with public receipt IDs and the resulting audit, plus a live sealed-thread read/decrypt check. The source, tests and walkthrough make those claims reviewable without presenting local fixtures as completed public-chain evidence.
