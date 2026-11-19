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
window.TrelloPowerUp = { iframe: () => ({
  render: callback => callback(),
  sizeTo: async height => { window.testSectionHeight = height; },
  getContext: () => ({ member: 'test-member', card: 'test-card' }),
  get: async (scope, visibility, key, fallback) => {
    if (window.testReadFail) throw Error('offline');
    if (scope !== 'card' || visibility !== 'private') throw Error('Unexpected access');
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
      $('export-note').click();
      check(!$('export-panel').hidden, 'Export preview opens');
      check($('export-preview').value === $('note').value, 'Preview uses current note');
      let clipboardText;
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
        writeText: async text => { clipboardText = text; }
      }});
      $('copy-export').click(); await tick();
      check(clipboardText === $('note').value, 'Note copied');
      check($('export-status').textContent.startsWith('Kopyalandı.'), 'Clipboard success visible');
      $('close-export').click();
      check($('export-panel').hidden, 'Preview closes');
      $('export-checklist').click();
      check($('export-preview').value === 'Taslağı kontrol et', 'Checklist exports as item text');
      check($('export-help').textContent.includes('Tamamlanma işaretleri aktarılmaz'), 'Completion limitation visible');
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
        writeText: async () => { throw Error('denied'); }
      }});
      $('copy-export').click(); await tick();
      check($('export-status').textContent.includes('Ctrl+C'), 'Manual fallback visible');
      check($('export-preview').selectionStart === 0 &&
        $('export-preview').selectionEnd === $('export-preview').value.length, 'Manual fallback selects text');
      check(JSON.stringify(testScope) === privateBeforeExport && testWrites.length === writesBeforeExport,
        'Export does not change stored private data');
      $('close-export').click();
      check(document.documentElement.scrollWidth <= innerWidth, 'Copy controls fit narrow card');
      return { writes: testWrites.length, status: $('status').textContent };
    })()`);
    const screenshot = await call('Page.captureScreenshot', { format: 'png' }, sessionId);
    const { writeFile } = await import('node:fs/promises');
    await writeFile(`artifacts/${name}.png`, Buffer.from(screenshot.data, 'base64'));
    console.log(`${name}: UI checks passed (${result.writes} private writes); screenshot artifacts/${name}.png`);
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
