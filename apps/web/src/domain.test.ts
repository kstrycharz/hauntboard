import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  byteLength,
  createMockAdapter,
  SAMPLE_ADDRESS,
  SAMPLE_STORY,
  validateAmount,
  validateDraft,
} from './domain';
afterEach(() => vi.useRealTimers());
const sample = { text: SAMPLE_STORY, payoutAddress: SAMPLE_ADDRESS };
describe('mock submission boundaries', () => {
  it('accepts exactly 2,000 UTF-8 bytes and rejects a multibyte overflow', () => {
    expect(byteLength('👻')).toBe(4);
    expect(validateDraft({ text: '👻'.repeat(500), payoutAddress: '' })).toBeUndefined();
    expect(validateDraft({ text: '👻'.repeat(500) + 'é', payoutAddress: '' })).toMatch(/exceeds/);
    expect(validateDraft({ text: '   ', payoutAddress: '' })).toMatch(/Write a story/);
  });
  it('rejects real and wrong-network addresses rather than suggesting they are validated', () => {
    expect(validateDraft({ ...sample, payoutAddress: 'mock-igor:recipient' })).toMatch(/Esmeralda/);
    expect(validateDraft({ ...sample, payoutAddress: 'real-wallet-address' })).toMatch(
      /not accepted/,
    );
    expect(validateDraft(sample)).toBeUndefined();
  });
  it('keeps the exported envelope free of plaintext and payout fields and simulates opening', async () => {
    vi.useFakeTimers();
    const adapter = createMockAdapter();
    const result = adapter.seal(sample, 'healthy');
    await vi.runAllTimersAsync();
    const envelope = await result;
    expect(JSON.stringify(envelope)).not.toContain(sample.text);
    expect(JSON.stringify(envelope)).not.toContain(SAMPLE_ADDRESS);
    expect(envelope.digest).toMatch(/^[a-f0-9]{64}$/);
    const opened = adapter.open(envelope, 'healthy');
    await vi.runAllTimersAsync();
    expect(await opened).toEqual(sample);
    adapter.reset();
    const missing = adapter.open(envelope, 'healthy');
    const rejected = expect(missing).rejects.toThrow(/no longer/);
    await vi.runAllTimersAsync();
    await rejected;
  });
  it('fails for network, unreadable envelope, and lost key with recovery advice', async () => {
    vi.useFakeTimers();
    const adapter = createMockAdapter();
    await expect(adapter.seal(sample, 'network-down')).rejects.toThrow(/draft is still here/);
    const result = adapter.seal(sample, 'delayed');
    await vi.runAllTimersAsync();
    const envelope = await result;
    expect(envelope.anchor).toBe('pending');
    for (const scenario of ['unreadable', 'lost-key'] as const) {
      const opening = adapter.open(envelope, scenario);
      const assertion = expect(opening).rejects.toThrow();
      await vi.runAllTimersAsync();
      await assertion;
    }
    const status = adapter.checkReceipt(envelope, 'network-down');
    await vi.runAllTimersAsync();
    expect((await status).anchor).toBe('unavailable');
  });
});
describe('mock reward boundaries', () => {
  it('rejects fractions, overprecision, negative, zero, overflow, and out-of-budget amounts', () => {
    for (const amount of ['0', '-1', '1.5', '1e3', '1001', '99999999999999999999', '01', ''])
      expect(validateAmount(amount)).toBe(false);
    expect(validateAmount('1')).toBe(true);
    expect(validateAmount('1000')).toBe(true);
  });
  it('requires a recipient and available wallet before a quote', async () => {
    const adapter = createMockAdapter();
    await expect(adapter.quote('', '25', 'healthy')).rejects.toThrow(/recipient/);
    await expect(adapter.quote(SAMPLE_ADDRESS, '0', 'healthy')).rejects.toThrow(/whole number/);
    await expect(adapter.quote(SAMPLE_ADDRESS, '25', 'wallet-down')).rejects.toThrow(/No reward/);
  });
  it('does not retry an unknown outcome, including concurrent confirmation', async () => {
    vi.useFakeTimers();
    const adapter = createMockAdapter();
    const q = adapter.quote(SAMPLE_ADDRESS, '25', 'healthy');
    await vi.runAllTimersAsync();
    const quote = await q;
    const first = adapter.confirm(quote, 'unknown');
    const second = adapter.confirm(quote, 'healthy');
    await vi.runAllTimersAsync();
    expect((await first).state).toBe('unknown');
    expect((await second).state).toBe('unknown');
    expect((await adapter.confirm(quote, 'healthy')).state).toBe('unknown');
    const q2 = adapter.quote(SAMPLE_ADDRESS, '30', 'healthy');
    await vi.runAllTimersAsync();
    expect((await q2).id).not.toBe(quote.id);
  });
});
