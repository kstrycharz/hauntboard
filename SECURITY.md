# Security scope

Hauntboard is an Esmeralda testnet beta. Wallet phrases, PINs, private keys and signing stay in each user's browser. Public messages are immutable chain data. Testnet currency has no monetary value; mainnet and participant deposits are unsupported.

Do not publish wallet secrets, recovery files, private keys or tokens in issues. Report suspected issues privately to the repository owner through an established private channel. A dedicated reporting address is not yet configured.

The VPS serves a non-root container with no Docker socket or wallet signing credentials. A separate private repository controls its administrative deployment runner. Local clients still trust this code and approved Tari-hosted providers. Compatibility/privacy verification flags remain false in the explicit beta profile; this is not complete anonymity or a fully verified production release.
