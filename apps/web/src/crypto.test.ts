import { beforeAll, describe, expect, it } from 'vitest';
import {
  createRoomKey,
  sealStory,
  openStory,
  randomSubmissionId,
  restoreRoomKey,
  envelopeDigest,
  validateEnvelope,
  type RoomKey,
} from '../../../packages/crypto/index';
import { base64url } from 'jose';
let key: RoomKey;
let other: RoomKey;
beforeAll(async () => {
  key = await createRoomKey();
  other = await createRoomKey();
}, 20000);
const context = () => ({
  network: 'localnet',
  component: `component_${'a'.repeat(64)}`,
  submissionId: randomSubmissionId(),
  keyThumbprint: key.thumbprint,
});
describe('real padded browser envelope contract', () => {
  it('seals randomized ciphertext and recovers text/address with a nonextractable key', async () => {
    const ctx = context();
    const payload = {
      version: 1 as const,
      text: 'A synthetic letter.',
      payoutAddress: 'synthetic-private-recipient',
    };
    const first = await sealStory(payload, ctx, key.publicJwk);
    const second = await sealStory(payload, ctx, key.publicJwk);
    expect(first.envelope).not.toBe(second.envelope);
    expect(first.digest).not.toBe(second.digest);
    expect(first.envelope).not.toContain(payload.text);
    expect(first.envelope).not.toContain(payload.payoutAddress);
    expect(base64url.decode(first.envelope.split('.')[3])).toHaveLength(4096);
    expect(await openStory(first.envelope, ctx, key.privateKey)).toEqual(payload);
    expect(key.privateKey.extractable).toBe(false);
  });
  it('restores a clean key from separate encrypted file/code and rejects wrong/corrupt recovery', async () => {
    const ctx = context();
    const sealed = await sealStory(
      { version: 1, text: 'Recovered synthetic letter.' },
      ctx,
      key.publicJwk,
    );
    const restored = await restoreRoomKey(key.recoveryFile, key.recoveryCode, key.thumbprint);
    expect((await openStory(sealed.envelope, ctx, restored.privateKey)).text).toBe(
      'Recovered synthetic letter.',
    );
    await expect(restoreRoomKey(key.recoveryFile, other.recoveryCode)).rejects.toThrow();
    await expect(
      restoreRoomKey(key.recoveryFile, key.recoveryCode, other.thumbprint),
    ).rejects.toThrow();
    await expect(restoreRoomKey(key.recoveryFile.slice(0, -5), key.recoveryCode)).rejects.toThrow();
  });
  it('rejects wrong key, tampering, changed context and unexpected headers', async () => {
    const ctx = context();
    const sealed = await sealStory({ version: 1, text: 'Bound to this room.' }, ctx, key.publicJwk);
    await expect(openStory(sealed.envelope, ctx, other.privateKey)).rejects.toThrow();
    for (const change of [
      { network: 'esmeralda' },
      { component: `component_${'b'.repeat(64)}` },
      { submissionId: randomSubmissionId() },
      { keyThumbprint: other.thumbprint },
    ])
      expect(() => validateEnvelope(sealed.envelope, { ...ctx, ...change })).toThrow();
    const parts = sealed.envelope.split('.');
    parts[3] = (parts[3][0] === 'a' ? 'b' : 'a') + parts[3].slice(1);
    await expect(openStory(parts.join('.'), ctx, key.privateKey)).rejects.toThrow();
    expect(await envelopeDigest(parts.join('.'))).not.toBe(sealed.digest);
    const header = JSON.parse(new TextDecoder().decode(base64url.decode(parts[0])));
    header.jku = 'https://example.com/key';
    parts[0] = base64url.encode(JSON.stringify(header));
    expect(() => validateEnvelope(parts.join('.'), ctx)).toThrow();
  });
  it('rejects oversized UTF-8 text, unknown payload fields and substituted public keys', async () => {
    await expect(
      sealStory({ version: 1, text: '👻'.repeat(501) }, context(), key.publicJwk),
    ).rejects.toThrow();
    await expect(
      sealStory(
        { version: 1, text: 'ok', tracking: 'forbidden' } as never,
        context(),
        key.publicJwk,
      ),
    ).rejects.toThrow();
    await expect(
      sealStory({ version: 1, text: 'ok' }, context(), other.publicJwk),
    ).rejects.toThrow();
  });
});
