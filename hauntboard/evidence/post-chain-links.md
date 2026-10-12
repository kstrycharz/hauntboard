# Post chain links — October 12, 2026

Deployed runtime source: b1196f8b3dc40081c0f259cf7686fd7d37c9efa0.
Site: https://hauntboard.taritracker.com.

Forum rows link directly to their thread component. Individual posts link to the page component that stores their payload, including opening posts, replies and older paginated posts. Post details identify page address, page number and entry/raw array index. Esmeralda links go directly to the approved Tari-hosted indexer, outside the Hauntboard VPS. Localnet links use the raw-state route.

Three unit tests cover page boundaries, older posts, schema-2 compatibility and rejection of invalid locations/providers. Chromium and Firefox checks passed against both the local Docker client and the public HTTPS deployment, with exact byte comparisons between two existing displayed posts and the independently fetched component payloads. Layouts passed at 320, 390 and 1280 pixels. The existing nine GUI scenarios passed in each browser after updating the fixture's static module list and page address to match the real schema-4 model.

GitHub release build 38306961879 and private VPS deployment 38307043900 succeeded. No chain transaction, faucet request or wallet access was needed for these checks. See post-chain-links.json for public browser evidence.

These links show current indexer-reported chain state, not proof of authorship or independent consensus verification. Testnet resets can remove state.
