// Observational checks, not an anonymity proof. Inputs are public indexer data.
const hex = /^[a-f0-9]{64}$/;
const component = /^component_[a-f0-9]{64}$/;
const utxo = /^utxo_[a-f0-9]{64}_[a-f0-9]{64}$/;

export function transactionParts(row) {
  const raw = row?.transaction?.transaction ?? row?.transaction ?? row;
  if (!raw?.V1?.body?.transaction || !raw.V1.seal_signature?.public_key)
    throw new Error('Unsupported transaction encoding; cannot audit missing signer data.');
  const body = raw.V1.body;
  const tx = body.transaction;
  if (
    !Array.isArray(body.signatures) ||
    !Array.isArray(tx.inputs) ||
    !Array.isArray(tx.instructions) ||
    !Array.isArray(tx.fee_instructions)
  )
    throw new Error('Incomplete transaction data.');
  return { raw, tx, signatures: body.signatures, seal: raw.V1.seal_signature };
}

function publicKeys(value) {
  const keys = new Set();
  function visit(v) {
    if (!v || typeof v !== 'object') return;
    for (const [k, child] of Object.entries(v)) {
      if (k === 'public_key' && typeof child === 'string' && hex.test(child)) keys.add(child);
      else if (child && typeof child === 'object') visit(child);
    }
  }
  visit(value);
  return [...keys];
}

export function calledComponent(instruction) {
  return instruction?.CallMethod?.call?.Address ?? instruction?.CallMethod?.component_address;
}

export function auditPostingTransactions(
  records,
  { networkByte = 38, allowedComponents, ownerPublicKey } = {},
) {
  if (!Array.isArray(records) || records.length < 2)
    throw new Error('At least two distinct posting transactions are required.');
  if (
    !Array.isArray(allowedComponents) ||
    !allowedComponents.length ||
    !allowedComponents.every((a) => component.test(a))
  )
    throw new Error(
      'Supply the board, thread and page components independently verified as board state.',
    );
  if (ownerPublicKey !== undefined && !hex.test(ownerPublicKey))
    throw new Error('Only a public 32-byte owner key may be supplied.');
  const ids = new Set();
  const allowed = new Set(allowedComponents);
  const transactions = records.map((record) => {
    if (!hex.test(record.id ?? '') || ids.has(record.id))
      throw new Error('Transaction IDs must be distinct.');
    ids.add(record.id);
    const { raw, tx, signatures, seal } = transactionParts(record.row);
    const finalized = record.result?.result?.Finalized;
    const statements = tx.fee_instructions
      .filter((i) => i.StealthTransfer)
      .map((i) => i.StealthTransfer.statement);
    const inputIds = tx.inputs.map((i) => i.substate_id);
    const keys = publicKeys({ signatures, seal });
    if (!keys.length || inputIds.some((id) => typeof id !== 'string'))
      throw new Error('Missing signer or input metadata.');
    const calls = tx.instructions.filter((i) => i.CallMethod);
    const outputIds = (finalized?.execution_result?.finalize?.result?.Accept?.up_substates ?? [])
      .map(([id]) => id)
      .filter((id) => utxo.test(id));
    return {
      id: record.id,
      signers: keys,
      inputs: inputIds,
      outputs: outputIds,
      // A shared origin is an explicit public graph link even when signer checks pass.
      fundingOrigins: [...new Set(record.fundingOrigins ?? [])],
      fundingInspectionComplete: record.fundingInspectionComplete === true,
      checks: {
        networkMatches: tx.network === networkByte,
        finalizedCommit:
          finalized?.final_decision === 'Commit' &&
          Boolean(finalized.execution_result?.finalize?.result?.Accept),
        boardPostCall:
          calls.length === 1 &&
          allowed.has(calledComponent(calls[0])) &&
          ['create_thread', 'append'].includes(calls[0].CallMethod.method),
        noUnexpectedComponentOrVault: inputIds.every(
          (id) => allowed.has(id) || utxo.test(id) || id === `resource_${'01'.repeat(32)}`,
        ),
        nativeStealthFee:
          statements.length === 1 && tx.fee_instructions.some((i) => i.PayFeeFromBucket),
        noRevealedFeeInput:
          statements.length === 1 &&
          String(statements[0]?.inputs_statement?.revealed_amount) === '0',
        ownerKeyAbsent: ownerPublicKey ? !JSON.stringify(raw).includes(ownerPublicKey) : null,
      },
    };
  });
  const pairs = [];
  for (let i = 0; i < transactions.length; i++)
    for (let j = i + 1; j < transactions.length; j++) {
      const a = transactions[i],
        b = transactions[j];
      const shared = (x, y) => x.filter((id) => y.includes(id));
      pairs.push({
        a: a.id,
        b: b.id,
        sharedSigners: shared(a.signers, b.signers),
        sharedNonBoardInputs: shared(a.inputs, b.inputs).filter(
          (id) => !allowed.has(id) && !id.startsWith('resource_'),
        ),
        directOutputSpends: [...shared(a.outputs, b.inputs), ...shared(b.outputs, a.inputs)],
        sharedFundingOrigins: shared(a.fundingOrigins, b.fundingOrigins),
      });
    }
  const observedLinks = pairs.some(
    (p) =>
      p.sharedSigners.length ||
      p.sharedNonBoardInputs.length ||
      p.directOutputSpends.length ||
      p.sharedFundingOrigins.length,
  );
  const failedChecks = transactions.some((t) => Object.values(t.checks).includes(false));
  return {
    version: 1,
    status: failedChecks || observedLinks ? 'EXPOSURE_DETECTED' : 'LIMITED_CHECKS_PASSED',
    transactions,
    pairs,
    strongUnlinkabilityProven: false,
    ownerReferenceProvided: Boolean(ownerPublicKey),
    fundingInspectionComplete: transactions.every((t) => t.fundingInspectionComplete),
    sameWalletProvenByPublicData: false,
    limitations: [
      'Distinct signers and no author field do not prove unlinkability.',
      'A same-wallet demonstration needs a private local attestation; public data alone cannot establish it.',
      'Funding ancestry beyond the inspected inputs, fees, timing, content and network connections remain observable.',
      'Indexer verified flags are provider assertions, not independent consensus verification.',
    ],
  };
}
