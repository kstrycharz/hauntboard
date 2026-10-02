# M1 — frontend acceptance evidence

Implemented and verified October 2, 2026. This directory contains **synthetic fixture evidence only**, with no live chain receipts or funds transfers.

## Acceptance

| Requirement | Observation / artifact |
|---|---|
| Clickable React / TypeScript / Vite frontend | `apps/web`, seven hash routes, typed `HauntboxAdapter` |
| Entrance and guided demo | `01-entrance-1440.png`; one-click prefilled guided journey |
| Submission and byte bounds | `02-submission-desk.png`; UTF-8 validation, empty/oversize/unsupported-address errors |
| Sealed receipt / export | `03-sealed-receipt.png`, `sample-receipt.json`; synthetic bytes and their SHA-256 digest |
| Curator lock / open | `04-curator-locked.png`, `05-curator-opened.png`; explicit role simulation and local key lock |
| Deliberate discretionary reward | `06-reward-review.png`, `07-reward-confirmed.png`; recipient, amount, network, estimate, custody checkbox |
| Privacy inspector | `08-privacy-inspector.png`; public/curator/operator views and separate app/native claims |
| Recovery and outages | `09-recovery.png`; lost key, unreadable envelope, network, delayed receipt, unavailable wallet, unknown outcome |
| 360 / 768 / 1440 px | Width-suffixed screenshots: entrance, desk, receipt, inbox, reward, privacy; no horizontal overflow |
| Keyboard journey | Chromium and Firefox: Tab / Shift+Tab, Enter, Space; no pointer interactions in the keyboard test |
| Reduced motion | Both browsers: computed envelope animation is `none` under reduced-motion emulation |
| Contrast / core accessibility | Axe WCAG 2 A/AA + WCAG 2.1 AA checks on seven routes and populated receipt/inbox/reward at all three widths; zero detected violations |
| Unit tests | 7 pass: Unicode limits, address boundary, fixture privacy, failure states, amount bounds, recipient/wallet gate, concurrent unknown confirmation |
| Browser tests | 22 pass across Chromium and Firefox, including positive journey, failure/recovery, optional recipient, safe text rendering, reload while pending |
| Frozen dependency install / production build | Container build from repository source, `pnpm install --frozen-lockfile`, TypeScript and Vite build pass |
| Runtime | Non-root multi-stage preview container; host access binds to loopback only |
| Dependency audit | `pnpm audit --prod`: no known vulnerabilities found at this inspection |
| Probe secret containment | `secret-scan.json`: no exact local unlock values found in frontend source, build assets or public evidence; this does not replace full live leak testing |
| Walkthrough | `walkthrough.webm`, the automated Chromium fixture journey (generated from a passing browser run) |

The fixture adapter performs no encryption. The story and sample address are held in this browser tab's memory until reset/reload. The exported synthetic envelope contains neither. The SHA-256 hash is real, but hashes **synthetic bytes** and proves no inclusion. Changing the story does not produce a content commitment in M1. Every fixture identifier starts with `mock-` and there is no live explorer URL.

## Reproduce

Run from the repository root, with Docker Desktop's Linux engine:

```sh
docker compose --profile mock up --build web-dev
docker compose --profile tools run --rm node-tools pnpm format:check
docker compose --profile tools run --rm node-tools pnpm check
docker compose --profile tools run --rm node-tools pnpm test
docker compose --profile tools run --rm node-tools pnpm build
docker compose --profile test run --rm e2e
docker compose --profile preview up --build web-preview
```

For a quality run without first starting the mock, install into the named volumes with `docker compose --profile tools run --rm node-tools pnpm install --frozen-lockfile`. The E2E service installs itself from the lockfile and starts its own Vite instance on container localhost, which is a browser secure context. Browser binaries, Node, pnpm, and Rust run inside containers; no host toolchain installation was used.

The browser test generates the screenshots and recording. A JSON result report is retained as `test-results.json`. The Playwright HTML report and failure traces remain ignored working artifacts.

`quality-checks.txt` retains the style/type/unit/build/audit output. `SHA256SUMS` records the delivered evidence bytes. The local preview image identity and toolchain base digests are recorded in `build-manifest.json`; no image has been pushed or deployed publicly.

## PM and architect reviews

**PM:** The entrance explains the three actions in plain language. The primary button reaches a sample journey without account/wallet setup. The participant path ends at the receipt; “View the curator demo” explicitly switches roles. Optional testnet reward language accompanies the candle metaphor. Errors preserve the draft or intent and offer a recovery action. Early PM-00 comprehension trials are prepared but have not occurred; live M6 trials remain required.

**Architect:** The adapter isolates wallet operations. Every chain/payment state is explicitly simulated. Unknown outcomes have no resend action; repeated/concurrent adapter confirmations return the same reserved result. The reward review discloses custody and operator visibility. Public receipt/inspector records omit the text, sample recipient, amount, and reward linkage. No native privacy or real encryption is claimed as implemented.

**Limitations:** automated keyboard interaction and visual screenshot review are complete; manual assistive-technology testing, WebKit, real mobile hardware, real encryption, durable storage, authentication, live receipts, and native transfers are not verified. Reload clears fixture state and displays a useful empty state. Automated accessibility checks are evidence for the tested surfaces, not accessibility certification.

Next work package: **INT-01 / M2**. See the dated capability report and pending compatibility ADR before any backend feature work.

## October 2 continuation — UX-01a

Fresh container verification: formatting, TypeScript, seven unit tests and production build pass; all 22 Chromium/Firefox browser tests pass (1.7 minutes). Journey checks now assert participant completion and the explicit curator transition. Screenshots, walkthrough and browser JSON were regenerated for this follow-up. Original acceptance evidence is retained in the `m1-accepted` tag; see `docs/source-baseline.md`. The existing quality/build manifests describe the original baseline run and image; the updated production preview is a local convenience, not a release image.
