import { LIMIT, emptyNotes, readNotes, saveNotes, storageSize, moveItem, pastedLines, priorityLabel } from './model.js?v=20261119-workflow';
import { exportText, copyText } from './export.js?v=20261119-directcopy';

const $ = (id) => document.getElementById(id);
let t;
let draft = emptyNotes();
let saved = '';
let scope = {};
let loaded = false;
let saving = false;
let hideDone = false;
let collapsed = false;
let prefKey = '';
let draggedId = null;
function rememberView() {
  try { if (prefKey) localStorage.setItem(prefKey, JSON.stringify({ hideDone, collapsed })); } catch { /* View preferences are optional. */ }
}
function applyView() {
  $('editor').hidden = collapsed;
  $('collapsed-summary').hidden = !collapsed;
  $('collapse').textContent = collapsed ? 'Genişlet' : 'Daralt';
  $('collapse').setAttribute('aria-expanded', String(!collapsed));
  $('toggle-done').textContent = hideDone ? 'Tamamlananları göster' : 'Tamamlananları gizle';
  $('toggle-done').setAttribute('aria-pressed', String(hideDone));
}
const embedded = new URLSearchParams(window.location.search).get('embedded') === '1';
document.body.classList.toggle('embedded', embedded);
if (embedded) {
  document.querySelector('.hint').textContent = 'Kartı kapatmadan önce değişikliklerinizi kaydedin.';
}

function fitSection() {
  if (!embedded || !t) return;
  // Keep long checklists scrollable within Trello's 1500px section limit.
  const height = Math.min(1400, Math.ceil(document.querySelector('main').getBoundingClientRect().height) + 4);
  Promise.resolve(t.sizeTo(height)).catch(() => {});
}

function status(message, error = false) {
  $('status').textContent = message;
  $('status').classList.toggle('error', error);
}

function refresh(changed = false) {
  const size = storageSize(draft, scope);
  const dirty = JSON.stringify(draft) !== saved;
  $('usage').textContent = `${size} / ${LIMIT}`;
  $('capacity').value = Math.min(size, LIMIT);
  $('limit').hidden = size <= LIMIT;
  $('save').disabled = !loaded || saving || !dirty || size > LIMIT;
  $('fields').disabled = !loaded || saving;
  $('export-note').disabled = !loaded || saving || !draft.note.trim();
  $('export-checklist').disabled = !loaded || saving || !exportText(draft, 'checklist');
  $('progress').textContent = `${draft.items.filter((item) => item.done).length} / ${draft.items.length}`;
  $('collapsed-summary').textContent = `${priorityLabel(draft.priority)} öncelik · ${draft.items.filter(item => !item.done && item.text.trim()).length} açık madde${dirty ? ' · Kaydedilmemiş değişiklikler var' : ''}`;
  if (changed) status(dirty ? 'Kaydedilmemiş değişiklikler var.' : 'Tüm değişiklikler kaydedildi.');
  fitSection();
}

