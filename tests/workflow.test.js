import test from 'node:test';
import assert from 'node:assert/strict';
import { validate, emptyNotes, moveItem, pastedLines, hasContent, storageSize, saveNotes } from '../public/model.js';
import { collectNotes, filterRecords } from '../public/board-model.js';

test('legacy data remains unchanged; new private fields are validated and count toward storage', async () => {
  const old = emptyNotes();
  assert.equal(validate(old), old);
  const value = { ...old, priority: 'high', nextStep: 'Ölçüyü doğrula' };
  assert.equal(validate(value), value);
  assert.ok(storageSize(value) > storageSize(old));
  assert.throws(() => validate({ ...old, priority: 'invalid' }), /UNSUPPORTED/);
  assert.throws(() => validate({ ...old, nextStep: 3 }), /UNSUPPORTED/);
  let stored;
  await saveNotes({ get: async () => ({}), set: async (scope, visibility, key, data) => {
    assert.equal(scope, 'card'); assert.equal(visibility, 'private'); stored = data;
  } }, value);
  assert.deepEqual(stored, value);
  assert.equal(hasContent(old), false);
  assert.equal(hasContent(value), true);
  assert.equal(hasContent({ ...old, nextStep: 'Kontrol' }), true);
});
test('reordering is stable, preserves item identity and completion, and handles invalid targets', () => {
  const items = ['a','b','c'].map((id, i) => ({ id, text: id, done: i === 0 }));
  const first = items[0];
  moveItem(items, 'a', 'c', true);
  assert.deepEqual(items.map(item => item.id), ['b','c','a']);
  assert.equal(items[2], first); assert.equal(items[2].done, true);
  moveItem(items, 'a', 'b');
  assert.deepEqual(items.map(item => item.id), ['a','b','c']);
  assert.equal(moveItem(items, 'missing', 'b'), false);
  assert.equal(moveItem(items, 'a', 'a'), false);
});
test('multiline paste respects selection, CRLF, blank lines and Unicode', () => {
  assert.deepEqual(pastedLines('ön seç son', 3, 6, 'bir\r\n\r\niki 😊\rüç'), ['ön bir','iki 😊','üç son']);
  assert.deepEqual(pastedLines('', 0, 0, '\n  \n'), []);
});
test('board aggregation reads private data by card with bounded concurrency, reports failures and keeps order', async () => {
  const cards = Array.from({ length: 10 }, (_, i) => ({ id: `card${i}`, name: `Kart ${i}` }));
  let active = 0, peak = 0;
  const progress = [];
  const result = await collectNotes({
    cards: async () => cards,
    get: async (id, visibility, key) => {
      assert.equal(visibility, 'private'); assert.equal(key, 'personalNotes');
      active++; peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 2)); active--;
      if (id === 'card3') throw Error('offline');
      return id === 'card2' ? null : { ...emptyNotes(), note: id };
    },
  }, done => progress.push(done));
  assert.ok(peak <= 4); assert.ok(peak > 1);
  assert.equal(result.failures, 1); assert.equal(result.total, 10);
  assert.equal(result.records.length, 8);
  assert.deepEqual(result.records.map(r => r.card.id), ['card0','card1','card4','card5','card6','card7','card8','card9']);
  assert.equal(progress.at(-1), 10);
});
test('board filters Turkish search across next steps/items and open tasks without mutating records', () => {
  const records = [
    { card: { name: 'Çizim' }, value: { ...emptyNotes(), nextStep: 'İncele', items: [{ text: 'Ölçü', done: false }] } },
    { card: { name: 'Test' }, value: { ...emptyNotes(), note: 'Bitti', items: [{ text: 'Test et', done: true }] } },
  ];
  assert.equal(filterRecords(records, 'incele', false).length, 1);
  assert.equal(filterRecords(records, 'ölçü', true).length, 1);
  assert.equal(filterRecords(records, '', true).length, 1);
  assert.equal(records.length, 2);
});
