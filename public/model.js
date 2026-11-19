export const KEY = 'personalNotes';
export const LIMIT = 4096;
export const emptyNotes = () => ({ version: 1, note: '', items: [] });

export function validate(value) {
  if (!value || value.version !== 1 || typeof value.note !== 'string' || !Array.isArray(value.items)) {
    throw new Error('UNSUPPORTED_DATA');
  }
  const ids = new Set();
  if ((value.priority !== undefined && !['low', 'normal', 'high'].includes(value.priority)) ||
      (value.nextStep !== undefined && typeof value.nextStep !== 'string')) throw new Error('UNSUPPORTED_DATA');
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

export async function readNotes(t, card = 'card') {
  const value = await t.get(card, 'private', KEY, null);
  return value === null ? emptyNotes() : validate(value);
}

export const priorityLabel = value => ({ low: 'Düşük', normal: 'Normal', high: 'Yüksek' })[value || 'normal'];
export function hasContent(value) {
  return Boolean(value && (value.note?.trim() || value.nextStep?.trim() ||
    (value.priority && value.priority !== 'normal') || value.items?.some(item => item.text?.trim())));
}

export function moveItem(items, sourceId, targetId, after = false) {
  if (sourceId === targetId) return false;
  const source = items.findIndex(item => item.id === sourceId);
  if (source < 0 || !items.some(item => item.id === targetId)) return false;
  const [item] = items.splice(source, 1);
  const target = items.findIndex(other => other.id === targetId);
  items.splice(target + (after ? 1 : 0), 0, item);
  return true;
}

export function pastedLines(current, start, end, text) {
  const lines = text.split(/\r\n|\r|\n/).map(line => line.trim()).filter(Boolean);
  if (!lines.length) return [];
  lines[0] = current.slice(0, start) + lines[0];
  lines[lines.length - 1] += current.slice(end);
  return lines;
}

export async function saveNotes(t, value) {
  validate(value);
  const scope = await t.get('card', 'private');
  if (storageSize(value, scope || {}) > LIMIT) throw new Error('CAPACITY_EXCEEDED');
  await t.set('card', 'private', KEY, value);
}
