import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyNotes, readNotes, saveNotes, storageSize, LIMIT, KEY } from '../public/model.js';

function client(store = new Map(), member = 'a', card = 'card1') {
  const key = `${member}:${card}`;
  return {
    async get(s, v, k, fallback) {
      assert.equal(s, 'card'); assert.equal(v, 'private');
      const scope = store.get(key) || {};
      return structuredClone(k ? (scope[k] ?? fallback) : scope);
    },
    async set(s, v, k, value) {
      assert.equal(s, 'card'); assert.equal(v, 'private'); assert.equal(k, KEY);
      store.set(key, { ...store.get(key), [k]: structuredClone(value) });
    },
  };
}

test('empty record and Turkish/emoji/plain HTML text round trip', async () => {
  const t = client();
  assert.deepEqual(await readNotes(t), emptyNotes());
  const data = { version: 1, note: 'İşler güzel 😊 <script>alert(1)</script>', items: [{ id: '1', text: 'Öğle işi', done: false }] };
  await saveNotes(t, data);
  assert.deepEqual(await readNotes(t), data);
  data.items[0].done = true;
  data.items[0].text = 'Güncellendi';
  await saveNotes(t, data);
  assert.deepEqual(await readNotes(t), data);
  data.items = [];
  data.note = '';
  await saveNotes(t, data);
  assert.deepEqual(await readNotes(t), emptyNotes());
});

test('storage boundary includes wrapper, escaped characters and other private keys', async () => {
  const data = emptyNotes();
  data.note = 'x'.repeat(LIMIT - storageSize(data));
  assert.equal(storageSize(data), LIMIT);
  await saveNotes(client(), data);
  data.note += 'x';
  await assert.rejects(saveNotes(client(), data), /CAPACITY_EXCEEDED/);
  data.note = '"\\\n😊';
  assert.equal(storageSize(data), JSON.stringify({ personalNotes: data }).length);
  const store = new Map([['a:card1', { other: 'x'.repeat(4096) }]]);
  await assert.rejects(saveNotes(client(store), data), /CAPACITY_EXCEEDED/);
});

test('adapter always requests private card storage; simulated member/card separation', async () => {
  const store = new Map();
  const data = { ...emptyNotes(), note: 'Sadece A' };
  await saveNotes(client(store), data);
  assert.deepEqual(await readNotes(client(store)), data);
  assert.deepEqual(await readNotes(client(store, 'b')), emptyNotes());
  assert.deepEqual(await readNotes(client(store, 'a', 'card2')), emptyNotes());
});

test('failed writes keep draft unchanged and allow retry', async () => {
  const t = client();
  const data = { ...emptyNotes(), note: 'Taslak' };
  const copy = structuredClone(data);
  await assert.rejects(saveNotes({ ...t, set: async () => { throw new Error('offline'); } }, data), /offline/);
  assert.deepEqual(data, copy);
  assert.deepEqual(await readNotes(t), emptyNotes());
  await saveNotes(t, data);
  assert.deepEqual(await readNotes(t), data);
});

test('unknown/malformed saved data is rejected rather than overwritten', async () => {
  for (const bad of [{ version: 2 }, { version: 1, note: '', items: [{ id: 'a', text: '', done: 'yes' }] }]) {
    const store = new Map([['a:card1', { [KEY]: bad }]]);
    await assert.rejects(readNotes(client(store)), /UNSUPPORTED_DATA/);
  }
});