function renderItems() {
  $('items').replaceChildren();
  for (const item of draft.items) {
    const row = document.createElement('li');
    row.dataset.id = item.id;
    row.hidden = hideDone && item.done;
    row.classList.toggle('done', item.done);
    const handle = document.createElement('button');
    handle.type = 'button'; handle.className = 'drag-handle'; handle.draggable = true;
    handle.textContent = '⠿'; handle.title = 'Sürükleyerek veya Alt+↑/↓ ile sırala';
    handle.setAttribute('aria-label', 'Maddeyi sırala: sürükle veya Alt ve ok tuşları');
    handle.addEventListener('dragstart', event => {
      if (saving) { event.preventDefault(); return; }
      draggedId = item.id;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', item.id);
    });
    handle.addEventListener('dragend', () => {
      draggedId = null;
      document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    });
    row.addEventListener('dragover', event => {
      if (!draggedId || saving) return;
      event.preventDefault(); event.dataTransfer.dropEffect = 'move'; row.classList.add('drag-over');
    });
    row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
    row.addEventListener('drop', event => {
      if (!draggedId || saving) return;
      event.preventDefault();
      const bounds = row.getBoundingClientRect();
      const source = draggedId; draggedId = null;
      if (moveItem(draft.items, source, item.id, event.clientY > bounds.top + bounds.height / 2)) {
        renderItems(); refresh(true); focusItem(source);
      } else row.classList.remove('drag-over');
    });
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = item.done;
    checkbox.setAttribute('aria-label', 'Maddeyi tamamlandı olarak işaretle');
    const input = document.createElement('input');
    input.type = 'text';
    input.value = item.text;
    input.placeholder = 'Yapılacak bir şey…';
    input.setAttribute('aria-label', 'Madde metni');
    input.addEventListener('input', () => { item.text = input.value; refresh(true); });
    const keyboardMove = (event) => {
      if (!event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const visible = draft.items.filter(other => !hideDone || !other.done);
      const index = visible.findIndex(other => other.id === item.id);
      const target = visible[index + (event.key === 'ArrowUp' ? -1 : 1)];
      if (target && moveItem(draft.items, item.id, target.id, event.key === 'ArrowDown')) {
        renderItems(); refresh(true); focusItem(item.id);
      }
    };
    handle.addEventListener('keydown', keyboardMove);
    input.addEventListener('keydown', keyboardMove);
    input.addEventListener('paste', event => {
      const text = event.clipboardData?.getData('text/plain');
      if (!text || !/[\r\n]/.test(text)) return;
      event.preventDefault();
      const lines = pastedLines(item.text, input.selectionStart, input.selectionEnd, text);
      if (!lines.length) return;
      const index = draft.items.findIndex(other => other.id === item.id);
      item.text = lines[0];
      const inserted = lines.slice(1).map(line => ({ id: crypto.randomUUID(), text: line, done: false }));
      draft.items.splice(index + 1, 0, ...inserted);
      renderItems(); refresh(true); focusItem(inserted.at(-1)?.id || item.id);
    });
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.isComposing) return;
      // Enter in a checklist never submits the whole notes form.
      event.preventDefault();
      if (event.repeat || !item.text.trim()) return;
      const index = draft.items.findIndex((other) => other.id === item.id);
      draft.items.splice(index + 1, 0, { id: crypto.randomUUID(), text: '', done: false });
      renderItems();
      refresh(true);
      $('items').children[index + 1].querySelector('input[type="text"]').focus();
    });
    checkbox.addEventListener('change', () => {
      item.done = checkbox.checked;
      row.classList.toggle('done', item.done);
      row.hidden = hideDone && item.done;
      if (row.hidden) $('toggle-done').focus();
      refresh(true);
    });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove';
    remove.textContent = 'Sil';
    remove.setAttribute('aria-label', 'Maddeyi sil');
    remove.addEventListener('click', () => {
      draft.items = draft.items.filter((other) => other.id !== item.id);
      renderItems();
      refresh(true);
      $('add').focus();
    });
    row.append(handle, checkbox, input, remove);
    $('items').append(row);
  }
}

function focusItem(id) {
  const row = Array.from($('items').children).find(el => el.dataset.id === id);
  row?.querySelector('input[type="text"]').focus();
}

