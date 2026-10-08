# Local proof-of-concept evidence

The JSON artifacts describe **actual isolated localnet activity**, not public Esmeralda transactions or mainnet operation. Story content is synthetic. Credentials, wallet tokens, invitation keys and wallet state are retained only in private Docker volumes.

**October 6 schema-3 upgrade:** a paged template and board were published on the existing localnet. The schema-2 board and wallet/browser data were preserved. The current acceptance board contains synthetic test threads. `bootstrap.json` and `build.json` identify this deployment; paging, browser, wallet, About, outage and recovery results record tests against it. `fresh-start.json` is historical evidence from the earlier explicitly requested factory reset and empty schema-2 board.

- `bootstrap.json`: template/WASM identity, publication/board transactions and fees, wallet/funding assertions, verified state read.
- `browser.json`: real Chromium public/secret posting and independent signer reply; wrong-key, tamper and context checks; encrypted key backup; native tip reception and public transaction metadata inspection; escaping/mobile/CSRF checks.
- `outage.json`: primary website, indexer and wallet actually offline; fresh-client history retrieval, decryption and confirmed new reply through the independent client.
- `recovery.json`: submission response intentionally lost after successful wallet submission; original transaction recovered on reload with one post; Firefox key/decryption/reload and native wallet scan.
- `key-concurrency.json`: twenty simultaneous first-use secret-key saves recover correctly in fresh Chromium and Firefox storage, using a Web Lock to prevent replacing the device encryption key.
- `build.json`: source and binary hashes, compiled WASM size, pinned runtime/toolchain image identities and native engine results.
- `host-access.json`: both real Windows localhost URLs return the same verified board state through their independently configured providers.
- `browser-wallet.json` and `browser-wallet-firefox.json`: browser-generated owner keys, actual faucet funding/account ownership, native signed public post and recovered-wallet reply, sealed post / lost-response recovery, wrong password and no private-key/password request fields.
- `about.json`: Chromium and Firefox About navigation, live contract identity, raw-chain inspection, mobile overflow and offline explanation checks. `about-chromium.png`, `about-firefox.png` and `browser-wallet.png` show those synthetic journeys.
- `board-desktop.png`, `board-mobile.png`, `secret-thread.png`, `wallet.png`, `outage-recovery.png`, `firefox-wallet.png`: screenshots of real synthetic localnet journeys. An opened secret in a screenshot is synthetic demonstration content.

`engine.json` records five successful native positive/negative suites. The full-capacity test accepts 2,048 posts across 128 pages, including 2,047 maximum-size 4 KiB replies, rejects another post, preserves the opening and verifies an exact retry against an older page. Other cases reject direct page mutation, stale page nonces, invalid parents, conflicting content and UID impersonation. `paging.json` records 36-post public and sealed conversations with both signing paths, three verified post-page components, global reply references, older-page loading and fresh-browser recovery. Schema 2 remains supported for preserved older boards.

The two indexers are independently running processes/storage, connected to one shared local validator. The browser trusts the selected indexer's verified response. This evidence demonstrates application/provider independence within localnet and does not assert decentralized validator consensus, independent browser consensus verification, public-testnet feasibility or mainnet readiness.
