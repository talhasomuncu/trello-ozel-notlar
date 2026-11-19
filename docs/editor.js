import { LIMIT, emptyNotes, readNotes, saveNotes, storageSize } from './model.js';
import { exportText, copyText } from './export.js';

const $ = (id) => document.getElementById(id);
let t;
let draft = emptyNotes();
let saved = '';
let scope = {};
let loaded = false;
let saving = false;
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
  if (changed) status(dirty ? 'Kaydedilmemiş değişiklikler var.' : 'Tüm değişiklikler kaydedildi.');
  fitSection();
}

function renderItems() {
  $('items').replaceChildren();
  for (const item of draft.items) {
    const row = document.createElement('li');
    row.classList.toggle('done', item.done);
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
    checkbox.addEventListener('change', () => {
      item.done = checkbox.checked;
      row.classList.toggle('done', item.done);
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
    row.append(checkbox, input, remove);
    $('items').append(row);
  }
}

async function load() {
  $('retry').hidden = true;
  status('Yükleniyor…');
  try {
    t ??= window.TrelloPowerUp.iframe();
    const context = t.getContext();
    if (!context.member || !context.card) throw new Error('NO_CONTEXT');
    draft = await readNotes(t);
    scope = (await t.get('card', 'private')) || {};
    saved = JSON.stringify(draft);
    $('note').value = draft.note;
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
$('add').addEventListener('click', () => {
  draft.items.push({ id: crypto.randomUUID(), text: '', done: false });
  renderItems();
  refresh(true);
  $('items').lastElementChild.querySelector('input[type="text"]').focus();
});
$('retry').addEventListener('click', load);
let exportTrigger;
function showExport(kind) {
  exportTrigger = kind === 'note' ? $('export-note') : $('export-checklist');
  $('export-title').textContent = kind === 'note' ? 'Notu kart açıklamasına aktar' : 'Checklist maddelerini aktar';
  $('export-help').textContent = kind === 'note'
    ? 'Kopyaladıktan sonra kart açıklamasını düzenleyin ve metni mevcut açıklamanın sonuna yapıştırın. Ardından Trello’da kaydedin.'
    : 'Kopyaladıktan sonra kartta normal bir checklist açın. Madde ekleme alanına yapıştırın ve Trello’nun ayrı maddeler oluşturma seçeneğini kullanın. Tamamlanma işaretleri aktarılmaz; boş maddeler atlanır.';
  // Snapshot the current visible draft, including unsaved edits, only after a user click.
  $('export-preview').value = exportText(draft, kind);
  $('export-status').textContent = '';
  $('export-panel').hidden = false;
  $('export-preview').focus();
  $('export-preview').select();
  $('export-panel').scrollIntoView({ block: 'nearest' });
  fitSection();
}
$('export-note').addEventListener('click', () => showExport('note'));
$('export-checklist').addEventListener('click', () => showExport('checklist'));
$('copy-export').addEventListener('click', async () => {
  const copied = await copyText($('export-preview').value);
  $('export-status').textContent = copied
    ? 'Kopyalandı. Şimdi Trello’daki ilgili alana yapıştırabilirsiniz.'
    : 'Tarayıcı otomatik kopyalamaya izin vermedi. Seçili metni Ctrl+C ile kopyalayın.';
  if (!copied) { $('export-preview').focus(); $('export-preview').select(); }
  fitSection();
});
$('close-export').addEventListener('click', () => {
  $('export-panel').hidden = true;
  exportTrigger?.focus();
  fitSection();
});
$('editor').addEventListener('submit', async (event) => {
  event.preventDefault();
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
