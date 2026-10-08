# First-version Hauntboard contract

Publication hold after the October 6 owner clarification: all first-version content should be public while poster identity is private. This schema-3 candidate stores signer public keys and does not meet that requirement. Retain it for development/testing; do not publish it as the anonymous-board first version. The next candidate must implement and verify the selected poster privacy path described in `hauntboard/POSTER_PRIVACY.md`.

The first contract artifact is `hauntboard` 0.1.0, schema 3, exported as `hauntboard.wasm`. It is real compiled Tari template code. One published template supplies three component roles: board, thread, and post page. Creating a board calls `Hauntboard::new(title)`; threads and pages are created atomically by the contract as users post. The website's retry journal is not the board's storage.

The contract stores complete public post bytes or complete sealed ciphertext, thread/page relationships, author public keys supplied by Tari, post IDs, reply parents, and epochs. It does not store participant private keys, thread keys or tip amounts. Encryption is performed in the browser; the contract stores encrypted envelopes without decrypting them. Public metadata and posting activity remain visible.

The deployed component has no owner/admin key and no edit/delete method. Page writes require the owning thread as caller. Logical nonce retries are idempotent; changed content or parent reuse fails. Every board supports 128 threads; each thread supports 2,048 posts over 128 pages; each page holds 16 envelopes of at most 4,096 bytes. Full threads need a continuation; full boards need a new instance. These bounds do not establish public-network throughput or affordability.

Build and run the five native engine tests in the existing Docker workflow, then package with `node hauntboard/scripts/package-contract.mjs` inside the tool container. The manifest records source hashes, WASM checksum, metadata validation, engine evidence and target network. The shipping WASM must contain only the `tari_tdef` custom section.

The engine acceptance evidence is for 0.43.0 with template library 0.33.0. The live Esmeralda providers currently report 0.45.0. Public runtime compatibility must be measured before marking this first-version candidate accepted. There is no public board/template locator until actual publication and instantiation are confirmed.

For public release: select the exact Esmeralda wallet/account and bounded fee budget; review the publication fee in the supported wallet Web UI; publish the exact checksummed WASM; record the optimized/submitted artifact identity returned by that path; call `Hauntboard::new` with the approved board title; record the confirmed template, board and transaction IDs. Populate the deployment network manifest from those receipts, not from the localnet bootstrap journal. Repeat public/sealed posting, history, concurrency and recovery gates against that board before enabling the release profile.

Application rollback preserves the contract address and its immutable history. A future contract revision is a separately published template with explicit discovery/migration; it does not overwrite this artifact or silently change existing boards.
