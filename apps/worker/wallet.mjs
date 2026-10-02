import { readFile } from 'node:fs/promises';
import { exactRpcUnits, NATIVE_RESOURCE } from '../../scripts/lib/wallet-funding-adapter.mjs';
import { problem } from '../api/security.mjs';
const hex = /^[a-f0-9]{64}$/;
const component = /^component_[a-f0-9]{64}$/;
export const bytesVariable = (bytes) => `[${Array.from(bytes, (byte) => `${byte}u8`).join(',')}]`;
export class NativeWallet {
  constructor(config, settings) {
    this.config = config;
    this.settings = settings;
  }
  async rpc(role, method, params) {
    if (
      ![
        'wallet.get_info',
        'transactions.get',
        'transactions.submit_manifest',
        'transactions.submit_instruction',
        'accounts.get_balances',
        'accounts.get_faucet_balance',
        'accounts.stealth_transfer',
      ].includes(method)
    )
      throw problem('WALLET_METHOD_NOT_ALLOWED');
    if (method === 'transactions.submit_manifest' && params.dry_run !== true)
      throw problem('MANIFEST_MUST_BE_DRY_RUN');
    const endpoint = this.settings[role];
    if (!endpoint) throw problem('WALLET_NOT_CONFIGURED', 503);
    const token = (await readFile(endpoint.tokenFile, 'utf8')).trim();
    const response = await fetch(endpoint.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    const body = await response.json();
    if (!response.ok || body.error || !body.result) throw problem('WALLET_REQUEST_REJECTED', 503);
    return body.result;
  }
  async verifyNetwork(role) {
    const info = await this.rpc(role, 'wallet.get_info', {});
    if (
      info.version !== '0.43.0' ||
      info.network !== this.config.network ||
      info.network_byte !== (this.config.network === 'localnet' ? 16 : 38)
    )
      throw problem('WALLET_NETWORK_MISMATCH', 503);
    if (!component.test(this.settings[role].account))
      throw problem('INVALID_OPERATOR_ACCOUNT', 503);
  }
  async transaction(role, id) {
    if (!hex.test(id)) throw problem('INVALID_TRANSACTION_ID');
    return this.rpc(role, 'transactions.get', { transaction_id: id });
  }
  async fundingStatus() {
    const balances = {};
    for (const role of ['receipt', 'reward']) {
      await this.verifyNetwork(role);
      const response = await this.rpc(role, 'accounts.get_balances', {
        account: this.settings[role].account,
        refresh: true,
      });
      if (response.address !== this.settings[role].account || !Array.isArray(response.balances))
        throw problem('WALLET_BALANCE_MISMATCH', 503);
      const native = response.balances.find((row) => row.resource_address === NATIVE_RESOURCE);
      balances[role] = {
        revealed: exactRpcUnits(native?.balance ?? '0'),
        concealed: exactRpcUnits(native?.confidential_balance ?? '0'),
      };
    }
    const faucet = await this.rpc('receipt', 'accounts.get_faucet_balance', {});
    return {
      receiptRevealed: balances.receipt.revealed,
      rewardConcealed: balances.reward.concealed,
      faucetBalance: exactRpcUnits(faucet.balance),
      faucetClaimAmount: exactRpcUnits(faucet.claim_amount),
    };
  }
  async dryCall(main, variables) {
    await this.verifyNetwork('receipt');
    const manifest = `${main.import ?? ''}\nfn fee_main(){let account=var!["account"];account.pay_fee(${this.config.maxFee});}\nfn main(){${main.body}}`;
    const dry = await this.rpc('receipt', 'transactions.submit_manifest', {
      manifest,
      variables: { account: this.settings.receipt.account, ...variables },
      max_fee: this.config.maxFee,
      dry_run: true,
      seal_signer_key_id: null,
    });
    const tx = await this.transaction('receipt', dry.transaction_id);
    if (tx.status !== 'DryRun' || !tx.result?.result?.Accept)
      throw problem('CHAIN_SIMULATION_REJECTED', 409);
    const maxFee = (BigInt(exactRpcUnits(dry.required_fees)) + 10000n).toString();
    if (BigInt(maxFee) > BigInt(this.config.maxFee)) throw problem('FEE_LIMIT_EXCEEDED', 409);
    const instructions = tx.transaction?.V1?.body?.transaction?.instructions;
    if (!Array.isArray(instructions) || !instructions.length)
      throw problem('INVALID_WALLET_INSTRUCTIONS');
    return { instructions, maxFee, execution: tx.result.execution_results };
  }
  async prepareRoom(room) {
    if (!hex.test(this.settings.template)) throw problem('ROOM_TEMPLATE_NOT_PUBLISHED', 503);
    return this.dryCall(
      {
        import: `use template_${this.settings.template} as Room;`,
        body: 'let room=Room::new(var!["id"],var!["network"],var!["thumbprint"],var!["policy"],var!["capacity"],None);',
      },
      {
        id: bytesVariable(Buffer.from(room.id.replaceAll('-', ''), 'hex')),
        network: JSON.stringify(room.network),
        thumbprint: bytesVariable(Buffer.from(room.key_thumbprint, 'base64url')),
        policy: bytesVariable(Buffer.from(room.policy_digest, 'hex')),
        capacity: `${room.capacity}u32`,
      },
    );
  }
  async prepareAnchor(room, envelope) {
    if (!component.test(room.component) || !hex.test(envelope.id) || !hex.test(envelope.digest))
      throw problem('INVALID_ANCHOR_CONTEXT');
    return this.dryCall(
      { body: 'let room=var!["room"];room.seal(var!["id"],var!["digest"]);' },
      {
        room: room.component,
        id: bytesVariable(Buffer.from(envelope.id, 'hex')),
        digest: bytesVariable(Buffer.from(envelope.digest, 'hex')),
      },
    );
  }
  async prepareClose(room) {
    return this.dryCall({ body: 'let room=var!["room"];room.close();' }, { room: room.component });
  }
  async submitCall(prepared) {
    return this.rpc('receipt', 'transactions.submit_instruction', {
      instructions: prepared.instructions,
      fee_account: this.settings.receipt.account,
      max_fee: prepared.maxFee,
      inputs: [],
      override_inputs: true,
      proof_ids: [],
    });
  }
  rewardRequest(recipient, amount, maxFee, dryRun) {
    const prefix = this.config.network === 'localnet' ? 'otl_loc_1' : 'otl_esm_1';
    // Standard 64-byte view/account public-key address only; reject embedded payment references.
    // Wallet SDK independently validates checksum, Ristretto keys and network during simulation.
    if (
      typeof recipient !== 'string' ||
      !recipient.startsWith(prefix) ||
      recipient.length !== prefix.length + 103 + 6 ||
      !/^[a-z0-9_]+$/.test(recipient)
    )
      throw problem('INVALID_SAME_NETWORK_ADDRESS');
    if (!/^[1-9][0-9]{0,18}$/.test(amount) || BigInt(amount) > BigInt(this.config.maxReward))
      throw problem('REWARD_LIMIT_EXCEEDED');
    return {
      owner_account: { ComponentAddress: this.settings.reward.account },
      resource_address: NATIVE_RESOURCE,
      input_selection: 'ConfidentialOnly',
      fee_params: { input_selection: 'ConfidentialOnly', pay_fee_with_swap: null },
      transfers: [
        {
          destination_address: recipient,
          blinded_output_amount: amount,
          revealed_output_amount: '0',
          output_memo: { Message: 'A candle for your story — Hauntbox' },
          pay_to: 'StealthPublicKey',
          attach_sender_address: false,
        },
      ],
      max_fee: maxFee,
      dry_run: dryRun,
    };
  }
  async quoteReward(recipient, amount) {
    await this.verifyNetwork('reward');
    const dry = await this.rpc(
      'reward',
      'accounts.stealth_transfer',
      this.rewardRequest(recipient, amount, this.config.maxFee, true),
    );
    const tx = await this.transaction('reward', dry.transaction_id);
    if (tx.status !== 'DryRun' || !tx.result?.result?.Accept)
      throw problem('PRIVATE_FUNDS_OR_FEE_UNAVAILABLE', 409);
    const maxFee = (BigInt(exactRpcUnits(tx.result.total_fees_required)) + 10000n).toString();
    if (BigInt(maxFee) > BigInt(this.config.maxFee)) throw problem('FEE_LIMIT_EXCEEDED', 409);
    this.checkPrivateTransfer(tx);
    return { maxFee };
  }
  checkPrivateTransfer(tx) {
    const body = tx.transaction?.V1?.body?.transaction;
    const statements = [...(body?.instructions ?? []), ...(body?.fee_instructions ?? [])]
      .filter((i) => i.StealthTransfer)
      .map((i) => i.StealthTransfer.statement);
    if (
      !statements.length ||
      statements.some((s) => s.inputs_statement.revealed_amount !== '0') ||
      !statements.some(
        (s) => s.inputs_statement.inputs.length > 0 && s.outputs_statement.outputs.length >= 2,
      )
    )
      throw problem('NATIVE_PRIVATE_TRANSFER_REQUIRED');
    const revealed = statements.map((s) => s.outputs_statement.revealed_output).filter(Boolean);
    if (revealed.length !== 1 || !body.fee_instructions.some((i) => i.PayFeeFromBucket))
      throw problem('PRIVATE_FEE_INTENT_INVALID');
  }
  async submitReward(intent) {
    await this.verifyNetwork('reward');
    return this.rpc(
      'reward',
      'accounts.stealth_transfer',
      this.rewardRequest(intent.recipient, intent.amount, intent.maxFee, false),
    );
  }
  async indexedComponent(address) {
    if (!component.test(address)) throw problem('INVALID_COMPONENT');
    const response = await fetch(
      `${this.settings.indexerUrl.replace(/\/$/, '')}/substates/${address}`,
      { redirect: 'error', signal: AbortSignal.timeout(10000) },
    );
    if (!response.ok) throw problem('INDEXER_UNAVAILABLE', 503);
    const row = await response.json();
    if (
      row.verified !== true ||
      row.substate?.Component?.header?.template_address.replace(/^template_/, '') !==
        this.settings.template
    )
      throw problem('UNVERIFIED_ROOM_COMPONENT', 503);
    return row;
  }
  async verifyRoom(room) {
    const indexed = await this.indexedComponent(room.component);
    const result = await this.dryCall(
      { body: 'let room=var!["room"];room.get_room();' },
      { room: room.component },
    );
    const value = result.execution?.[0]?.indexed?.value;
    if (
      JSON.stringify(value?.slice(0, 6)) !==
      JSON.stringify([
        Array.from(Buffer.from(room.id.replaceAll('-', ''), 'hex')),
        room.network,
        Array.from(Buffer.from(room.key_thumbprint, 'base64url')),
        Array.from(Buffer.from(room.policy_digest, 'hex')),
        room.capacity,
        null,
      ])
    )
      throw problem('ROOM_CHAIN_CONFIG_MISMATCH', 503);
    return { indexed, value };
  }
  async verifyReceipt(room, envelope) {
    const indexed = await this.indexedComponent(room.component);
    const result = await this.dryCall(
      { body: 'let room=var!["room"];room.get_receipt(var!["id"]);' },
      { room: room.component, id: bytesVariable(Buffer.from(envelope.id, 'hex')) },
    );
    const value = result.execution?.[0]?.indexed?.value;
    if (
      !Array.isArray(value) ||
      JSON.stringify(value[0]) !==
        JSON.stringify(Array.from(Buffer.from(envelope.digest, 'hex'))) ||
      !Number.isSafeInteger(value[1])
    )
      throw problem('RECEIPT_CHAIN_EFFECT_MISMATCH', 503);
    return { epoch: String(value[1]), version: String(indexed.version) };
  }
}
export async function configuredWallet(config, path = process.env.WALLET_SETTINGS_FILE) {
  if (!path) return null;
  const settings = JSON.parse(await readFile(path, 'utf8'));
  if (
    settings.network !== config.network ||
    settings.receipt.account === settings.reward.account ||
    settings.receipt.rpcUrl === settings.reward.rpcUrl
  )
    throw problem('OPERATOR_WALLETS_MUST_BE_SEPARATE');
  return new NativeWallet(config, settings);
}
