import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newThreadKey } from '../web/crypto.mjs';
import {
  sealPost,
  openSealedPost,
  sealedMetadata,
  sealedThread,
  sealedSpace,
  invitationUrl,
} from '../web/sealed-posts.mjs';

const profile = { network: 'esmeralda', resetIdentity: 'synthetic-test-reset' };
const board = `component_${'a'.repeat(64)}`,
  address = `component_${'b'.repeat(64)}`;
const uid = Array(16).fill(7),
  context = [board, uid, uid, null];
const metadata = { title: 'Public title', category: 'tari' };
const content = {
  title: metadata.title,
  category: metadata.category,
  name: 'Ghost',
  body: 'Synthetic private body 🌘',
};
const bytes = (value) => Array.from(new TextEncoder().encode(JSON.stringify(value)));

test('sealed payload round-trips with public metadata, no plaintext body or key, and unchanged contract mode', async () => {
  const key = newThreadKey(),
    payload = await sealPost(content, key, profile, context, metadata);
  const p = sealedMetadata(payload);
  assert.equal(p.title, metadata.title);
  assert.equal(p.category, 'tari');
  assert(payload.length <= 4096);
  assert(!new TextDecoder().decode(new Uint8Array(payload)).includes(content.body));
  assert(!JSON.stringify(p).includes(key));
  assert.deepEqual(await openSealedPost(payload, key, profile, context, metadata.title), {
    ...content,
    v: 1,
  });
  assert(sealedThread({ schema: 4, mode: 0, posts: [{ index: 0, payload }] }));
  await assert.rejects(
    openSealedPost(payload, null, profile, context, metadata.title),
    /invitation/,
  );
  await assert.rejects(
    openSealedPost(payload, newThreadKey(), profile, context, metadata.title),
    /incorrect/,
  );
});

test('fresh IVs randomize equal content; padding hides serialized body length within the public metadata', async () => {
  const key = newThreadKey(),
    a = await sealPost(content, key, profile, context, metadata);
  const b = await sealPost({ ...content, body: 'x' }, key, profile, context, metadata);
  assert.equal(a.length, b.length);
  assert.notEqual(sealedMetadata(a).iv, sealedMetadata(b).iv);
  assert.notEqual(sealedMetadata(a).ct, sealedMetadata(b).ct);
});

test('tampered ciphertext, IV, public title and category fail authentication', async () => {
  const key = newThreadKey(),
    payload = await sealPost(content, key, profile, context, metadata);
  for (const field of ['ct', 'iv', 'title', 'category']) {
    const p = sealedMetadata(payload);
    if (field === 'title') p.title = 'Changed';
    else if (field === 'category') p.category = 'pol';
    else p[field] = (p[field][0] === 'A' ? 'B' : 'A') + p[field].slice(1);
    await assert.rejects(openSealedPost(bytes(p), key, profile, context, p.title));
  }
});

test('network reset, board, thread ID, post nonce, parent and expected title prevent transplanting ciphertext', async () => {
  const key = newThreadKey(),
    payload = await sealPost(content, key, profile, context, metadata);
  for (const p of [
    { ...profile, network: 'localnet' },
    { ...profile, resetIdentity: 'other-reset' },
  ])
    await assert.rejects(openSealedPost(payload, key, p, context, metadata.title));
  for (let i = 0; i < 4; i++) {
    const altered = structuredClone(context);
    altered[i] = i === 0 ? address : i === 3 ? 0 : Array(16).fill(8);
    await assert.rejects(openSealedPost(payload, key, profile, altered, metadata.title));
  }
  await assert.rejects(openSealedPost(payload, key, profile, context, 'Other title'));
});

test('serialized Unicode bounds and malformed envelopes are rejected before publication or decryption', async () => {
  const key = newThreadKey();
  assert(sealedSpace({ ...content, body: '🌘'.repeat(1000) }).remaining < 0);
  await assert.rejects(
    sealPost({ ...content, body: '🌘'.repeat(1000) }, key, profile, context, metadata),
  );
  await assert.rejects(
    sealPost(content, key, profile, context, { ...metadata, title: 'x'.repeat(81) }),
  );
  for (const p of [[], [256], bytes({ v: 2, kind: 'sealed' })])
    assert.throws(() => sealedMetadata(p));
});

test('invitation keys stay entirely in the fragment and insecure remote invitations are rejected', () => {
  const key = newThreadKey(),
    link = new URL(invitationUrl({ address, board }, key, 'https://board.example'));
  assert.equal(link.search, '');
  assert(!`${link.origin}${link.pathname}`.includes(key));
  assert.equal(new URLSearchParams(link.hash.slice(1)).get('key'), key);
  assert.throws(() => invitationUrl({ address, board }, key, 'http://board.example'));
});
