import { collectNotes, filterRecords } from './board-model.js?v=20261119-workflow';
import { priorityLabel } from './model.js?v=20261119-workflow';
const $ = id => document.getElementById(id);
const t = window.TrelloPowerUp.iframe();
let records = [], busy = false, readFailures = 0, loadError = false;
function render() {
  const visible = filterRecords(records, $('search').value, $('only-open').checked);
  $('records').replaceChildren();
  for (const { card, value } of visible) {
    const article = document.createElement('article'); article.className = 'note-card';
    const heading = document.createElement('h2');
    const link = document.createElement('button');
    link.type = 'button'; link.className = 'card-link'; link.textContent = card.name;
    link.addEventListener('click', async () => {
      try { await t.navigate({ url: card.url }); }
      catch { $('board-status').textContent = 'Kart açılamadı. Paneli kapatıp kartı panodan açabilirsiniz.'; }
    });
    heading.append(link); article.append(heading);
    const priority = document.createElement('p'); priority.className = 'hint';
    priority.textContent = `Kişisel öncelik: ${priorityLabel(value.priority)}`; article.append(priority);
    if (value.nextStep) { const next = document.createElement('p'); next.textContent = `Sonraki adım: ${value.nextStep}`; article.append(next); }
    if (value.note) { const note = document.createElement('p'); note.className = 'note-text'; note.textContent = value.note; article.append(note); }
    const items = value.items.filter(item => item.text.trim());
    if (items.length) {
      const list = document.createElement('ul'); list.className = 'overview-items';
      for (const item of items) {
        const row = document.createElement('li'); row.classList.toggle('done', item.done);
        row.textContent = `${item.done ? '✓' : '○'} ${item.text}`; list.append(row);
      }
      article.append(list);
    }
    $('records').append(article);
  }
  if (!busy) $('board-status').textContent = records.length
    ? `${visible.length} / ${records.length} kart gösteriliyor.` : 'Bu panodaki erişilebilir kartlarda kayıtlı özel notunuz yok.';
  if (!busy && records.length && !visible.length) $('board-status').textContent = 'Aramanıza uygun kayıt yok.';
  if (!busy && !records.length && readFailures) $('board-status').textContent = 'Okunabilen kartlarda kayıt bulunamadı. Bazı sonuçlar eksik.';
  if (!busy && loadError) $('board-status').textContent = 'Pano yüklenemedi.';
}
async function load() {
  if (busy) return;
  busy = true; $('reload').disabled = true; $('board-warning').hidden = true;
  records = []; readFailures = 0; loadError = false; render();
  try {
    if (!t.getContext().member) throw Error('SIGNED_OUT');
    const result = await collectNotes(t, (done, total) => { $('board-status').textContent = `Kartlar okunuyor: ${done} / ${total}`; });
    records = result.records;
    readFailures = result.failures;
    if (result.failures) {
      $('board-warning').hidden = false;
      $('board-warning').textContent = `${result.failures} kartın özel kaydı okunamadı. Sonuçlar eksik olabilir; Yenile ile tekrar deneyin.`;
    }
  } catch { loadError = true; $('board-warning').hidden = false; $('board-warning').textContent = 'Pano okunamadı. Bağlantınızı kontrol edip Yenile ile tekrar deneyin.'; }
  finally { busy = false; $('reload').disabled = false; render(); }
}
$('search').addEventListener('input', render);
$('only-open').addEventListener('change', render);
$('reload').addEventListener('click', load);
load();
