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
  assert.equal(section.content.url, 'signed:./editor.html?embedded=1&v=20261119-copy');
  assert.equal(section.icon, 'https://example.com/trello/icon.svg');
  assert.ok(section.content.height <= 1500);
});
test('signed-out users get no card section; existing popup remains available for signed-in users', () => {
  const handlers = capabilities();
  assert.equal(handlers['card-back-section']({ isMemberSignedIn: () => false }), null);
  assert.equal(handlers['card-buttons']()[0].condition, 'signedIn');
});
