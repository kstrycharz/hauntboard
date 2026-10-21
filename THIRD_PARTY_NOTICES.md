# Third-party notices and provenance

Original Hauntboard source is MIT licensed under `LICENSE`. Coding and verification used OpenAI Codex. No sibling Tari source snapshot was copied or modified. Historical Hauntbox license records are retained where relevant; the current application uses the dependencies below.

| Dependency / asset | Use | License / retained notice |
|---|---|---|
| Ootle SDK 0.7.0 and Tari WASM 0.43.0 | Hauntboard browser key generation, transaction construction, signing and BOR envelopes | BSD-3-Clause; `docs/licenses/ootle-sdk-BSD-3-Clause.txt` and Tari notice below |
| @scure/bip39 2.0.1 | Hauntboard English 24-word mnemonic generation/checksum/entropy | MIT; upstream package license retained with browser dependencies |
| tari_ootle_wallet_crypto 0.45.0 / tari_utilities 0.10.0 | Native owner/view derivation in the recovery adapter | BSD-3-Clause; Tari notice below, dependencies fixed by wallet-recovery/Cargo.lock |
| cbor-x 1.6.6 | Hauntboard contract argument encoding | MIT; `docs/licenses/cbor-x-MIT.txt` |
| Vite | SDK bundle build | MIT; version pinned in `hauntboard/browser-sdk/package.json` |
| Playwright / axe | Container browser and accessibility verification | Apache-2.0 / MPL-2.0; license inventory retained |
| Tari template library | Public schema-4 contract | BSD-3-Clause; pinned in `hauntboard/template-public/Cargo.lock` |

Browser dependency versions are pinned in `hauntboard/browser-sdk/package.json` and its lockfile; Rust dependencies are pinned in their Cargo lockfiles. Use `hauntboard/scripts/build-release.sh` for the current container build. Retained notices are in `docs/licenses/`. Network compatibility and release permissions remain separate from code provenance.

The Tari Project uses the following BSD-3-Clause notice (also retained in `docs/licenses/tari-BSD-3-Clause.txt`):

Copyright (c) 2019, The Tari Developer Community. All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
# Native burn proof conversion

`hauntboard/burn-claim/src/l1_proof.rs` is derived from Tari's BSD-3-Clause licensed [v0.45.0 burn claim helper](https://github.com/tari-project/tari-ootle/blob/v0.45.0/applications/tari_ootle_app_utilities/src/burn_claim_proof.rs). Copyright 2026 The Tari Project. The import refers to the published template types crate; cryptography is performed by the native Tari libraries.


# HPKE recipient encryption

@hpke/core 1.9.0 and @hpke/common 1.10.1 provide the RFC 9180 implementation in hauntboard/web/vendor/hpke.mjs. MIT license:

MIT License

Copyright (c) 2023 Ajitomi Daisuke

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

