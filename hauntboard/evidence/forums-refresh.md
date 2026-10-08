# Forums release 0.6.6

General is now the default forum. Tari and Pol remain; Crypt has been removed from navigation and the posting selector. Retired or missing category metadata falls back to General. The `/forums` page describes these three forums and the existing component/page capacity limits.

The new public board component is `component_594f90d8cb8c2d0f70d941ba1c513769727feceeabd9d2137b5b6a130a6aa28e`, titled Hauntboard Forums. Creation transaction: `17fccefae14dd9ed51f98773378782e87eefe54d6d3c61824e2233e54f40e82b`.

This creates a fresh component from the existing published schema-4 template `f6773b90f8919097266a73e6c68e343724e2a4bdaf248f01e11b463bbc4e0b2d`; it does not publish different template bytecode. WASM checksum: `75d3ab7a2e9265e1565ddd293aa651ae7a4e7687ccc1f148d371acc0c66d9582`. Both Tari-hosted indexers independently verified the board and all three deployment transactions; see `forums-contract-verification.json` and `esmeralda-forums-contract.json`.

The backend deployment wallet remains in the private Docker volume `hauntboard-forums-operator` on the Ubuntu server. It is not mounted into the web application or exported into the local source. The deployment returned 999 test TARI to the public faucet after its 1,000 test TARI claim. Total fees were 6,300 microtari (0.0063 test TARI).

The previous board `component_ff8fd992a498d7c9b32e96fb8cb557029d2f96dbb033ae61932b45cbf9187a4b` is retained in the public manifest's legacyBoards. Wallet network and resetIdentity are unchanged. Previous on-chain data is retained; new threads use the new board.

Ubuntu server: 192.168.1.200, user ubuntu. Immutable deployed image: `sha256:0f20688308885e3f247e0da8a832905d9cea22faeb01326c6ba8a9946bf29f11`. Guarded release script: `hauntboard/scripts/release-forums.sh`. Server backups: `network.before-0.6.6.json`, `.env.before-0.6.6`; image archive: `esmeralda-beta-0.6.6-forums.tar`. Only app and preview were recreated; the original Cloudflare tunnel was retained.

Chromium and Firefox staging checks passed at 390px and 1280px, covering the General default, removed Crypt controls, retired category URL fallback, three posting choices, category navigation, draft recovery, payload encode/decode and documentation layout. Automated validation makes no public posts or faucet claims. Full poster-privacy acceptance remains a separate investigation.

Live URL: https://payroll-levels-sensitivity-bit.trycloudflare.com/

Live verification also passed in Chromium and Firefox at both sizes. Eight served frontend/WASM assets exactly match the saved source snapshot. The live config selects the new board, retains the previous board and wallet resetIdentity, and keeps the testnet faucet enabled. Readiness passed, and the previous board remained readable through the API. Wallet output scanning completed in both browsers with no capacity error; both Tari nodes' opaque scan cursors resumed correctly. Reports: `forums-release.json`, `forums-chromium.json`, `forums-firefox.json`, `output-scan-live.json`. All these checks performed zero chain writes.
