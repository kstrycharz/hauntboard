import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isNsfw, readNsfwPreference, saveNsfwPreference} from '../web/content-filter.mjs';
import {encodePost, decodePost} from '../web/crypto.mjs';

test('filters existing explicit language across titles, names and bodies', () => {
  for (const field of ['title', 'name', 'body'])
    assert.equal(isNsfw({[field]: 'FUCK this'}), true);
  assert.equal(isNsfw({}, 'pornography'), true);
  assert.equal(isNsfw({body: 'nig\u200bger'}), true);
  assert.equal(isNsfw({body: 'ｆｕｃｋ'}), true);
});
test('ordinary conversations and substrings are not flagged', () => {
  for (const body of ['Tari mining and politics', 'Scunthorpe', 'class assignment', 'a title about decentralization'])
    assert.equal(isNsfw({body}), false);
  assert.equal(isNsfw(null), false);
});
test('author labels survive the existing payload format', async () => {
  const content = {title:'Example', name:'Ghost', body:'A labeled message', nsfw:true};
  const decoded = await decodePost(await encodePost(content, 0, null, []), 0, null, []);
  assert.equal(isNsfw(decoded), true);
  assert.equal(isNsfw({nsfw:'false', body:'ordinary'}), false);
});
test('reader preference defaults off, persists, and handles unavailable storage', () => {
  const values = new Map(), storage = {getItem:key => values.get(key), setItem:(key,value) => values.set(key,value)};
  assert.equal(readNsfwPreference(storage), false);
  saveNsfwPreference(storage, true);
  assert.equal(readNsfwPreference(storage), true);
  saveNsfwPreference(storage, false);
  assert.equal(readNsfwPreference(storage), false);
  const blocked = {getItem(){throw Error('blocked');}, setItem(){throw Error('blocked');}};
  assert.equal(readNsfwPreference(blocked), false);
  assert.doesNotThrow(() => saveNsfwPreference(blocked, true));
});
