# Third-party notices and provenance

Original Hauntbox source, synthetic stories, CSS/SVG illustrations and receipt probe are MIT licensed under `LICENSE`. Implementation began October 2, 2026 after the planning documents. Coding and verification used OpenAI Codex. No sibling Tari source snapshot was copied or modified.

| Dependency / asset | Use | License / retained notice |
|---|---|---|
| React / React DOM / scheduler | Browser rendering | MIT; `docs/licenses/react.txt`, `react-dom.txt`, `scheduler.txt` |
| Cormorant Garamond | Self-hosted headings | SIL OFL 1.1; `docs/licenses/fontsource-cormorant-garamond.txt` |
| DM Sans | Self-hosted controls | SIL OFL 1.1; `docs/licenses/fontsource-dm-sans.txt` |
| Vite / TypeScript / Vitest / Prettier | Container build and checks | Exact versions and transitive licenses in `docs/evidence/m1/dependency-licenses.json` |
| Playwright / axe | Container browser and accessibility verification | Apache-2.0 / MPL-2.0; license inventory retained |
| Tari wallet binary | Optional M2 candidate preflight | Upstream binary, unmodified, fetched from tagged release with verified SHA-256; upstream license below |
| Tari template library | Original M2 WASM compilation probe | Upstream crates.io dependency pinned in the spike lockfile; upstream BSD-3-Clause |

Reproduce browser dependency notices with `docker compose --profile tools run --rm node-tools node scripts/collect-notices.mjs`. The upstream wallet image is research only; its runtime package resolution is not an approved production dependency set. Keep the upstream license with any redistributed binary image. Network compatibility and release permissions remain separate from code provenance.

The Tari Project uses the following BSD-3-Clause notice (also retained in `docs/licenses/tari-BSD-3-Clause.txt`):

Copyright (c) 2019, The Tari Developer Community. All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
