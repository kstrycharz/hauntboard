# VPS release verification — October 12, 2026

Target: https://hauntboard.taritracker.com, VPS 104.131.40.85.

Cloudflare serves public HTTPS and proxies to HTTP port 80. Caddy forwards the canonical Host to the non-root app; its internal port is not published. The private GitHub Actions runner is online in kstrycharz/hauntboard-deploy and checks tested public releases every ten minutes, with manual dispatch available. Public pull requests execute only on GitHub-hosted runners.

The existing Esmeralda board and template were preserved. No new contract was published, no wallet data was migrated to the server, and no public chain transaction was submitted during this release work.

Validation:

- Local Docker client starts healthy and reads the same published board without the hosted VPS.
- Five deployed-contract engine tests passed in GitHub Actions run 38304387390. Rebuilding the exact deployed source produced WASM SHA256 75d3ab7a2e9265e1565ddd293aa651ae7a4e7687ccc1f148d371acc0c66d9582.
- Nineteen server/wallet foundation tests and four session-recovery tests passed; non-root/read-only runtime smoke checks passed.
- Eight GUI scenarios passed in each of Chromium and Firefox, using simulated providers and zero chain writes.
- Public HTTPS asset hashes, PIN behavior and responsive layouts passed in both browsers; see vps-browser-release.json.
- A live expired-session request refreshed once and completed a read-only provider query. A wrong-origin request remained rejected. No transaction or faucet request was made by this test.
- GitHub release builds passed for source commits 4de6996, 1a19be7, 5224a0b and 480e54f. Private runner deployments succeeded, including a subsequent app update that preserved the board and operations volume.

The first deployment stopped safely when classic Docker and containerd reported different image identifiers. The deployment helper now verifies the loaded image's config hash against GitHub's checksummed build, then pins its immutable local image ID. It also validates archive checksums and source identity before starting a candidate, and restores the previous image if the post-switch health check fails.

Limits: This is an explicit Esmeralda beta; compatibility/privacy verification flags remain false. Local clients still depend on approved Tari-hosted indexers. Physical iPhone/VoiceOver checks and human usability testing are not completed. The shared testnet faucet was reported empty by the user's claim attempt; refilling it was not part of this deployment and no spending budget was assumed.
