# October 6 delivery implementation record

## Poster privacy and deployment candidate 0.4.0

The owner selected public content and poster privacy as the first-version focus. The new shipping candidate is schema 4 in `template-public/`, separate from preserved schema-3 history. It stores no author fields and rejects sealed modes. Native engine 0.45.0 / template library 0.34.0 tests pass: no-author state, signer-independent exact retries, invalid modes/envelopes, paging/stale retries, and full 2,048-post maximum-byte history.

The maintained SDK 0.7.0 / WASM 0.43.0 now discovers locally owned stealth outputs and pays posting fees using native balance/range proofs, one-time spend authorization and a fresh receiver key. The persistent owner signature and named fee account are omitted. Actual confirmed local transactions were inspected independently through the indexer. Chromium and Firefox each pass ten checks including public reads without a wallet, no stored author, encrypted coin recovery, stale wallet state, older backup preservation, quarantined change and lost-response reconciliation. Evidence: `poster-privacy.json`, `public-contract-engine.json`, `public-contract-local.json`, `public-wallet-chromium.json`, `public-wallet-firefox.json`.

The localnet runtime remains 0.43.0; contract native tests use 0.45.0. These results do not prove public Esmeralda browser compatibility. Funding ancestry, one-time keys, fees, graph links, timing, content clues and network connections remain visible. No complete anonymity or unlinkability claim is made. Incoming discovery needs a confirmed transaction ID, tracked coin capacity is 32, and change is never automatically reused. Native stealth fee safety margins are non-refundable. Unknown submissions preserve their exact signed envelope and coin reservation.

The refreshed read-only probe reached both actual Tari-hosted Esmeralda providers, network byte 38, runtime 0.45.0, four matching validators and proof verification enabled. No public fee was spent. The schema-4 WASM/source archive verifies SHA-256 `75d3ab7a2e9265e1565ddd293aa651ae7a4e7687ccc1f148d371acc0c66d9582` (141,153 bytes). The new `hauntboard-delivery:0.4.0` image is built locally and tested as non-root/read-only. GitHub workflows, Ubuntu VPS Compose, strict no-author public gates, architecture copy and runbook are prepared. Hosted CI, registry publication, real Esmeralda posting/publication, HTTPS staging and VPS deployment have not occurred. Local Docker digest metadata is not remote registry publication evidence.

The rest of this document records earlier foundation and legacy demo evidence. Earlier schema-3 artifacts are superseded for first-version publication by the schema-4 candidate.

This is engineering evidence for delivery foundations, not public-beta acceptance. All state-changing checks in this session used the existing dedicated `hauntboard-poc` localnet and synthetic faucet-funded test wallets. No public transaction, contract publication, registry push, VPS deployment or external message was performed. Existing application services, participant wallet records, chain volumes and sibling source snapshots were preserved.

Owner follow-up: live checks were extended to provider runtime/proof settings and validator roster. Both Esmeralda endpoints reported 0.45.0, network byte 38, four matching validators and usable chain state. Public readiness now enforces those checks against the pinned provider runtime. Six network/relay/backup tests passed, including rejection of localnet, runtime mismatch, disabled proofs and empty validator rosters. The About storage diagram passed Chromium/Firefox/mobile/offline checks and was visually inspected. All five native contract tests were freshly rerun, including full capacity, and the release WASM was rebuilt. `contract-release.json` records the first-version schema-3 artifact, source hashes and public locators explicitly unset; it is a candidate awaiting public compatibility/publication proof.

## Implemented

