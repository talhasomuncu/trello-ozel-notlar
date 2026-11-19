import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('../public/connector.js', import.meta.url), 'utf8');
function capabilities() {
  let result;
  runInNewContext(source, {
    URL,
    window: {
      location: { href: 'https://example.com/trello/index.html' },
      TrelloPowerUp: { initialize: value => { result = value; } },
    },
  });
  return result;
}
test('embedded card section uses signed iframe URL and exposes no private content in title', () => {
  const handlers = capabilities();
  const section = handlers['card-back-section']({
    isMemberSignedIn: () => true,
    signUrl: url => `signed:${url}`,
  });
  assert.equal(section.title, 'Özel Notlarım');
  assert.equal(section.content.type, 'iframe');
  assert.equal(section.content.url, 'signed:./editor.html?embedded=1&v=20261119-workflow');
  assert.equal(section.icon, 'https://example.com/trello/icon.svg');
  assert.ok(section.content.height <= 1500);
});

test('badge reads only current member private card data and never includes note contents', async () => {
  const handler = capabilities()['card-badges'];
  let reads = 0;
  const t = { isMemberSignedIn: () => true, get: async (scope, visibility, key) => {
    reads++; assert.equal(scope, 'card'); assert.equal(visibility, 'private'); assert.equal(key, 'personalNotes');
    return { note: 'Gizli metin', items: [] };
  } };
  const badges = await handler(t);
  assert.equal(badges[0].text, 'Özel notum var');
  assert.equal(JSON.stringify(badges).includes('Gizli metin'), false);
  assert.equal((await handler({ ...t, get: async () => null })).length, 0);
  assert.equal((await handler({ ...t, get: async () => { throw Error('offline'); } })).length, 0);
  assert.equal((await handler({ ...t, isMemberSignedIn: () => false })).length, 0);
  assert.equal(reads, 1);
});
test('board overview button is signed-in only and opens board modal', async () => {
  const button = capabilities()['board-buttons']()[0];
  assert.equal(button.condition, 'signedIn');
  let options;
  await button.callback({ modal: value => { options = value; } });
  assert.equal(options.title, 'Bu panodaki özel notlarım');
  assert.equal(options.url, './board.html?v=20261119-workflow');
});
test('signed-out users get no card section; existing popup remains available for signed-in users', () => {
  const handlers = capabilities();
  assert.equal(handlers['card-back-section']({ isMemberSignedIn: () => false }), null);
  assert.equal(handlers['card-buttons']()[0].condition, 'signedIn');
});
