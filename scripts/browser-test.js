// Browser integration checks use a local SDK double, never a real Trello account.
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const sdk = `
window.testScope = {};
window.testFail = false;
window.testReadFail = false;
window.testWrites = [];
window.testBoardRecords = {
  'board-one': { version: 1, note: 'Ölçü kontrolü <img src=x>', priority: 'high', nextStep: 'İncele', items: [{ id: 'a', text: 'Çizimi doğrula', done: false }] },
  'board-two': { version: 1, note: 'Tamamlandı', items: [{ id: 'b', text: 'Gönder', done: true }] },
  'board-empty': null,
  'board-broken': { version: 9 }
};
window.TrelloPowerUp = { iframe: () => ({
  render: callback => callback(),
  sizeTo: async height => { window.testSectionHeight = height; },
  getContext: () => ({ member: 'test-member', card: 'test-card' }),
  cards: async () => Object.keys(window.testBoardRecords).map(id => ({ id, name: id === 'board-one' ? 'Mekanik çizim' : id, url: 'https://trello.com/c/' + id })),
  navigate: async ({ url }) => { window.testOpenedCard = url; },
  showCard: async id => { window.testOpenedCard = id; },
  closeModal: async () => {},
  get: async (scope, visibility, key, fallback) => {
    if (window.testReadFail) throw Error('offline');
    if (visibility !== 'private') throw Error('Unexpected access');
    if (scope !== 'card') return structuredClone(window.testBoardRecords[scope] ?? fallback);
    return structuredClone(key ? (window.testScope[key] ?? fallback) : window.testScope);
  },
  set: async (scope, visibility, key, value) => {
    if (window.testFail) throw Error('offline');
    if (scope !== 'card' || visibility !== 'private') throw Error('Unexpected write');
    window.testScope[key] = structuredClone(value);
    window.testWrites.push({scope, visibility, key});
  }
}) };
`;
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path === '/mock.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(sdk); return; }
    const name = path.slice(1) || 'editor.html';
    if (!/^[a-z.-]+$/.test(name)) { res.writeHead(404); res.end(); return; }
    let body = await readFile(`public/${name}`);
    if (name.endsWith('.html')) body = body.toString().replace('https://p.trellocdn.com/power-up.min.js', '/mock.js');
    res.setHeader('Content-Type', name.endsWith('.html') ? 'text/html' : name.endsWith('.css') ? 'text/css' : 'text/javascript');
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/editor.html?embedded=1`;
await mkdir('artifacts', { recursive: true });

async function run(name, binary) {
  const profile = await mkdtemp(join(tmpdir(), 'trello-notes-test-'));
  const child = spawn(binary, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let ws;
  try {
    let endpoint;
    let launchError;
    child.on('error', error => { launchError = error; });
    child.stderr.resume();
    for (let attempt = 0; attempt < 100; attempt++) {
      if (launchError) throw launchError;
      try {
        const [port, path] = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).trim().split(/\r?\n/);
        endpoint = `ws://127.0.0.1:${port}${path}`;
        break;
      } catch { await new Promise(resolve => setTimeout(resolve, 200)); }
    }
    if (!endpoint) throw Error(`${name}: debug connection timeout (exit ${child.exitCode})`);
    ws = new WebSocket(endpoint);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    let id = 0;
    const pending = new Map();
    ws.onmessage = ({ data }) => {
      const msg = JSON.parse(data);
      if (pending.has(msg.id)) {
        const { resolve, reject, timeout } = pending.get(msg.id);
        clearTimeout(timeout); pending.delete(msg.id);
        msg.error ? reject(Error(msg.error.message)) : resolve(msg.result);
      }
    };
    const call = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
      const requestId = ++id;
      const timeout = setTimeout(() => { pending.delete(requestId); reject(Error(`${method} timeout`)); }, 10000);
      pending.set(requestId, { resolve, reject, timeout });
      ws.send(JSON.stringify({ id: requestId, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
    const { targetId } = await call('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true });
    const evaluate = async expression => {
      const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
      if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    await call('Emulation.setDeviceMetricsOverride', { width: 340, height: 640, deviceScaleFactor: 1, mobile: false }, sessionId);
    await call('Page.navigate', { url }, sessionId);
    for (let attempt = 0; attempt < 60; attempt++) {
      if (await evaluate(`document.getElementById('status')?.textContent === 'Notlarınız hazır.'`)) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(await evaluate(`document.getElementById('status').textContent`), 'Notlarınız hazır.');
    const result = await evaluate(`(async () => {
      const $ = id => document.getElementById(id);
      const check = (value, message) => { if (!value) throw Error(message); };
      const tick = () => new Promise(resolve => setTimeout(resolve, 30));
      const setNote = text => { $('note').value = text; $('note').dispatchEvent(new Event('input')); };
      check($('save').disabled, 'Clean form should not save');
      check($('export-note').disabled && $('export-checklist').disabled, 'Empty exports disabled');
      check(document.body.classList.contains('embedded'), 'Embedded layout active');
      check(testSectionHeight > 0 && testSectionHeight <= 1400, 'Section resizes within Trello limit');
      setNote('Türkçe İğüş 😊 <img src=x onerror=alert(1)>');
      $('add').click();
      const input = $('items').querySelector('input[type=text]');
      input.value = 'İlk madde'; input.dispatchEvent(new Event('input'));
      $('items').querySelector('input[type=checkbox]').click();
      check($('progress').textContent === '1 / 1', 'Checklist progress');
      $('save').click(); await tick();
      check($('status').textContent === 'Kaydedildi.', 'Save success');
      check(testScope.personalNotes.items[0].done === true, 'Done stored');
      check(!document.querySelector('img'), 'HTML must remain text');
      const persisted = JSON.stringify(testScope.personalNotes);
      setNote('x'.repeat(4096));
      check($('save').disabled && !$('limit').hidden, 'Oversize blocked');
      setNote('Ağ hatasında korunacak taslak');
      testFail = true; $('save').click(); await tick();
      check($('status').textContent.startsWith('Kaydedilemedi.'), 'Failure shown');
      check($('note').value === 'Ağ hatasında korunacak taslak', 'Draft retained');
      check(JSON.stringify(testScope.personalNotes) === persisted, 'Failed save unchanged');
      testFail = false; $('save').click(); await tick();
      check($('status').textContent === 'Kaydedildi.', 'Retry works');
      $('items').querySelector('.remove').click();
      check($('progress').textContent === '0 / 0', 'Delete item');
      $('save').click(); await tick();
      check(testScope.personalNotes.items.length === 0, 'Deletion saved');
      setNote(''); $('save').click(); await tick();
      check(testScope.personalNotes.note === '', 'Empty note saved');
      check(document.documentElement.scrollWidth <= innerWidth, 'No horizontal overflow');
      setNote('Toplantı öncesinde gündemi gözden geçir.');
      $('add').click();
      const finalInput = $('items').querySelector('input[type=text]');
      finalInput.value = 'Taslağı kontrol et'; finalInput.dispatchEvent(new Event('input'));
      $('save').click(); await tick();
      const privateBeforeExport = JSON.stringify(testScope);
      const writesBeforeExport = testWrites.length;
      let clipboardText;
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
        writeText: async text => { clipboardText = text; }
      }});
      $('export-note').click(); await tick();
      check(clipboardText === $('note').value, 'Note copied');
      check($('export-status').textContent.startsWith('Not kopyalandı.'), 'Clipboard success visible');
      check(!$('export-panel') && !$('export-preview'), 'No preview exists');
      $('export-checklist').click(); await tick();
      check(clipboardText === 'Taslağı kontrol et', 'Checklist copied immediately');
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
        writeText: async () => { throw Error('denied'); }
      }});
      document.execCommand = command => {
        check(command === 'copy', 'Only copy command used');
        clipboardText = document.activeElement.value;
        return true;
      };
      $('export-note').focus();
      $('export-note').click(); await tick();
      check(clipboardText === $('note').value, 'Selection-copy fallback uses note text');
      check(document.activeElement === $('export-note'), 'Fallback restores focus');
      check(!document.querySelector('textarea[aria-hidden]'), 'Temporary copy field removed');
      document.execCommand = () => false;
      $('export-note').click(); await tick();
      check($('export-status').textContent.startsWith('Kopyalanamadı.'), 'Clipboard denial reported honestly');
      check(JSON.stringify(testScope) === privateBeforeExport && testWrites.length === writesBeforeExport,
        'Export does not change stored private data');
      check(document.documentElement.scrollWidth <= innerWidth, 'Copy controls fit narrow card');
      return { writes: testWrites.length, status: $('status').textContent };
    })()`);
    await evaluate(`(async () => {
      const $ = id => document.getElementById(id);
      const check = (value, message) => { if (!value) throw Error(message); };
      const tick = () => new Promise(resolve => setTimeout(resolve, 30));
      const field = document.querySelector('#items input[type=text]');
      field.focus(); field.select();
      const data = new DataTransfer(); data.setData('text/plain', 'Ölçü kontrolü\\r\\nÇizimi gönder\\n\\nTeslim et');
      field.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
      check($('items').children.length === 3, 'Multiline paste creates separate nonempty rows');
      check(document.activeElement.value === 'Teslim et', 'Paste focuses last inserted item');
      $('items').querySelector('input[type=checkbox]').click();
      const writes = testWrites.length;
      $('toggle-done').click();
      check($('items').children[0].hidden, 'Completed item hidden');
      check($('progress').textContent === '1 / 3', 'Progress includes hidden completed items');
      check(testWrites.length === writes, 'Hide is a view operation');
      $('toggle-done').click();
      check(!$('items').children[0].hidden, 'Completed item shown');
      // Exercise drag events through the same browser DOM event path as user drag/drop.
      const transfer = new DataTransfer();
      const first = $('items').children[0]; const last = $('items').children[2];
      first.querySelector('.drag-handle').dispatchEvent(new DragEvent('dragstart', { dataTransfer: transfer, bubbles: true, cancelable: true }));
      const box = last.getBoundingClientRect();
      last.dispatchEvent(new DragEvent('dragover', { dataTransfer: transfer, bubbles: true, cancelable: true }));
      last.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, clientY: box.bottom - 1, bubbles: true, cancelable: true }));
      check($('items').children[2].querySelector('input[type=text]').value === 'Ölçü kontrolü', 'Drag moves item to end');
      check($('items').children[2].querySelector('input[type=checkbox]').checked, 'Drag preserves completion');
      $('items').children[2].querySelector('input[type=text]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true, cancelable: true }));
      check($('items').children[1].querySelector('input[type=text]').value === 'Ölçü kontrolü', 'Keyboard reorder works');
      $('priority').value = 'high'; $('priority').dispatchEvent(new Event('change'));
      $('next-step').value = 'Numuneyi kontrol et'; $('next-step').dispatchEvent(new Event('input'));
      $('collapse').click();
      check($('editor').hidden && !$('collapsed-summary').hidden, 'Section collapses');
      check($('collapsed-summary').textContent.includes('Kaydedilmemiş'), 'Collapsed dirty warning');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }));
      await tick();
      check(testScope.personalNotes.priority === 'high' && testScope.personalNotes.nextStep === 'Numuneyi kontrol et', 'Ctrl+S saves new fields while collapsed');
      check(testScope.personalNotes.items[1].done, 'Saved order and state match');
      check($('save').disabled, 'Ctrl+S leaves clean state');
      $('collapse').click();
      check(!$('editor').hidden && $('priority').value === 'high', 'Expand preserves fields');
      check(document.documentElement.scrollWidth <= innerWidth, 'Workflow layout fits narrow card');
    })()`);
    // Use genuine browser key input so accidental HTML form submission is covered.
    await evaluate(`document.querySelector('#items input[type=text]').focus()`);
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }, sessionId);
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }, sessionId);
    assert.equal(await evaluate(`document.querySelectorAll('#items li').length`), 4);
    assert.equal(await evaluate(`document.activeElement === document.querySelectorAll('#items input[type=text]')[1]`), true);
    const writesAfterFeatures = await evaluate(`testWrites.length`);
    assert.equal(writesAfterFeatures, result.writes + 1);
    // Empty Enter must neither add another blank row nor save the form.
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }, sessionId);
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }, sessionId);
    assert.equal(await evaluate(`document.querySelectorAll('#items li').length`), 4);
    assert.equal(await evaluate(`testWrites.length`), writesAfterFeatures);
    await evaluate(`(() => {
      const inputs = document.querySelectorAll('#items input[type=text]');
      inputs[1].value = 'Sonraki iş'; inputs[1].dispatchEvent(new Event('input'));
      inputs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
      if (document.querySelectorAll('#items input[type=text]')[2].value !== 'Sonraki iş') throw Error('Enter must insert after current row');
      const middle = document.querySelectorAll('#items input[type=text]')[1];
      middle.value = 'Yeni madde'; middle.dispatchEvent(new Event('input'));
      middle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', repeat: true, cancelable: true }));
      middle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, cancelable: true }));
      if (document.querySelectorAll('#items li').length !== 5) throw Error('Repeat/IME should not insert');
      // Restore the saved example for the screenshot; no writes are needed.
      document.querySelectorAll('#items .remove')[2].click();
      document.querySelectorAll('#items .remove')[1].click();
    })()`);
    const screenshot = await call('Page.captureScreenshot', { format: 'png' }, sessionId);
    const { writeFile } = await import('node:fs/promises');
    await writeFile(`artifacts/${name}.png`, Buffer.from(screenshot.data, 'base64'));
    // Render and exercise the board modal with a separate local SDK context.
    await call('Page.navigate', { url: url.replace('editor.html?embedded=1', 'board.html') }, sessionId);
    for (let attempt = 0; attempt < 60; attempt++) {
      if (await evaluate(`document.getElementById('records')?.children.length === 2`)) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    await evaluate(`(async () => {
      const $ = id => document.getElementById(id);
      const check = (value, message) => { if (!value) throw Error(message); };
      const tick = () => new Promise(resolve => setTimeout(resolve, 30));
      check($('records').children.length === 2, 'Board shows only records with content');
      check(!$('board-warning').hidden && $('board-warning').textContent.includes('1 kart'), 'Partial failure visible');
      check(!document.querySelector('img'), 'Board text is not rendered as HTML');
      $('only-open').click();
      check($('records').children.length === 1, 'Board open task filter');
      $('only-open').click();
      $('search').value = 'incele'; $('search').dispatchEvent(new Event('input'));
      check($('records').children.length === 1, 'Turkish next-step search');
      $('search').value = ''; $('search').dispatchEvent(new Event('input'));
      $('records').querySelector('.card-link').click(); await tick();
      check(testOpenedCard === 'https://trello.com/c/board-one', 'Card navigation uses Trello card url');
      testReadFail = true; $('reload').click(); await tick();
      check(!$('board-warning').hidden && $('board-warning').textContent.includes('4 kart'), 'All card read failures visible');
      testReadFail = false; $('reload').click(); await tick();
      check($('records').children.length === 2, 'Board can reload after read failures');
      check(testWrites.length === 0, 'Board is read only');
      check(document.documentElement.scrollWidth <= innerWidth, 'Board fits narrow layout');
    })()`);
    const boardShot = await call('Page.captureScreenshot', { format: 'png' }, sessionId);
    await writeFile(`artifacts/${name}-board.png`, Buffer.from(boardShot.data, 'base64'));
    console.log(`${name}: editor and board UI checks passed (including keyboard, paste, drag, filters and read failures); screenshots artifacts/${name}.png and artifacts/${name}-board.png`);
    await call('Browser.close');
  } finally {
    ws?.close();
    if (child.exitCode === null) child.kill();
    await new Promise(resolve => setTimeout(resolve, 400));
    // This directory was generated exclusively for this test run.
    const target = resolve(profile);
    if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('trello-notes-test-')) {
      throw Error('Unexpected test profile path; cleanup refused');
    }
    await rm(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 }).catch(() => {});
  }
}

try {
  await run('chrome', 'C:/Program Files/Google/Chrome/Application/chrome.exe');
  await run('edge', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe');
} finally { server.close(); }
