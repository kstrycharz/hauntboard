# Stock Sapient posting

User decision, October 30, 2026: use the official, unchanged Sapient extension. Wallet-side remediation/fork proposals are superseded for this integration. The historical privacy findings remain valid limitations; they are not prerequisites for this user-selected stock-wallet route.

Connect through Wallet → Sapient & wallet options. A connected compatible provider is used for new threads and replies, including locally encrypted payloads. The browser wallet is not required for those actions. Hauntboard uses native SDK argument encoding and stock `tari_createTransactionRequest`, `tari_getTransactionRequest`, and `tari_submitTransactionRequest`; approval takes place in the extension. Private fees are required with a maximum of 1 test TARI per requested transaction. Users need eligible private funds in Sapient. Room administration retains its existing browser-held additional signer.

Hauntboard persists the request ID before submitting and marks the submit attempt before the provider call. On reload, reconnect the original account and check the existing operation. An ambiguous send is not automatically repeated. A request lost before its creation response, or a wallet worker stranded in submitting/failed without a transaction ID, can require manual investigation in Sapient. Never replay such an operation through another wallet. Wallet-internal behavior remains under Sapient's control.

Network name is checked before connection and submission; Hauntboard keeps its existing pinned board/template/reset. Stock Sapient exposes no independent reset binding. Persistent signatures and wallet-managed change may link posts. No anonymity or parity with the browser wallet's fee-change isolation is claimed. No wallet secret or private-view grant is requested.

Validation distinguishes deterministic provider/browser tests from a real extension funded-chain test. Neither simulated approvals nor successful website deployment establishes real funded execution. Existing verification flags remain unchanged.