async function load() {
  $('retry').hidden = true;
  status('Yükleniyor…');
  try {
    t ??= window.TrelloPowerUp.iframe();
    const context = t.getContext();
    if (!context.member || !context.card) throw new Error('NO_CONTEXT');
    prefKey = `private-notes-view:${context.member}:${context.card}`;
    try {
      const prefs = JSON.parse(localStorage.getItem(prefKey) || '{}');
      hideDone = prefs.hideDone === true; collapsed = prefs.collapsed === true;
    } catch { /* Defaults work when local storage is unavailable. */ }
    draft = await readNotes(t);
    scope = (await t.get('card', 'private')) || {};
    saved = JSON.stringify(draft);
    $('note').value = draft.note;
    $('priority').value = draft.priority || 'normal';
    $('next-step').value = draft.nextStep || '';
    applyView();
    renderItems();
    loaded = true;
    status('Notlarınız hazır.');
  } catch (error) {
    status(error.message === 'UNSUPPORTED_DATA'
      ? 'Kayıt biçimi desteklenmiyor. Mevcut verileriniz değiştirilmedi.'
      : 'Notlar yüklenemedi. Trello kartından açtığınızdan ve bağlantınızdan emin olup yeniden deneyin.', true);
    $('retry').hidden = false;
  }
  refresh();
}

$('note').addEventListener('input', () => { draft.note = $('note').value; refresh(true); });
$('priority').addEventListener('change', () => {
  if ($('priority').value === 'normal') delete draft.priority;
  else draft.priority = $('priority').value;
  refresh(true);
});
$('next-step').addEventListener('input', () => {
  if ($('next-step').value) draft.nextStep = $('next-step').value;
  else delete draft.nextStep;
  refresh(true);
});
$('next-step').addEventListener('keydown', event => { if (event.key === 'Enter') event.preventDefault(); });
$('toggle-done').addEventListener('click', () => {
  hideDone = !hideDone; rememberView(); applyView(); renderItems(); fitSection();
});
$('collapse').addEventListener('click', () => {
  collapsed = !collapsed; rememberView(); applyView(); refresh();
});
$('add').addEventListener('click', () => {
  draft.items.push({ id: crypto.randomUUID(), text: '', done: false });
  renderItems();
  refresh(true);
  $('items').lastElementChild.querySelector('input[type="text"]').focus();
});
$('retry').addEventListener('click', load);
async function copyExport(kind) {
  const text = exportText(draft, kind);
  if (!loaded || saving || !text.trim()) return;
  const copied = await copyText(text);
  $('export-status').textContent = copied
    ? (kind === 'note'
      ? 'Not kopyalandı. Kart açıklamasına yapıştırabilirsiniz.'
      : 'Checklist kopyalandı. Trello checklistine yapıştırabilirsiniz; tamamlanma işaretleri aktarılmaz.')
    : 'Kopyalanamadı. Tarayıcınızın pano erişim iznini kontrol edip yeniden deneyin.';
  $('export-status').classList.toggle('error', !copied);
  fitSection();
}
$('export-note').addEventListener('click', () => copyExport('note'));
$('export-checklist').addEventListener('click', () => copyExport('checklist'));
async function saveDraft() {
  if ($('save').disabled) return;
  saving = true;
  refresh();
  status('Kaydediliyor…');
  try {
    await saveNotes(t, draft);
    saved = JSON.stringify(draft);
    status('Kaydedildi.');
  } catch (error) {
    status(error.message === 'CAPACITY_EXCEEDED'
      ? 'Depolama sınırı aşıldı. İçeriği kısaltıp yeniden kaydedin.'
      : 'Kaydedilemedi. Taslağınız bu pencerede duruyor; Kaydet ile yeniden deneyin.', true);
  } finally {
    saving = false;
    refresh();
  }
}
$('editor').addEventListener('submit', event => { event.preventDefault(); saveDraft(); });
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    if (!event.repeat) saveDraft();
  }
});

// A Trello popup can close without a browser unload confirmation; the UI warns explicitly.
window.addEventListener('beforeunload', (event) => {
  if (loaded && JSON.stringify(draft) !== saved) { event.preventDefault(); event.returnValue = ''; }
});
if (embedded) {
  // Render notifications must not re-read storage over an unsaved draft.
  try {
    t = window.TrelloPowerUp.iframe();
    t.render(fitSection);
  } catch { /* load() displays the normal connection error and retry control. */ }
  new ResizeObserver(fitSection).observe(document.querySelector('main'));
}
load();
