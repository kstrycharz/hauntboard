# Indexer runtime and hosted faucet repair — October 13, 2026

The live Tari Esmeralda providers upgraded to 0.46.0 while Hauntboard required 0.45.0. The exact runtime witness check correctly rejected the mismatch, making readiness and API requests unavailable. The hosted environment also had HAUNTBOARD_FAUCET_ENABLED=false.

Updated network.public.json and the VPS network.json to require 0.46.0. Preserved all other manifest fields, the existing board/template, false compatibility/privacy evidence flags, and the operations volume. Enabled the hosted faucet in /opt/hauntboard/.env; self-hosted defaults remain off. Backups of the prior manifest, environment and deployment helper are retained in /opt/hauntboard/repair-20261013. The existing application image was retained.

The deployment helper now requires successful HTTP readiness even when CURRENT_RELEASE already matches the newest release. Installed the same helper on the VPS after shell syntax validation.

Validation: seven delivery safeguard tests passed in a read-only container on the VPS. Both approved live indexers passed the 0.46.0 witness checks and returned verified existing-board components. Docker reported the recreated app healthy. Public HTTPS readiness returned 200; config reported runtime 0.46.0 and faucetEnabled=true. An authenticated indexer network read returned Esmeralda byte 38. An empty faucet request returned 400 for invalid signed bytes without submitting any transaction. The unchanged-release deployment path passed its new readiness check.

Limits: No signed transaction simulation or submission, faucet claim, refill, or chain spending was performed. The shared faucet balance was below the client's 1,000,000,000 atomic-unit minimum during diagnosis, so successful funding remains dependent on an upstream refill. These checks establish live provider reads and application readiness, not complete transaction compatibility or a completed faucet claim.
