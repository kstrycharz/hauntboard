# VPS and GitHub deployment

## Current origin

The VPS serves HTTP on port 80 for `hauntboard.taritracker.com`. Cloudflare supplies browser HTTPS and proxies to the origin over HTTP, as requested. Configure a proxied A record `hauntboard` -> `104.131.40.85`, and Cloudflare SSL/TLS mode **Flexible** for this HTTP origin. A Cloudflare Tunnel connector is not used in this setup. The app requires canonical HTTPS Origin headers on writes; do not browse the bare IP to use wallets.

The application has no public internal port or Docker socket, runs as the Node non-root user, and retains its operations volume. The app is an explicitly enabled Esmeralda testnet beta; compatibility/privacy evidence flags remain honest rather than being changed to bypass release gates. The faucet defaults off for self-hosted copies.

## Automatic releases

The public source repository builds/tests on GitHub-hosted runners when runtime files on `main` change. The successful release includes an image archive, its image ID, source commit, SHA256 checksums and the existing contract/manifest. No contract is published and no board is reset.

The VPS GitHub Actions runner belongs only to the private `kstrycharz/hauntboard-deploy` repository. It never runs public pull requests. Its private workflow checks the latest successful source release every 10 minutes (GitHub scheduling can be delayed), or immediately through **Run workflow**. It calls a fixed server deployment script, downloads the release, verifies checksums and image identity, checks candidate readiness and updates the app. Failed readiness after switching restores the previous image. Only one deployment may run at a time. Runner access to Docker is administrative access; keep the deployment repository private and access restricted.

## Server files and recovery

Runtime configuration lives in `/opt/hauntboard`: `.env`, `network.json`, `compose.yaml`, `Caddyfile` and `CURRENT_RELEASE`. Root-owned deployment tooling is `/usr/local/sbin/hauntboard-deploy`, with `verify-image.py` installed at `/usr/local/lib/hauntboard/verify-image.py`. That helper verifies the Docker-save config hash across classic and containerd image stores; the app is pinned to the VPS store's immutable image ID. Changes to these administrative scripts require a reviewed SSH installation; app updates are automatic. The runner is installed as a system service under the `hauntdeploy` account. Its configuration credential stays on the server and never enters the source repository.

Inspect: `cd /opt/hauntboard && docker compose ps`. Readiness is `/health/ready`; liveness alone is insufficient. To restore a retained image, set `APP_IMAGE` in `.env` to the previously recorded image ID and run `docker compose up -d --wait`. Do not delete the operations volume. Browser wallet recovery is separate: keys live in each user's browser.

The public board/template addresses are in `network.public.json`. Preserve them during updates. New contract publication requires separate review and an explicit fee budget. Back up operational data off the VPS; logs are bounded. The deployment cache retains only the current downloaded archive; old image pruning must preserve the previous rollback image.
