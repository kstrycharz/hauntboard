# Verified board reads — 0.6.12

The user reported UNVERIFIED_BOARD_COMPONENT. At diagnosis, both Tari-hosted Esmeralda nodes verified the current and prior boards with the configured schema-4 template, and the live board endpoint succeeded. A persistent failure was not reproduced. The previous error combined an unverified provider row, non-component response and template mismatch without distinguishing them.

Public/client board, thread, page and raw component reads now fall back from the configured primary provider to the other explicitly approved Tari-hosted provider on unavailable or unverified state. The fallback is read-only. Transaction submission remains on the configured provider and uses the existing durable operation journal. Localnet has no public fallback. Both providers failing verification still produces an error. A verified row using a different template remains rejected with a distinct message.

Unit checks passed: unverified primary, primary outage, both unverified rejected, wrong template rejected, non-component rejected, and localnet isolation. Both GitHub build paths include these checks.

An isolated client-profile container deliberately returned an unverified row for the primary board fetch. All other network calls were real. `/api/board` returned the actual verified schema-4 Hauntboard Forums component through https://ootle-indexer-b.tari.com, and `/health/ready` succeeded. This injection is only a test preload; it is absent from the release image and live process. No transactions were submitted.

Release image: `sha256:265a53e92386cd53ec8daf222bb1a1d43a214559610939e90747a74f9e07c0f5`. Same deployed board, template and wallet reset identity. Release recreates app/preview only and preserves the tunnel.
