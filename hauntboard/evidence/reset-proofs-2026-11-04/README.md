# Post-reset proof refresh — November 4, 2026

The November 2 Esmeralda reset erased the old board, rooms and registries. This
refresh uses the already deployed reset board and registry template. It creates
a fresh `SECRET THREAD!`, two managed sealed replies, a recipient grant and a
removal/key rotation. A separate public thread contains a readable post and reply.

[Execution and access checks](../room-key-esmeralda-reset-2026-11-04.json) record
recipient delivery, outsider rejection, encrypted recovery, retained historical
access and future-message exclusion after removal. The remaining reader unwraps
the new generation's on-chain recipient envelope before decrypting the later
message. All five posted payloads were matched byte-for-byte to verified page
state. Keys and the resumable signed-operation journal remain in the retained
private reset operator volume; they are excluded from this bundle.

[Both-provider summary](summary.json) records matching Commit receipts for the
eight core proof stages and two additional public posting transactions. Every
receipt substate reports verified and includes proof material. The registry
template was published on November 2; its transaction body/result has expired,
but its Commit receipt remains available. All nine November 4 transactions had
full transaction records and finalized results at capture time. Each provider
has separate raw transaction, result, receipt, receipt-proof and decoded state
captures in this directory.

Provider assertions and included proof material do not establish independent
consensus verification. Veil verification was not rerun for these transactions.
The October 30 Merkle failure concerned the pre-reset demonstration; it is not a
verification result for the replacement rotation. Complete independent proof
verification remains unresolved.

Nine new transactions paid 404519 microtari (0.404519 test TARI). Cumulative
reserved maximum fees, including the prior reset deployment and notice, are
5252819 microtari, within the retained 20-test-TARI authorization. The 8000008
microtari converted into demonstration outputs is funding, separate from fees.
No template or board was republished for this refresh. The old October execution
record is retained as `room-key-esmeralda-2026-10-21.json`.

The hosted `/proof` page now serves the replacement eight-stage record. Local
Chromium/Firefox checks cover proof navigation, accessibility and responsive
layout; [live acceptance](../reset-proofs-live-2026-11-04.json) checks the deployed
record, registry generation 1/revision 2, readable public posts and sealed
outsider view without submitting transactions. These checks do not establish
Sapient funded-extension posting or complete the separate unlinkability audit.
