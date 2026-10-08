# Wallet balance at the top of the board and posting forms

Release 0.5.8 displays the unlocked browser wallet's verified total balance in the page header. Selecting that balance opens wallet details. The new-thread and reply forms show the same total; when available posting funds differ from the total, the forms also show the ready amount. Existing wallet actions refresh the displayed amount, and confirmed or rejected browser transactions refresh it after their wallet receipt is processed. Opening a new thread also refreshes the amount.

The balance disappears on wallet lock, background locking and page reload. A request-version guard prevents an older response from replacing a later wallet balance. Provider failures show `Balance unavailable`, rather than a cached amount or a fabricated zero. The display uses the existing native balance verification/decryption path; no wallet keys, seed phrases or passwords are sent to the server for this UI change.

Desktop (1280 px) and mobile (390 px) checks exercise wallet creation, the header and form amount, header navigation to wallet details, lock/reload hiding, unlock refresh, horizontal overflow and a network failure. The validation wallets are unfunded and their zero balance comes from real Esmeralda reads; the tests make no faucet claims, transfers or public posts.

Live URL: https://payroll-levels-sensitivity-bit.trycloudflare.com/
Image: `sha256:7988a9ae17fc024bbed82ae488ba46a621ced88beca386b2e206be4797a4b726`

Verification files: `wallet-balance-chromium.json` and `wallet-balance-firefox.json`. GitHub Actions includes the same browser checks against the isolated chain.

Both browsers passed the same checks against the deployed public HTTPS URL on October 7 (America/New_York). The health endpoint returned `ready`; the existing tunnel was not restarted. Release 0.5.8 retains the 0.5.7 native Tari wallet import adapter and contract configuration.