- Validated local/public/independent-client profiles, explicit network bytes and reset namespaces, strict canonical origins, approved HTTPS upstreams and mainnet rejection.
- Browser wallet v2 encryption authenticates network/reset metadata; IndexedDB separates namespaces and preserves legacy localnet records. Create/unlock/restore/funding/submission use shared Web Locks. Restore validates identity/account ownership and cannot replace a different saved wallet. Storage failure does not discard the active signer.
- Browser review uses simulation-derived post fees with 20% plus 1,000 atomic units allowance under the existing 1,000,000-unit ceiling. It re-simulates the bounded transaction and rechecks before signing; changed state/fees require review. Quote lifetime is two minutes. Public funding is explicitly gated pending compatibility proof.
- Browser relay has four active submission slots and a 10,000-record per-network/reset cap. Exclusive durable claims prevent independent workers from forwarding one operation twice. Restart/retry returns an acknowledged transaction or preserves uncertainty. HTTP/transport failures never become assumed chain rejection. Historical local journals remain readable. Public request admission and bodies/timeouts are bounded.
- Public/client profiles do not expose demo wallet/signing/tip routes or browser factory-reset headers. Posting requires an unlocked browser signer. Keys, passwords, signed envelopes and private tip details are excluded from the server journal. Random operation IDs act as local bearer capabilities.
- Non-root, pinned-base application image; production HTTPS Compose/Caddy configuration; independent loopback client Compose; distinct liveness/readiness; deployment configuration checks; encrypted operational-journal backup/empty-volume restore; update/rollback/reconciliation/monitoring runbook; additional CI gates and a separately labelled delivery-preparation package.

## Fresh checks

| Check | Result / evidence |
|---|---|
| Public network read-only probe | Both official endpoints answered Esmeralda/38, with matching block hash and wildcard CORS headers at probe time. [Probe JSON](public-network-probe.json). No runtime/funding inference. |
| Unit/integration checks | Network/profile rejection, restart/idempotency/unknown outcomes, duplicate claims, bounded overload/journal capacity, authenticated operational backup, wrong-password and overwrite refusal: five passing tests in `tests/delivery.test.mjs` and `tests/operations-backup.test.mjs`. |
| Chromium wallet | Generation, real local faucet account, public/sealed signing, encrypted export, reload/wrong password, fresh-browser restore/sign, lost-response reconciliation and no password/key submission: [evidence](browser-wallet.json). |
| Firefox wallet | Same real local-chain journey: [evidence](browser-wallet-firefox.json). |
| Wallet negative/cross-tab checks | Wrong password/ciphertext/network/reset, storage failure, same-identity restore, differing-identity refusal, competing create operations, pre-funding key recovery, Esmeralda generation/backup namespace and localnet identity preservation: [Chromium](wallet-hardening-chromium.json), [Firefox](wallet-hardening-firefox.json). These do not prove funded-account discovery from a pre-funding file. |
| Schema-3 regression | Public/sealed 36-post histories over three pages, browser rollover, independent writers, old-page retry, conflict/stale-page rejection, older history and fresh reload: [evidence](paging.json). |
| Legacy demo/browser regression | Public/sealed state, invitations, tamper/context checks, real local native demo tip, mobile overflow and cross-origin rejection passed (`tests/browser.mjs`). Participant-owned native tip acceptance is still open. |
| About/browser regression | Chromium/Firefox navigation, locators, raw state, offline explanation and mobile overflow passed: [evidence](about.json). |
| Production image smoke | Non-root/read-only runtime starts without demo credentials; canonical Host, CSP, unavailable readiness, absent demo routes and no reset header: [evidence](public-server.json). |
| Compose | VPS and independent-client configurations parse with explicit placeholder digest-shaped inputs. Actual approved registry images, DNS and HTTPS behavior remain untested. |

The final preparation archive's checksum manifest ties distributed client/server/deploy files to their exact bytes; `delivery-image.json` records the local build identity. Local image identity is not a pushed registry digest or a hosted CI result.

## Remaining gates and source findings

Encryption review during the GitHub handoff found that `web/crypto.mjs` still uses a fixed `localnet` domain label in the authenticated message context. Board/thread/post/parent context is authenticated, but explicit Esmeralda/reset binding for message envelopes remains a release task distinct from the wallet network namespace. Preserve existing localnet envelope readability when introducing a versioned target-network context. Do not claim that the current message format authenticates the selected public network/reset.

