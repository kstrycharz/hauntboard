export type Scenario =
  | 'healthy'
  | 'network-down'
  | 'delayed'
  | 'wallet-down'
  | 'unknown'
  | 'unreadable'
  | 'lost-key';
export type Route = 'entrance' | 'desk' | 'receipt' | 'inbox' | 'reward' | 'privacy' | 'recovery';
export type AnchorState = 'pending' | 'anchored' | 'unavailable';
export type RewardState = 'quoted' | 'declined' | 'pending' | 'confirmed' | 'unknown';
export interface Draft {
  text: string;
  payoutAddress: string;
}
export interface Envelope {
  id: string;
  digest: string;
  syntheticEnvelope: string;
  fixture: true;
  anchor: AnchorState;
}
export interface RewardQuote {
  id: string;
  recipient: string;
  amount: string;
  feeEstimate: string;
  network: 'Esmeralda · simulated';
  state: RewardState;
  fixture: true;
}
// Future live adapters implement this boundary with authenticated API operations.
// This adapter is an interactive fixture, and has no wallet/RPC credentials or network calls.
export interface HauntboxAdapter {
  seal(draft: Draft, scenario: Scenario): Promise<Envelope>;
  checkReceipt(envelope: Envelope, scenario: Scenario): Promise<Envelope>;
  open(envelope: Envelope, scenario: Scenario): Promise<Draft>;
  quote(recipient: string, amount: string, scenario: Scenario): Promise<RewardQuote>;
  confirm(quote: RewardQuote, scenario: Scenario): Promise<RewardQuote>;
  reset(): void;
}
export const SAMPLE_STORY =
  'Every October, a letter arrives in my own handwriting. This year, it asked me to stop answering the door.';
export const SAMPLE_ADDRESS = 'mock-esmeralda:lantern-keeper';
export const UTF8_LIMIT = 2000;
export const byteLength = (value: string) => new TextEncoder().encode(value).length;
export function validateDraft(draft: Draft): string | undefined {
  if (!draft.text.trim()) return 'Write a story before sealing your submission.';
  if (byteLength(draft.text) > UTF8_LIMIT)
    return 'Your story exceeds 2,000 UTF-8 bytes. Shorten it before sealing.';
  if (draft.payoutAddress && draft.payoutAddress !== SAMPLE_ADDRESS)
    return 'Use the Esmeralda sample recipient in this mock, or leave the address empty. Real wallet addresses are not accepted here.';
}
export function validateAmount(amount: string): boolean {
  // Checked integer fixture base units. No floating-point currency arithmetic.
  return /^[1-9][0-9]{0,3}$/.test(amount) && BigInt(amount) <= 1000n;
}
export class DemoError extends Error {}
const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 450));
export function createMockAdapter(): HauntboxAdapter {
  let counter = 0;
  let quoteCounter = 0;
  const drafts = new Map<string, Draft>();
  const confirmed = new Map<string, RewardQuote>();
  return {
    async seal(draft, scenario) {
      const error = validateDraft(draft);
      if (error) throw new DemoError(error);
      if (scenario === 'network-down')
        throw new DemoError(
          'Network unavailable. Your draft is still here. Restore the demo network, then seal again.',
        );
      await pause();
      const id = `mock-envelope-${String(++counter).padStart(4, '0')}`;
      // Synthetic bytes deliberately contain no story or recipient. This is NOT encryption.
      const syntheticEnvelope = `FIXTURE-ONLY:hauntbox:${id}:synthetic-sealed-bytes`;
      const hash = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(`hauntbox:envelope:v1:${syntheticEnvelope}`),
      );
      const digest = Array.from(new Uint8Array(hash), (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join('');
      drafts.set(id, { ...draft });
      return {
        id,
        digest,
        syntheticEnvelope,
        fixture: true,
        anchor: scenario === 'delayed' ? 'pending' : 'anchored',
      };
    },
    async checkReceipt(envelope, scenario) {
      await pause();
      return {
        ...envelope,
        anchor:
          scenario === 'network-down'
            ? 'unavailable'
            : scenario === 'delayed'
              ? 'pending'
              : 'anchored',
      };
    },
    async open(envelope, scenario) {
      await pause();
      if (scenario === 'lost-key')
        throw new DemoError(
          'The curator key is missing. Use your encrypted recovery file and separate recovery code. Login reset cannot recover the key.',
        );
      if (scenario === 'unreadable')
        throw new DemoError(
          'This envelope could not be opened. Check its room and key fingerprint. Keep the original bytes; do not reward an unreadable entry.',
        );
      const draft = drafts.get(envelope.id);
      if (!draft)
        throw new DemoError(
          'This fixture is no longer in this session. Return to the desk and seal a new sample.',
        );
      return { ...draft };
    },
    async quote(recipient, amount, scenario) {
      if (recipient !== SAMPLE_ADDRESS)
        throw new DemoError(
          'A sample recipient is required. A story without an address cannot receive a reward.',
        );
      if (!validateAmount(amount))
        throw new DemoError('Choose a whole number from 1 to 1,000 sample base units.');
      if (scenario === 'wallet-down')
        throw new DemoError(
          'Reward wallet unavailable. Restore the demo wallet before creating a quote. No reward has been submitted.',
        );
      await pause();
      return {
        id: `mock-quote-${String(++quoteCounter).padStart(4, '0')}`,
        recipient,
        amount,
        feeEstimate: '2 sample base units (fixture estimate)',
        network: 'Esmeralda · simulated',
        state: 'quoted',
        fixture: true,
      };
    },
    async confirm(quote, scenario) {
      if (confirmed.has(quote.id)) return confirmed.get(quote.id)!;
      if (quote.state !== 'quoted')
        throw new DemoError('This reward is already resolved. Do not submit it again.');
      if (scenario === 'wallet-down')
        throw new DemoError(
          'Reward wallet unavailable. No submission was attempted. Return to the inbox for a new quote after recovery.',
        );
      // Reserve immediately, before awaiting, so concurrent confirmations share one result.
      const result: RewardQuote = {
        ...quote,
        state: scenario === 'unknown' ? 'unknown' : 'pending',
      };
      confirmed.set(quote.id, result);
      await pause();
      return { ...result };
    },
    reset() {
      counter = 0;
      quoteCounter = 0;
      drafts.clear();
      confirmed.clear();
    },
  };
}
