import {
  CompactEncrypt,
  compactDecrypt,
  calculateJwkThumbprint,
  exportJWK,
  importJWK,
  decodeProtectedHeader,
  base64url,
  type JWK,
} from 'jose';

export interface EnvelopeContext {
  network: string;
  component: string;
  submissionId: string;
  keyThumbprint: string;
}
export interface StoryPayload {
  version: 1;
  text: string;
  payoutAddress?: string;
  nickname?: string;
}
export interface RoomKey {
  publicJwk: JWK;
  thumbprint: string;
  privateKey: CryptoKey;
  recoveryFile: string;
  recoveryCode: string;
}
const encode = new TextEncoder();
const decode = new TextDecoder('utf-8', { fatal: true });
const headerKeys = [
  'alg',
  'enc',
  'typ',
  'version',
  'network',
  'component',
  'submissionId',
  'keyThumbprint',
];
function check(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}
export function randomCapability(): string {
  return base64url.encode(crypto.getRandomValues(new Uint8Array(32)));
}
export function randomSubmissionId(): string {
  return [...crypto.getRandomValues(new Uint8Array(32))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
export function validateContext(context: EnvelopeContext): void {
  check(['localnet', 'esmeralda'].includes(context.network), 'INVALID_ENVELOPE_NETWORK');
  check(/^component_[a-f0-9]{64}$/.test(context.component), 'INVALID_ENVELOPE_COMPONENT');
  check(/^[a-f0-9]{64}$/.test(context.submissionId), 'INVALID_SUBMISSION_ID');
  check(/^[A-Za-z0-9_-]{43}$/.test(context.keyThumbprint), 'INVALID_KEY_THUMBPRINT');
}
function payloadBytes(payload: StoryPayload): Uint8Array {
  check(
    payload &&
      payload.version === 1 &&
      typeof payload.text === 'string' &&
      payload.text.trim() &&
      encode.encode(payload.text).length <= 2000,
    'INVALID_STORY',
  );
  check(
    Object.keys(payload).every((key) =>
      ['version', 'text', 'payoutAddress', 'nickname'].includes(key),
    ),
    'UNKNOWN_PAYLOAD_FIELD',
  );
  check(
    payload.payoutAddress === undefined ||
      (typeof payload.payoutAddress === 'string' &&
        encode.encode(payload.payoutAddress).length <= 512),
    'INVALID_PAYOUT_ADDRESS',
  );
  check(
    payload.nickname === undefined ||
      (typeof payload.nickname === 'string' && encode.encode(payload.nickname).length <= 80),
    'INVALID_NICKNAME',
  );
  const bytes = encode.encode(JSON.stringify(payload));
  check(bytes.length <= 4092, 'PAYLOAD_TOO_LARGE');
  const padded = new Uint8Array(4096);
  new DataView(padded.buffer).setUint32(0, bytes.length, false);
  padded.set(bytes, 4);
  return padded;
}
export function validateEnvelope(envelope: string, expected: EnvelopeContext): void {
  validateContext(expected);
  check(
    typeof envelope === 'string' &&
      envelope.length <= 8192 &&
      /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(
        envelope,
      ),
    'INVALID_JWE',
  );
  const header = decodeProtectedHeader(envelope);
  check(
    Object.keys(header).length === headerKeys.length &&
      Object.keys(header).every((key) => headerKeys.includes(key)),
    'INVALID_JWE_HEADER',
  );
  check(
    header.alg === 'RSA-OAEP-256' &&
      header.enc === 'A256GCM' &&
      header.typ === 'hauntbox-envelope' &&
      header.version === 1,
    'INVALID_JWE_ALGORITHM',
  );
  for (const key of ['network', 'component', 'submissionId', 'keyThumbprint'] as const)
    check(header[key] === expected[key], 'ENVELOPE_CONTEXT_MISMATCH');
  const parts = envelope.split('.');
  check(
    base64url.decode(parts[1]).length === 384 &&
      base64url.decode(parts[2]).length === 12 &&
      base64url.decode(parts[3]).length === 4096 &&
      base64url.decode(parts[4]).length === 16,
    'INVALID_JWE_SIZE',
  );
}
export async function envelopeDigest(envelope: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    encode.encode(`hauntbox:envelope:v1:${envelope}`),
  );
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export async function sealStory(
  payload: StoryPayload,
  context: EnvelopeContext,
  publicJwk: JWK,
): Promise<{ envelope: string; digest: string }> {
  validateContext(context);
  check(
    publicJwk.kty === 'RSA' &&
      !publicJwk.d &&
      !!publicJwk.n &&
      base64url.decode(publicJwk.n).length === 384,
    'INVALID_ROOM_PUBLIC_KEY',
  );
  check((await calculateJwkThumbprint(publicJwk)) === context.keyThumbprint, 'ROOM_KEY_MISMATCH');
  const key = await importJWK(publicJwk, 'RSA-OAEP-256');
  const envelope = await new CompactEncrypt(payloadBytes(payload))
    .setProtectedHeader({
      alg: 'RSA-OAEP-256',
      enc: 'A256GCM',
      typ: 'hauntbox-envelope',
      version: 1,
      ...context,
    })
    .encrypt(key);
  validateEnvelope(envelope, context);
  return { envelope, digest: await envelopeDigest(envelope) };
}
export async function openStory(
  envelope: string,
  context: EnvelopeContext,
  privateKey: CryptoKey,
): Promise<StoryPayload> {
  validateEnvelope(envelope, context);
  const { plaintext } = await compactDecrypt(envelope, privateKey, {
    keyManagementAlgorithms: ['RSA-OAEP-256'],
    contentEncryptionAlgorithms: ['A256GCM'],
  });
  check(plaintext.length === 4096, 'INVALID_PAYLOAD_SIZE');
  const length = new DataView(
    plaintext.buffer,
    plaintext.byteOffset,
    plaintext.byteLength,
  ).getUint32(0, false);
  check(
    length > 0 && length <= 4092 && plaintext.subarray(length + 4).every((byte) => byte === 0),
    'INVALID_PAYLOAD_PADDING',
  );
  const payload = JSON.parse(decode.decode(plaintext.subarray(4, length + 4))) as StoryPayload;
  payloadBytes(payload);
  return payload;
}
export async function restoreRoomKey(
  recoveryFile: string,
  recoveryCode: string,
  expectedThumbprint?: string,
): Promise<{ privateKey: CryptoKey; publicJwk: JWK; thumbprint: string }> {
  check(
    recoveryFile.length <= 16384 && /^[A-Za-z0-9_-]{43}$/.test(recoveryCode),
    'INVALID_RECOVERY_BUNDLE',
  );
  const header = decodeProtectedHeader(recoveryFile);
  check(
    Object.keys(header).length === 4 &&
      header.alg === 'dir' &&
      header.enc === 'A256GCM' &&
      header.typ === 'hauntbox-room-recovery' &&
      header.version === 1,
    'INVALID_RECOVERY_HEADER',
  );
  const { plaintext } = await compactDecrypt(recoveryFile, base64url.decode(recoveryCode), {
    keyManagementAlgorithms: ['dir'],
    contentEncryptionAlgorithms: ['A256GCM'],
  });
  const jwk = JSON.parse(decode.decode(plaintext)) as JWK;
  check(
    jwk.kty === 'RSA' && !!jwk.d && !!jwk.n && base64url.decode(jwk.n).length === 384,
    'INVALID_RECOVERY_KEY',
  );
  const publicJwk: JWK = { kty: jwk.kty, n: jwk.n, e: jwk.e };
  const thumbprint = await calculateJwkThumbprint(publicJwk);
  check(!expectedThumbprint || thumbprint === expectedThumbprint, 'RECOVERY_KEY_MISMATCH');
  const privateKey = (await importJWK(jwk, 'RSA-OAEP-256', { extractable: false })) as CryptoKey;
  check(!privateKey.extractable, 'PRIVATE_KEY_MUST_NOT_BE_EXTRACTABLE');
  return { privateKey, publicJwk, thumbprint };
}
export async function createRoomKey(): Promise<RoomKey> {
  const pair = await crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 3072,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt'],
  );
  const privateJwk = await exportJWK(pair.privateKey);
  const publicJwk: JWK = { kty: privateJwk.kty, n: privateJwk.n, e: privateJwk.e };
  const thumbprint = await calculateJwkThumbprint(publicJwk);
  const recoveryCode = randomCapability();
  const recoveryFile = await new CompactEncrypt(encode.encode(JSON.stringify(privateJwk)))
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM', typ: 'hauntbox-room-recovery', version: 1 })
    .encrypt(base64url.decode(recoveryCode));
  const restored = await restoreRoomKey(recoveryFile, recoveryCode, thumbprint);
  // Activation must also perform an envelope roundtrip; caller owns that UI acknowledgement.
  return { publicJwk, thumbprint, privateKey: restored.privateKey, recoveryFile, recoveryCode };
}
