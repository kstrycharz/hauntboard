# Hauntboard surviving receipt evidence — October 30, 2026

Read-only live lookup of both Tari-hosted Esmeralda indexers. The network reported epoch 12747. Exact UTC retrieval timestamps are in summary.json.

All eight recorded room-demo transactions and the two original deployment transactions returned HTTP 404 for /transactions/{id}, but HTTP 200 for /transaction-receipts/{id} and /substates/txreceipt_{id}?include_proof=true on both providers. All receipts report Commit. All receipt substates report verified: true and include proof material. This provider assertion is distinct from independent proof verification.

## Receipt links

| Recorded purpose | Epoch | Paid (microtari) | Veil receipt substate | Raw receipt |
|---|---:|---:|---|---|
| publishRegistry | 12541 | 857984 | [Open](https://explorer.tari.mw/substate/txreceipt_a2ebf2a17314b09055e264fdc0d7ca00308798921ca1152c95a9a07f5f92b3a9) | [JSON](https://ootle-indexer-a.tari.com/transaction-receipts/a2ebf2a17314b09055e264fdc0d7ca00308798921ca1152c95a9a07f5f92b3a9) |
| preparePostingFunds | 12541 | 41504 | [Open](https://explorer.tari.mw/substate/txreceipt_1921b0b203c3c2612d5646695f417e4495859f0a3ca8d960d51ce58598185499) | [JSON](https://ootle-indexer-a.tari.com/transaction-receipts/1921b0b203c3c2612d5646695f417e4495859f0a3ca8d960d51ce58598185499) |
| sealedOpeningPost | 12541 | 48317 | [Open](https://explorer.tari.mw/substate/txreceipt_43cb29626638e68e94ac89814256dc58727acb212ed05e07b7f00305bed3acc6) | [JSON](https://ootle-indexer-a.tari.com/transaction-receipts/43cb29626638e68e94ac89814256dc58727acb212ed05e07b7f00305bed3acc6) |
| createKeyRegistry | 12541 | 19601 | [Open](https://explorer.tari.mw/substate/txreceipt_b2f1d5aa37f2d3c33d4bd9a4de7f9cb00fceb5ba34f98cb4b89b6921a21aeb03) | [JSON](https://ootle-indexer-a.tari.com/transaction-receipts/b2f1d5aa37f2d3c33d4bd9a4de7f9cb00fceb5ba34f98cb4b89b6921a21aeb03) |
| grantBobAccess | 12541 | 23166 | [Open](https://explorer.tari.mw/substate/txreceipt_48d270a0b6e7b000a768885a801215c890fc7b1b9f4de3e5a3a08295e47ffc95) | [JSON](https://ootle-indexer-a.tari.com/transaction-receipts/48d270a0b6e7b000a768885a801215c890fc7b1b9f4de3e5a3a08295e47ffc95) |
| managedPostBeforeRemoval | 12541 | 77913 | [Open](https://explorer.tari.mw/substate/txreceipt_efc653fa6eb9e20dc6d2fe93eb5ccb19945845e4505bf92435fbda5a55e016ac) | [JSON](https://ootle-indexer-a.tari.com/transaction-receipts/efc653fa6eb9e20dc6d2fe93eb5ccb19945845e4505bf92435fbda5a55e016ac) |
| removeBobAndRotate | 12541 | 28108 | [Open](https://explorer.tari.mw/substate/txreceipt_90f6b630229ec2bd00f402b26a39474e556c41bb5b90908a58831cdc08ec2d12) | [JSON](https://ootle-indexer-a.tari.com/transaction-receipts/90f6b630229ec2bd00f402b26a39474e556c41bb5b90908a58831cdc08ec2d12) |
| managedPostAfterRemoval | 12541 | 103773 | [Open](https://explorer.tari.mw/substate/txreceipt_fa06f94a6c72591c140d75f3a1500a4918ae49b0cffbb511996b9f14b44c9e91) | [JSON](https://ootle-indexer-a.tari.com/transaction-receipts/fa06f94a6c72591c140d75f3a1500a4918ae49b0cffbb511996b9f14b44c9e91) |
| originalTemplatePublication | 11966 | 1000886 | [Open](https://explorer.tari.mw/substate/txreceipt_a285bf80b4e257187156979068ef6d8b2aaba2e6ecbe5c7f99c43317574ab67f) | [JSON](https://ootle-indexer-a.tari.com/transaction-receipts/a285bf80b4e257187156979068ef6d8b2aaba2e6ecbe5c7f99c43317574ab67f) |
| originalBoardCreation | 11966 | 1861 | [Open](https://explorer.tari.mw/substate/txreceipt_4cea075beef93e8a5cd7203f030006c88a236d53e02c809f158378d24045811e) | [JSON](https://ootle-indexer-a.tari.com/transaction-receipts/4cea075beef93e8a5cd7203f030006c88a236d53e02c809f158378d24045811e) |

The purpose names above are labels from the saved application evidence. A receipt commits to the outcome, intent commitment and state changes; these labels alone are not a recovered instruction body. Original transaction bodies/signatures were unavailable from these lookup routes.

## Veil verification result

On the rotation receipt substate, Show proof then Verify proof produced:

- Committee signed the anchor block: passed; at least 3 of 4 committee members.
- Value is in the signed state: failed.
- Exact error: substate value proof invalid: shard-root-in-group-root proof is invalid: Keys do not match.
- Key in proof: 4a04f89e8420a0e0efa09494ac567b3e31b91f2ad90712333ec4a73525c8f88e
- Expected key: 9b9a073251969fa75e2337ca7da5b04b384c8bdc3ef247a0d032d1ac217bd4e0
- Anchor epoch: 12747; height: 903; shard group: 1–256.
- Anchor block: 3b79b76d5de0d07242f0ad2cc93029ca7f3922b041b6791f2266d101aeafc422
- State Merkle root: 6efdfe4fcb8604d06abd372f9571fa57f792958eda79d132a6537f79705555dc
- Receipt value hash epoch: 12541.

See veil-rotation-verification.png. Only this one receipt was checked through the browser verifier; the remaining proof packages were retrieved, not independently verified. No conclusion about whether the mismatch originates in Veil or the provider is established. Committee keys themselves are obtained from the indexer.

## Interpretation

Missing transaction bodies do not mean the committed state or permanent receipts are gone. Veil uses ootle-indexer-a.tari.com and its ordinary transaction page currently stops on a missing transaction body; use the receipt-substate links above. The local read-only Tari source snapshot configures a default body retention window of 50 epochs, permits a configurable value or forever, and explicitly retains separately synced receipts. The live retention configuration was not inspected.

The receipt and state evidence does not establish the off-chain encryption/decryption checks, independent full consensus verification, or anonymity. Those require separate evidence.

## Files

- summary.json: retrieval metadata, statuses, receipt outcomes, epochs, fee payments, proof anchors and URLs.
- a-*.json / b-*.json: raw public provider responses, including receipt and proof packages.
- sha256.json: SHA-256 hashes for the downloaded JSON response set and summary.
- veil-rotation-verification.png: visible browser proof result.

No chain writes, transfers or deployments were performed.
