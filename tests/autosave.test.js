import test from 'node:test';
import assert from 'node:assert/strict';
import { createAutosave } from '../public/autosave.js';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

test('rapid edits debounce into one snapshot and no writes occur on initial load', async () => {
  let value = { note: '' }; const writes = [];
  const saver = createAutosave({ initial: value, getValue: () => value, write: async data => writes.push(data), delay: 10 });
  await wait(20); assert.equal(writes.length, 0);
  value.note = 'a'; saver.changed(); value.note = 'ab'; saver.changed(); value.note = 'abc'; saver.changed();
  await wait(30); assert.deepEqual(writes, [{ note: 'abc' }]); assert.equal(saver.savedJSON, JSON.stringify(value));
});
test('edits while write is in flight are not marked saved and are written afterward without overlap', async () => {
  let value = { note: '' }; let release; let active = 0; let peak = 0; const writes = [];
  const saver = createAutosave({ initial: value, getValue: () => value, delay: 10, write: async data => {
    active++; peak = Math.max(peak, active); writes.push(data);
    if (writes.length === 1) await new Promise(resolve => { release = resolve; });
    active--;
  } });
  value.note = 'ilk'; const pending = saver.flush();
  value.note = 'son'; saver.changed(); await wait(20);
  assert.equal(writes.length, 1); assert.equal(saver.savedJSON, '{"note":""}');
  release(); await pending; await wait(30);
  assert.equal(peak, 1); assert.deepEqual(writes, [{ note: 'ilk' }, { note: 'son' }]);
  assert.equal(saver.savedJSON, JSON.stringify(value));
});
test('failed writes preserve draft, stop retries, and can be retried explicitly', async () => {
  let value = { note: '' }, fail = true, attempts = 0; const states = [];
  const saver = createAutosave({ initial: value, getValue: () => value, delay: 10,
    onState: state => states.push(state), write: async () => { attempts++; if (fail) throw Error('offline'); } });
  value.note = 'taslak'; saver.changed(); await wait(30); await wait(20);
  assert.equal(attempts, 1); assert.equal(states.at(-1), 'error'); assert.equal(value.note, 'taslak');
  assert.equal(saver.savedJSON, '{"note":""}');
  fail = false; await saver.flush(); assert.equal(states.at(-1), 'saved');
});
test('oversize content is blocked until corrected; returning to saved state cancels pending write', async () => {
  let value = { note: '' }; let writes = 0;
  const saver = createAutosave({ initial: value, getValue: () => value, delay: 10,
    canSave: data => data.note.length <= 3, write: async () => { writes++; } });
  value.note = 'xxxx'; saver.changed(); await wait(20); assert.equal(writes, 0);
  value.note = 'ok'; saver.changed(); await wait(20); assert.equal(writes, 1);
  value.note = 'new'; saver.changed(); value.note = 'ok'; saver.changed(); await wait(20); assert.equal(writes, 1);
});
