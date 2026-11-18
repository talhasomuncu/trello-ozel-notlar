export const KEY = 'personalNotes';
export const LIMIT = 4096;
export const emptyNotes = () => ({ version: 1, note: '', items: [] });

export function validate(value) {
  if (!value || value.version !== 1 || typeof value.note !== 'string' || !Array.isArray(value.items)) {
    throw new Error('UNSUPPORTED_DATA');
  }
  const ids = new Set();
  for (const item of value.items) {
    if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id) ||
        typeof item.text !== 'string' || typeof item.done !== 'boolean') {
      throw new Error('UNSUPPORTED_DATA');
    }
    ids.add(item.id);
  }
  return value;
}

// Trello limits the whole serialized scope/visibility object, including keys.
export function storageSize(value, scope = {}) {
  return JSON.stringify({ ...scope, [KEY]: value }).length;
}

export async function readNotes(t) {
  const value = await t.get('card', 'private', KEY, null);
  return value === null ? emptyNotes() : validate(value);
}

export async function saveNotes(t, value) {
  validate(value);
  const scope = await t.get('card', 'private');
  if (storageSize(value, scope || {}) > LIMIT) throw new Error('CAPACITY_EXCEEDED');
  await t.set('card', 'private', KEY, value);
}
