import { readNotes, hasContent } from './model.js?v=20261119-workflow';

export async function collectNotes(t, onProgress = () => {}) {
  const cards = await t.cards('id', 'name', 'url');
  const records = new Array(cards.length);
  let next = 0, done = 0, failures = 0;
  async function worker() {
    while (next < cards.length) {
      const index = next++;
      try {
        const value = await readNotes(t, cards[index].id);
        if (hasContent(value)) records[index] = { card: cards[index], value };
      } catch { failures++; }
      onProgress(++done, cards.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, cards.length) }, worker));
  return { records: records.filter(Boolean), failures, total: cards.length };
}

export function filterRecords(records, search, onlyOpen) {
  const query = search.trim().toLocaleLowerCase('tr');
  return records.filter(({ card, value }) => {
    if (onlyOpen && !value.items.some(item => !item.done && item.text.trim())) return false;
    const text = [card.name, value.note, value.nextStep || '', ...value.items.map(item => item.text)].join('\n');
    return !query || text.toLocaleLowerCase('tr').includes(query);
  });
}