October 6 hosted-node clarification: public and independent-client profiles now enforce the two Tari-hosted Esmeralda origins in code, in addition to explicit environment approval. Custom providers, lookalike domains, HTTP, localnet URLs and alternate ports are rejected even when environment-approved. The shared probe allowlist applies the same restriction. Six foundation/backup tests and the rebuilt image smoke passed. The shipped image connected read-only to both Tari endpoints at 22:39:48 UTC; both reported runtime 0.45.0, network byte 38, height 955112, proof verification enabled and the same four validators. See [live connection evidence](live-client-connection.json). Public contract publication and funded writes remain unperformed.

NET-01 remains open for actual public runtime compatibility, a proven reset identifier and viable browser-owned funding. The maintained wallet guide listed 0.45.0 on October 6; this build still deliberately pins WASM/runtime-era artifacts at 0.43.0. The guide states that public faucets can be empty and describes burn/claim funding. Neither that guide nor an endpoint response proves this browser flow. See [official wallet guidance](https://ootle.tari.com/guides/setup-a-wallet/).

WAL-02 still needs supported account rediscovery for a backup made before funding and fresh-client reconciliation of pending funding, including expired envelopes. The existing CreateAccount instruction derives its account from the owner's key, but the installed SecretKeyWallet `getAddress()` implementation returns a bech32 receive address; treating it as a component locator would be incorrect. No handwritten cryptographic derivation was substituted.

TIP-01 source inspection found `StealthTransfer`, unblinding helpers, wallet authorizer APIs and `SecretKeyWallet.addStealthSignature` in the pinned SDK's installed declarations/implementation. This indicates an integration path, not successful browser private scanning/spending. That integration and independent real target-testnet receive/spend proof remain required. The public profile cannot fall back to a shared demo wallet.

OPS-02 still needs a reconciler/retention policy for terminal records, off-host transport and scheduling, alert destinations, actual replacement-host and rollback drills, and the observed staging soak. Admission currently closes safely at journal capacity; uncertain claims never expire automatically. This journal is for one host, not the planned future shared multi-host operation store.

NET-02/public funding and deployment wait for the exact target/budget and environment inputs requested from Kyle. UX-01 needs actual first-time and mobile user trials. REL-01 needs registry publication, hosted CI, full public proof, freeze/acceptance and contest artifacts. No acceptance row is marked complete.


## Mobile preview refresh

The locally deployed privacy preview now runs the non-root `hauntboard-delivery:0.4.1` image on port 8283, built through `board-privacy`. Its existing schema-4 board and journal volume are preserved. Local bootstrap assigns the isolated preview files to UID 1000 so the shipping runtime can read its private config and persist transaction claims.

Phone/tablet navigation, minimum 44px touch controls, 16px text/password inputs, wrapping titles/chain identifiers, stacked fee review and dialog viewport bounds were adapted. About architecture remains stacked at phone widths; its storage table becomes readable labeled rows with no sideways scrolling. Desktop layout remains a grid. Public-only hero and locked-wallet labels now match the privacy candidate.

`tests/mobile.mjs` passed in Chromium and Firefox at 320x568, 360x640, 390x844, 430x932, 768x1024 and 844x390, including board/thread/reply navigation, compose and wallet dialogs, About storage and desktop preservation. Both browsers completed the full real-chain privacy wallet journey at 390x844 through the deployed Node 22 image. See `mobile-layout.json`, `public-wallet-chromium-mobile.json`, `public-wallet-firefox-mobile.json` and mobile screenshots. These are browser simulations, not a physical iOS/Android trial. Earlier 0.4.0 archives are historical snapshots and do not contain this mobile refresh.

Owner follow-up: restarted the local preview with Docker publishing `0.0.0.0:8283`. `LOCAL_LAN_HOSTS` explicitly allows the computer's Wi-Fi/Ethernet private IPv4 addresses and preserves exact same-origin/CSRF checks. Arbitrary hosts, public IPv4, malformed addresses and wrong ports remain rejected. Seven delivery-profile/relay checks pass. HTTPS public/client profiles remain unchanged. The LAN HTTP preview is for reading; wallet APIs need a secure browser context.
