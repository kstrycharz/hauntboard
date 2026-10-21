// Real released SDK/WASM proofs/signatures with synthetic provider rows. No network or spends.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as sdk from '../web/vendor/wallet-sdk.mjs';
import { prepareStealthFee, NATIVE } from '../web/stealth-fee.mjs';

const board = `component_${'a'.repeat(64)}`;
async function setup() {
  const signer = sdk.SecretKeyWallet.randomWithViewKey(16);
  const native = new sdk.WasmStealthCrypto(16),
    rows = new Map();
  const output = async () => {
    const generated = await native.generateOutputsStatement(
      [
        sdk.createOutput({
          destination: await signer.getAddress(),
          amount: 3000000n,
          resourceAddress: NATIVE,
        }),
      ],
      null,
    );
    const entry = JSON.parse(generated.statement.statementJson).outputs[0];
    const id = `utxo_${NATIVE.slice(9)}_${entry.output.commitment}`;
    const { sender_public_nonce, ...body } = entry.output;
    rows.set(id, {
      verified: true,
      version: 0,
      substate: {
        Utxo: {
          is_frozen: false,
          output: { ...entry, output: { ...body, public_nonce: sender_public_nonce } },
        },
      },
    });
    return id;
  };
  const provider = {
    network: () => 16,
    getCurrentEpoch: async () => 10,
    getSubstate: async (id) => rows.get(id),
    getStealthUtxo: async (resource, commitment) =>
      rows.get(sdk.stealthUtxoSubstateId(resource, commitment)),
    resolveInputs: async (inputs) => inputs.map((i) => ({ ...i, version: i.version ?? 0 })),
  };
  const instructions = new sdk.TransactionBuilder(16, 0)
    .callMethod({ componentAddress: board, methodName: 'create_thread' }, [
      sdk.literalArg('Public title'),
      sdk.intLiteral(0n),
      sdk.vectorLiteral(Array(16).fill(1)),
      sdk.vectorLiteral([1]),
    ])
    .buildUnsignedTransaction().instructions;
  return {
    signer,
    output,
    rows,
    args: {
      provider,
      signer,
      networkByte: 16,
      maxFee: 100000n,
      mainInstructions: instructions,
      mainInputs: [{ substate_id: board, version: 0, is_write: true }],
    },
  };
}

test('one wallet authorizes multiple independent outputs with fresh one-time keys and no persistent owner/account bytes', async () => {
  const { signer, output, args } = await setup();
  const owner = Buffer.from(await signer.getPublicKey());
  const spendSignatures = [];
  const sign = signer.addStealthSignature.bind(signer);
  signer.addStealthSignature = async (...values) => {
    const signature = await sign(...values);
    spendSignatures.push(signature.public_key);
    return signature;
  };
  const a = await prepareStealthFee({ ...args, coinId: await output() });
  const b = await prepareStealthFee({ ...args, coinId: await output() });
  assert.equal(spendSignatures.length, 2);
  assert(spendSignatures.every((key) => typeof key === 'string' && /^[a-f0-9]{64}$/.test(key)));
  assert.notEqual(spendSignatures[0], spendSignatures[1]);
  for (const ready of [a, b]) {
    assert(
      !Buffer.from(ready.envelope, 'base64').includes(owner),
      'Persistent owner public key must be absent from signed BOR.',
    );
    assert(
      ready.transaction.inputs.every(
        (i) => i.substate_id === board || i.substate_id.startsWith('utxo_'),
      ),
    );
    assert.equal(ready.transaction.instructions.length, 1);
    assert(ready.transaction.fee_instructions.some((i) => i.PayFeeFromBucket));
    assert.equal(ready.feeStatement.inputs_statement.revealed_amount, '0');
    assert(ready.feeStatement.outputs_statement.revealed_output);
  }
  assert.notDeepEqual(
    a.feeStatement.outputs_statement.revealed_output,
    b.feeStatement.outputs_statement.revealed_output,
  );
  assert.notEqual(a.coinId, b.coinId);
});

test('authorization is bound to the owned verified row and rejects missing or invalid versions', async () => {
  const { output, rows, args } = await setup();
  const id = await output();
  args.provider.getStealthUtxo = async () => {
    throw new Error('An unchecked second read must never replace the verified snapshot.');
  };
  await prepareStealthFee({ ...args, coinId: id });
  for (const version of [undefined, -1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    rows.get(id).version = version;
    await assert.rejects(prepareStealthFee({ ...args, coinId: id }), /Unverified/);
  }
});

test('registry changes carry their separate admin signer while the funding wallet key stays absent', async()=>{
  const {signer,output,args}=await setup(),admin=sdk.SecretKeyWallet.randomWithViewKey(16);
  const ready=await prepareStealthFee({...args,coinId:await output(),extraSigners:[admin]});
  const signed=Buffer.from(ready.envelope,'base64');
  assert(signed.includes(Buffer.from(await admin.getPublicKey())));
  assert(!signed.includes(Buffer.from(await signer.getPublicKey())));
});

test('native fee preparation rejects unverified, foreign, nonnative and frozen outputs without signing', async () => {
  const { signer, output, rows, args } = await setup();
  const id = await output();
  rows.get(id).verified = false;
  await assert.rejects(prepareStealthFee({ ...args, coinId: id }), /Unverified/);
  rows.get(id).verified = true;
  rows.get(id).substate.Utxo.is_frozen = true;
  await assert.rejects(prepareStealthFee({ ...args, coinId: id }), /owned/);
  rows.get(id).substate.Utxo.is_frozen = false;
  await assert.rejects(
    prepareStealthFee({ ...args, coinId: id, signer: sdk.SecretKeyWallet.randomWithViewKey(16) }),
    /owned/,
  );
  await assert.rejects(
    prepareStealthFee({ ...args, signer, coinId: id.replace('utxo_01', 'utxo_02') }),
    /native/,
  );
});
