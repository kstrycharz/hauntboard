# Local application acceptance

October 2, 2026. The actual isolated-chain application journey passes. This is local test evidence, not public Esmeralda proof.

The browser authenticated a curator with actual WebAuthn against the API, created/exported/restored a room encryption key, activated a native HauntboxRoom, encrypted a synthetic story and same-network recipient, uploaded ciphertext-only context, and received a verified native inclusion receipt. Reload recovered the stored encrypted submission. An identical upload created no replacement job. A clean browser restored the private room key and decrypted locally. Explicit payout disclosure/quote/confirmation caused a native concealed reward from the independent reward wallet; the recipient wallet scanned its amount and encrypted memo. Application restart/recovery reused the accepted operations with zero new actual submissions.

Sanitized checks are in local-app-journey.json. Exact IDs, recipient data, tokens, virtual passkeys and recovery exports remain in the private local job volume. No browser traces or plaintext stories are exported as evidence.

Verification: 11 web units; 50 funding/config/RPC units; 14 actual PostgreSQL API/worker tests (worker transport faults deliberately injected); six Tari spike engine tests; four actual room engine tests; 24 Chromium/Firefox tests. The full local journey uses real wallets/indexer/validator, rather than a fake transport. Hosted CI is prepared but has not run.

The production build serves localhost:8180 through non-root Caddy and a non-root API, both with read-only root filesystems and all capabilities dropped. The API/database are private. Browser inspection confirms the optional wallet-address field and both participant/operator wallet setup paths. Funding checks show local receipt/reward reserves ready, while production operator credentials are not connected. Public mutation flags remain false.

Prepared HTTPS and operator-wallet overlays pass configuration validation with a dummy domain; no public deployment, certificate issuance, faucet claim or token movement was performed. Public M2b proof, owner inputs, wallet backup/restore, off-host custody and rollback drills, external trials and soak remain release gates. See the application runbook and current project plan.
