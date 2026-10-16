// Content confidentiality only. Native Tari fee privacy is handled by stealth-fee.mjs.
import { base64, unbase64 } from './crypto.mjs';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const PADDED_BYTES = 2560;
const CONTENT_LIMIT = PADDED_BYTES - 2;
const categories = new Set(['general', 'tari', 'pol']);

function parse(payload) {
  if (
    !Array.isArray(payload) ||
    payload.length > 4096 ||
    !payload.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
  )
    throw new Error('Invalid sealed payload.');
  return JSON.parse(decoder.decode(new Uint8Array(payload)));
}

export function isSealedPayload(payload) {
  try {
    const p = parse(payload);
    return p.v === 2 && p.kind === 'sealed';
  } catch {
    return false;
  }
}

export function sealedMetadata(payload) {
  const p = parse(payload);
  if (
    p.v !== 2 ||
    p.kind !== 'sealed' ||
    p.alg !== 'A256GCM' ||
    typeof p.title !== 'string' ||
    !p.title.trim() ||
    encoder.encode(p.title).length > 80 ||
    !categories.has(p.category) ||
    unbase64(p.iv).length !== 12 ||
    unbase64(p.ct).length !== PADDED_BYTES + 16
  )
    throw new Error('Invalid sealed envelope.');
  return p;
}

export function sealedThread(thread) {
  return thread?.mode === 1 || isSealedPayload(thread?.posts?.find((p) => p.index === 0)?.payload);
}

function aad(profile, context, title, category) {
  if (!['localnet', 'esmeralda'].includes(profile?.network) || !profile.resetIdentity)
    throw new Error('A pinned network and reset identity are required.');
  return encoder.encode(
    JSON.stringify([
      'hauntboard-sealed',
      2,
      profile.network,
      profile.resetIdentity,
      ...context,
      title,
      category,
    ]),
  );
}

async function aesKey(key, usage) {
  const raw = unbase64(key);
  if (raw.length !== 32) throw new Error('A 256-bit invitation key is required.');
  try {
    return await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, [usage]);
  } finally {
    raw.fill(0);
  }
}

export function sealedSpace(content) {
  const used = encoder.encode(JSON.stringify({ ...content, v: 1 })).length;
  return { used, limit: CONTENT_LIMIT, remaining: CONTENT_LIMIT - used };
}

export async function sealPost(content, key, profile, context, metadata) {
  const data = encoder.encode(JSON.stringify({ ...content, v: 1 }));
  if (data.length > CONTENT_LIMIT)
    throw new Error('Shorten this message to fit the encrypted envelope.');
  const padded = crypto.getRandomValues(new Uint8Array(PADDED_BYTES));
  new DataView(padded.buffer).setUint16(0, data.length);
  padded.set(data, 2);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  try {
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv,
        additionalData: aad(profile, context, metadata.title, metadata.category),
      },
      await aesKey(key, 'encrypt'),
      padded,
    );
    const payload = Array.from(
      encoder.encode(
        JSON.stringify({
          v: 2,
          kind: 'sealed',
          alg: 'A256GCM',
          title: metadata.title,
          category: metadata.category,
          iv: base64(iv),
          ct: base64(new Uint8Array(ciphertext)),
        }),
      ),
    );
    sealedMetadata(payload);
    return payload;
  } finally {
    data.fill(0);
    padded.fill(0);
  }
}

export async function openSealedPost(payload, key, profile, context, expectedTitle) {
  const p = sealedMetadata(payload);
  if (p.title !== expectedTitle)
    throw new Error('Sealed metadata does not match the public thread title.');
  if (!key) throw new Error('Encrypted message. Open an invitation to read this thread.');
  let padded;
  try {
    padded = new Uint8Array(
      await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: unbase64(p.iv),
          additionalData: aad(profile, context, p.title, p.category),
        },
        await aesKey(key, 'decrypt'),
        unbase64(p.ct),
      ),
    );
    if (padded.length !== PADDED_BYTES) throw new Error();
    const length = new DataView(padded.buffer).getUint16(0);
    if (length > CONTENT_LIMIT) throw new Error();
    const content = JSON.parse(decoder.decode(padded.subarray(2, 2 + length)));
    if (
      content.v !== 1 ||
      typeof content.body !== 'string' ||
      !content.body.trim() ||
      typeof content.name !== 'string' ||
      typeof content.title !== 'string'
    )
      throw new Error();
    return content;
  } catch {
    throw new Error('The invitation key is incorrect, or this message or its context was altered.');
  } finally {
    padded?.fill(0);
  }
}

export function invitationUrl(thread, key, origin) {
  if (
    !/^component_[a-f0-9]{64}$/.test(thread.address) ||
    !/^component_[a-f0-9]{64}$/.test(thread.board) ||
    unbase64(key).length !== 32
  )
    throw new Error('Invalid invitation.');
  const url = new URL('/', origin);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === 'localhost'))
    throw new Error('Use HTTPS or localhost for invitations.');
  url.hash = new URLSearchParams({ thread: thread.address, board: thread.board, key }).toString();
  return url.href;
}
