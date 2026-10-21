# Hauntboard recipient-key registry

This companion Tari Ootle template authorizes recipient-envelope grants and room-key rotation. It does not receive plaintext AES keys. It runs alongside the retained schema-4 board; that board still permits anyone to append bytes.

The new source was implemented for the October 2026 Spooky Secrets update. It is covered by the repository's MIT license. Browser HPKE uses @hpke/core 1.9.0 under MIT; Tari dependencies retain their own licenses.

## Contract

`KeyRegistry::new(scope, board, thread, admin, envelopes)` requires the room administrator's transaction signature and creates an ownerless registry. It starts at generation 0, revision 0. The admin is a separate random per-room Ristretto key, not the funding wallet's owner key. Registry changes within that room are linkable through this admin key.

`grant(expected_revision, recipient_id, envelope)` adds one recipient to the current generation. Existing envelopes cannot be replaced. `rotate(expected_revision, envelopes)` creates the next generation with the selected remaining recipients. Both mutations require the admin signer and reject stale revisions. `get_state()` is publicly readable.

Limits: 16 recipients per generation, 16 generations, 256 total revisions, 3,072 bytes per serialized envelope, 512 bytes of scope. All generations remain in chain state. Removal never deletes old envelopes, revokes copied keys, or erases plaintext.

The template validates sizes, duplicate IDs, authority and revision transitions. HPKE validity and actual encryption to the intended public key are browser checks; an administrator can publish an invalid envelope. Consensus authorization does not guarantee delivery correctness or private membership.

## Browser protocol

- Room context binds protocol, network, reset identity, board and thread.
- Each recipient uses a dedicated P-256 encryption key pair for that room. Fingerprints are SHA-256 of the public key. Authenticate requests over a trusted private channel.
- RFC 9180 HPKE suite: DHKEM(P-256, HKDF-SHA256), HKDF-SHA256, AES-256-GCM. Each encrypted envelope binds room context, recipient and generation. Registry authorization authenticates the publisher; HPKE base mode alone does not authenticate a sender.
- Version-3 sealed post envelopes bind registry address and generation in AES-GCM additional authenticated data. Existing v2 and historical readers remain supported. Fresh generation keys are independent random 256-bit values.
- Adopting an existing sealed thread creates a fresh managed key. Generation `-1` is used only inside encrypted key bundles to retain the classic history key. New recipients receive the available history by design.
- The administrator is always retained as a recovery recipient. A grant does not rotate the shared key; removal does.
- A managed invitation URL includes room, registry and admin public-key bindings. It contains no AES key. Each recipient must use the vault that created their request.
- Existing ownerless threads do not prove who created a proposed companion registry. Trust the registry/admin binding delivered through the existing private invitation channel. A competing registry does not replace an already pinned binding.

## Recovery and storage

The room vault encrypts recipient private keys, per-room administration keys, room references, key generations and staged operations. It uses a random 256-bit recovery secret with HKDF-SHA256 and AES-256-GCM. The encrypted vault lives locally and can be exported as a file. Restore requires both that file and its separate secret. Wallet recovery words and six-digit wallet PINs do not restore it. A fresh backup is needed after invitations, key rotation or creating recipient identities. There is no automatic chain backup of recipient private keys.

Web Locks and stored-record comparisons prevent two tabs from silently replacing a vault. Locking broadcasts to other tabs. A malicious same-origin script or compromised unlocked browser can still access plaintext and keys. This design does not provide forward secrecy or recovery after compromise of a member's current private key.

Signed registry changes use the existing browser operation journal and relay. Staged key material is encrypted before review; only public locators/action tokens are added to the generic pending-operation record. Promotion waits for finalized acceptance and matching indexed envelopes. Uncertain outcomes are reconciled against the original transaction identity.

## Build and verification

Use the pinned Rust image from `infra/docker/rust-spike.Dockerfile` and run `cargo test --locked --test registry -- --test-threads=1`, followed by `cargo build --locked --release --target wasm32-unknown-unknown`. See `build.sh`. Tests cover foreign signers, constructor possession, public ciphertext reads, grants, rotation, retained history, stale revisions, duplicate/malformed members and capacity limits.

Browser cryptography and recovery tests: `hauntboard/tests/room-keys.test.mjs` and `room-browser.mjs`. The latter runs actual Chromium/Firefox cryptography and management controls with simulated registry transport. Live execution evidence is `hauntboard/evidence/room-key-esmeralda.json`; native engine evidence is `hauntboard/evidence/key-registry-engine.json`. Tests are not a comprehensive external security audit.

## Published Esmeralda instance

Template: `9de14a5ca71a3c243c0c8a4a9f5896de6f89a5d60f2f42da0ad9351ca0c08527`.

Demonstration registry: `component_dd15b354b77523cb53cf8a6f64913926cf31062f8811102ca5804b8609b4681e`.

Demonstration thread: `component_597cfcf6ec8b52a147cb1f29d3c5f5475f4587f3679f6b14116fbfb85ad3b31c`.

The existing board/template and wallets are preserved. Esmeralda is testnet; resets may remove chain history. The browser trusts provider verification flags rather than verifying consensus proofs independently.
