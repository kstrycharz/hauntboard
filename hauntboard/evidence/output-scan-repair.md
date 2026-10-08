# Output scan cursor repair

Root cause: output-ledger.mjs required commitments to increase lexicographically. Tari indexer pagination uses an opaque commitment cursor resolving to the database row ID, then returns later rows in database insertion order. Commitment text order does not represent scan progress.

The scanner now accepts insertion order and rejects duplicate commitments within a page, replay of the starting cursor and cycles across pages in a bounded scan. Page shape is validated before ownership checks. Native ownership verification, capacity checkpoints, pending/reserved outputs and posting-change quarantine remain intact. No storage migration or wallet replacement is required.

All five unit tests passed, including descending insertion-order pagination with persisted resumption, duplicate/cycle rejection and existing capacity/pending/change checks. The regression suite is included in the GitHub pipeline.

Staged live-provider checks read 300 outputs from each Tari-hosted indexer. The A/B providers had 147/146 descending textual comparisons, proving that the former ordering assumption rejects ordinary responses. Resumption succeeded. Native wallet sync completed in Chromium and Firefox with temporary unfunded wallets; no claims, transfers or posts were made.

Repair image: sha256:257e806b66bf8f31bb26a796bf2f2c2b78c0b2d971c9f3d33eac09d233bf3ab4 (0.6.5-scan), built as a one-file overlay atop the deployed 0.6.4-gui release. A live-image guard prevented replacing an unexpected release. The tunnel URL and other image files were preserved.

Source references: Tari indexer storage_sqlite/reader.rs::utxos_list, REST handlers/utxos.rs::list_utxos and measured public responses. See output-scan-live.json for public verification results.

Public HTTPS verification passed in Chromium and Firefox with real provider pagination and complete native wallet scans. Readiness returned ready. The temporary staging container was removed and the release image was saved on the server. Live URL: https://payroll-levels-sensitivity-bit.trycloudflare.com/.
