// Clipboard exports do not write to Trello's shared fields or change private data.
export function exportText(value, kind) {
  if (kind === 'note') return value.note;
  if (kind === 'checklist') {
    // Trello's paste-as-multiple-items flow expects one item per line.
    return value.items.filter(item => item.text.trim()).map(item => item.text.replace(/[\r\n]+/g, ' ')).join('\n');
  }
  throw new Error('UNKNOWN_EXPORT');
}

export async function copyText(text, clipboard = globalThis.navigator?.clipboard, doc = globalThis.document) {
  try {
    if (clipboard?.writeText) {
      await clipboard.writeText(text);
      return true;
    }
  } catch { /* Some iframe policies deny the modern API; try a selection copy. */ }
  if (!doc?.body || !doc.execCommand) return false;
  const focused = doc.activeElement;
  const selection = focused && typeof focused.selectionStart === 'number'
    ? [focused.selectionStart, focused.selectionEnd] : null;
  const field = doc.createElement('textarea');
  field.value = text;
  field.setAttribute('aria-hidden', 'true');
  field.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
  doc.body.append(field);
  try {
    field.focus();
    field.select();
    return doc.execCommand('copy') === true;
  } catch { return false; }
  finally {
    field.remove();
    focused?.focus({ preventScroll: true });
    if (selection) focused.setSelectionRange(...selection);
  }
}
