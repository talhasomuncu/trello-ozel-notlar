import test from 'node:test';
import assert from 'node:assert/strict';
import { exportText, copyText } from '../public/export.js';

test('note export preserves current draft text including Turkish, emoji and line breaks', () => {
  const value = { note: 'İşler 😊\n<test>', items: [] };
  assert.equal(exportText(value, 'note'), value.note);
  assert.equal(value.note, 'İşler 😊\n<test>');
});
test('checklist export skips blanks, keeps order and produces one item per line without modifying completion', () => {
  const value = { note: '', items: [
    { id: 'a', text: 'Ölçüyü kontrol et', done: true },
    { id: 'b', text: '   ', done: false },
    { id: 'c', text: 'Çizimi\ngönder', done: false },
  ] };
  const before = structuredClone(value);
  assert.equal(exportText(value, 'checklist'), 'Ölçüyü kontrol et\nÇizimi gönder');
  assert.deepEqual(value, before);
});
test('clipboard success and denial/missing API return honest results', async () => {
  let captured;
  assert.equal(await copyText('note', { writeText: async value => { captured = value; } }), true);
  assert.equal(captured, 'note');
  assert.equal(await copyText('note', { writeText: async () => { throw Error('denied'); } }), false);
  assert.equal(await copyText('note', {}), false);
});
