# VPS and GitHub deployment

## Current origin

Public visitors use HTTPS for `hauntboard.taritracker.com` and `testnet-faucet.taritracker.com`. The shared Caddy edge redirects visitor HTTP requests to the corresponding HTTPS hostname with status 308, preserving paths and queries. Verified HTTPS responses include one-day HSTS without `includeSubDomains` or preload. The supplied `Caddyfile.cloudflare` contains both hostname routes.

Cloudflare supplies browser TLS and still reaches the VPS origin over HTTP on port 80 under the recorded Flexible setup. Keep this listener open until origin TLS is installed and Cloudflare is migrated to Full (strict). The proxy serves application traffic only when the immediate peer matches Cloudflare's current IP ranges and its `X-Forwarded-Proto` is `https`; direct-origin spoofed headers cannot bypass the redirect. Local GET/HEAD health checks have a narrow exception for loopback and the observed Docker gateway `172.18.0.1`, so deployment readiness remains runnable. Verify the gateway and refresh Cloudflare ranges when changing the network.

Configure a proxied A record `hauntboard` -> `104.131.40.85`. A Cloudflare Tunnel connector is not used in this setup. The app requires canonical HTTPS Origin headers on writes. Port 80 must not be closed merely to enforce visitor HTTPS: that would break the existing Cloudflare origin connection. Cloudflare's Always Use HTTPS is another visitor redirect option, but it applies zone-wide; a hostname-specific rule avoids altering unrelated subdomains. Full (strict) additionally requires a matching trusted origin certificate and port 443 before switching the Cloudflare mode.

The application has no public internal port or Docker socket, runs as the Node non-root user, and retains its operations volume. The app is an explicitly enabled Esmeralda testnet beta; compatibility/privacy evidence flags remain honest rather than being changed to bypass release gates. Built-in faucet claims are removed. The wallet links to https://testnet-faucet.taritracker.com/ for test tokens.

## Automatic releases

The public source repository builds/tests on GitHub-hosted runners when runtime files on `main` change. The successful release includes an image archive, its image ID, source commit, SHA256 checksums and the existing contract/manifest. No contract is published and no board is reset.

The VPS GitHub Actions runner belongs only to the private `kstrycharz/hauntboard-deploy` repository. It never runs public pull requests. Its private workflow checks the latest successful source release every 10 minutes (GitHub scheduling can be delayed), or immediately through **Run workflow**. It calls a fixed server deployment script, downloads the release, verifies checksums and image identity, checks candidate readiness and updates the app. Failed readiness after switching restores the previous image. Only one deployment may run at a time. Runner access to Docker is administrative access; keep the deployment repository private and access restricted.

## Server files and recovery

Runtime configuration lives in `/opt/hauntboard`: `.env`, `network.json`, `compose.yaml`, `Caddyfile` and `CURRENT_RELEASE`. Root-owned deployment tooling is `/usr/local/sbin/hauntboard-deploy`, with `verify-image.py` installed at `/usr/local/lib/hauntboard/verify-image.py`. That helper verifies the Docker-save config hash across classic and containerd image stores; the app is pinned to the VPS store's immutable image ID. Changes to these administrative scripts require a reviewed SSH installation; app updates are automatic. The runner is installed as a system service under the `hauntdeploy` account. Its configuration credential stays on the server and never enters the source repository.

Inspect: `cd /opt/hauntboard && docker compose ps`. Readiness is `/health/ready`; liveness alone is insufficient. To restore a retained image, set `APP_IMAGE` in `.env` to the previously recorded image ID and run `docker compose up -d --wait`. Do not delete the operations volume. Browser wallet recovery is separate: keys live in each user's browser.

The public board/template addresses are in `network.public.json`. Preserve them during updates. New contract publication requires separate review and an explicit fee budget. Back up operational data off the VPS; logs are bounded. The deployment cache retains only the current downloaded archive; old image pruning must preserve the previous rollback image.
