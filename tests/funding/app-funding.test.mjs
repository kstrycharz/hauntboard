import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fundingService } from '../../apps/api/funding.mjs';
const config = { network: 'localnet', maxFee: '1000000', maxReward: '10000000' };
const db = (backlog) => ({ query: async () => ({ rows: [{ count: backlog }] }) });
test('intake reserves bounded fees for backlog plus the next entry', async () => {
  const wallet = {
    fundingStatus: async () => ({ receiptRevealed: '2999999', rewardConcealed: '20000000' }),
  };
  const service = fundingService(db(2), config, wallet);
  await assert.rejects(service.requireReceipt(), { safeCode: 'RECEIPT_FUNDING_PAUSED' });
  const enough = fundingService(db(2), config, {
    fundingStatus: async () => ({ receiptRevealed: '3000000', rewardConcealed: '20000000' }),
  });
  await enough.requireReceipt();
  assert.equal((await enough.inspect()).receiptReserve, '3000000');
});
test('private rewards need concealed inputs plus the capped fee reserve', async () => {
  const service = fundingService(db(0), config, {
    fundingStatus: async () => ({ receiptRevealed: '2000000', rewardConcealed: '10999999' }),
  });
  const status = await service.inspect();
  assert.equal(status.receiptReady, true);
  assert.equal(status.rewardReady, false);
});
test('public funding status excludes operator balances and account identifiers', async () => {
  const service = fundingService(db(0), config, {
    fundingStatus: async () => ({
      receiptRevealed: '2000000',
      rewardConcealed: '20000000',
      faucetBalance: '1000000000',
    }),
  });
  const publicStatus = service.publicStatus(await service.inspect());
  assert.equal(publicStatus.receiptFundingReady, true);
  assert.equal(publicStatus.rewardFundingReady, true);
  assert(!Object.keys(publicStatus).some((key) => /balance|account|reserve/i.test(key)));
  assert.equal(publicStatus.automationEnabled, false);
});
test('missing wallets and read outages fail closed without alternative funding', async () => {
  for (const wallet of [
    null,
    {
      fundingStatus: async () => {
        throw new Error('private upstream content');
      },
    },
  ]) {
    const service = fundingService(db(0), { ...config, network: 'esmeralda' }, wallet);
    const status = await service.inspect();
    assert.equal(status.receiptReady, false);
    assert.equal(status.rewardReady, false);
    assert.equal(status.provider, 'public-faucet');
    assert(!JSON.stringify(status).includes('upstream'));
    await assert.rejects(service.requireReceipt(), { safeCode: 'RECEIPT_FUNDING_PAUSED' });
  }
});
