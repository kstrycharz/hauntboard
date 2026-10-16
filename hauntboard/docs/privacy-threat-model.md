# Hauntboard privacy claims and adversaries

Reviewed October 15, 2026. The implementation targets the existing Esmeralda schema-4 board. New sealed content is a browser envelope inside the existing mode-0 byte payload; no contract migration is required. This document separates source behavior, local execution and public-chain evidence.

## The claim worth demonstrating

A conventional account-funded board exposes a reusable wallet signer or named fee account across posts. Hauntboard's native fee path spends a Tari stealth output with one-time authorization, adds a fresh fee signer and omits the persistent owner signature and named account input. The contract stores no author field. Change is quarantined rather than selected for another post.

This removes specific stable identifiers. **It does not prove that posts are unlinkable.** Public funding ancestry, shared funding transactions, input/output graphs, fees, timing, text and network observations can still correlate posts. Preparing several posting outputs in one transaction gives them a common funding origin. Different transaction signers do not erase that origin.

Tari supplies native stealth outputs, ownership discovery, balance/range proofs and spend authorization. Optional body encryption uses browser WebCrypto and could also be added to other chains. The distinctive Tari demonstration is privately held outputs funding public application calls without the persistent wallet identity; encryption supplies a separate content-confidentiality property. See Tari's [privacy primitives](https://ootle.tari.com/concepts/privacy/) and [application privacy discussion](https://ootle.tari.com/concepts/privacy-in-applications/).

## Data and observer map

| Surface | Public chain observer | Relay/indexer operator | Browser/key holder |
|---|---|---|---|
| Board, title, category, thread/page addresses | Visible | Visible | Visible |
| Public message body, reply parent, epoch, nonce | Visible | Visible | Visible |
| Sealed body and display name | Authenticated ciphertext | Authenticated ciphertext | Decrypted locally with invitation key |
| Sealed title/category, parent, message count | Visible | Visible | Visible |
| Fee and spent-output graph | Visible | Visible | Visible |
| Persistent owner signer/account on native post path | Omitted by this client | Omitted from signed post envelope | Known locally |
| Seed, owner/view secrets, PIN | Never deliberately published | Never sent by the wallet flow | Local wallet credentials |
| Invitation key | Not in chain payload | Not in HTTP request targets or signed payload | URL fragment and encrypted local key store |
| IP address, connections, timing | Available to a network observer | Available at service boundary | Not hidden by this app |

The contract is payload-agnostic. A user or another client can publish identifying text or malformed bytes. The no-author-field claim concerns contract-defined records, not a guarantee that all arbitrary payloads contain no identity.

## Sealed content protocol

[`sealed-posts.mjs`](../web/sealed-posts.mjs) defines version 2 envelopes. Each thread has a random 256-bit shared invitation key. Each message has a fresh 96-bit AES-GCM IV and a 16-byte authentication tag. UTF-8 content is length-prefixed and padded to 2,560 bytes; up to 2,558 serialized content bytes fit. Ciphertext length is fixed for a given public title/category. This conceals body length within that bound, not the number or timing of messages.

Authenticated additional data binds the protocol version, network, reset identity, board address, thread UID, post nonce, parent, public title and category. Moving ciphertext to another context fails decryption. The normal 4,096-byte on-chain envelope limit remains in force.

Keys are shared **manually through a trusted private channel** in a fragment-only invitation URL. The browser checks the referenced board/thread and decrypts the opening post before saving a received key. It removes the fragment from the address bar during opening. This prevents the ordinary HTTP request from including the key; it does not protect against browser history/sync, extensions, clipboard observers, screenshots, malware or a compromised client. Invites are bearer secrets. The app does not implement recipient public-key distribution, forward secrecy or key revocation.

All key holders can read past and future messages, copy the key and generate valid ciphertext. This is group confidentiality, not author authentication or contract-enforced membership. The contract is permissionless: anyone can pay to append bytes, including junk or plaintext. In a sealed thread this client refuses to render plaintext replies as confidential messages. Unreadable/tampered bytes remain public immutable chain data.

Invitation keys use the existing device-key-encrypted IndexedDB store and separate password-encrypted key backups. Wallet recovery words do not restore those keys. Sealed drafts are not persisted in session storage. Losing the local key and all invitation/backups loses access; deleting a browser key does not revoke copies or erase ciphertext. A malicious same-origin script can access browser capabilities and plaintext after decryption.

## Adversarial boundaries and evidence

| Attack or failure | Enforcement / evidence | Limit |
|---|---|---|
| Persistent owner key or account reused across posts | Real SDK/WASM two-output test inspects signed BOR and one-time spend keys | Synthetic provider rows; no public-chain execution |
| Signer rotation hides a shared account or funding link | Audit failing controls detect shared signers, inputs, direct output spends and supplied common funding origins | CLI currently leaves full funding ancestry unresolved |
| Unverified, wrong-owner, frozen or nonnative fee output | Native fee preparation rejects it; authorization pins the verified owned row and version | Provider's `verified` assertion remains trusted |
| Unverified/wrong-template board or hostile decoded state | Provider and state-decoder negative tests | No independent validator-consensus proof verification |
| Modify an accepted post or replay its nonce with changed bytes | Seven native engine tests cover exact retries, conflicting title/body, parent bounds and direct page writes | Append remains permissionless; no edit/delete facility |
| Wrong key, modified IV/ciphertext/header or transplanted envelope | AES-GCM and context negative tests | No protection after invitation disclosure |
| Leak body/key in a request or plaintext draft | Chromium/Firefox outgoing-request and storage assertions using synthetic secrets | Tests cover exercised paths, not a complete information-flow proof |
| Post before review or resubmit after lost acknowledgement | Browser assertions, exact-envelope relay and reconciliation tests | Availability/provider lag can postpone confirmation |

Run the [reproducible verification commands](privacy-verification.md). Do not add up assertions and market them as independent attacks. Evidence reports distinguish Node test cases, native engine cases and browser scenarios.

## Explicitly unproven

There is no anonymity-set measurement, traffic mixing, Tor transport, statistical timing analysis, comprehensive ancestry analysis or proof of strong transaction unlinkability. A same-wallet public demonstration needs an operator's local attestation in addition to public receipts; public receipts alone cannot prove common wallet ownership. As of this review the read-only recent-history audit found insufficient public posting receipts. Compatibility and poster-privacy manifest flags remain false. Do not present the new sealed flow as a deployed, funded Esmeralda demonstration until that separate check is recorded.
