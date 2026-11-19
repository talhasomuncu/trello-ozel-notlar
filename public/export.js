// Clipboard exports do not write to Trello's shared fields or change private data.
export function exportText(value, kind) {
  if (kind === 'note') return value.note;
  if (kind === 'checklist') {
    // Trello's paste-as-multiple-items flow expects one item per line.
    return value.items.filter(item => item.text.trim()).map(item => item.text.replace(/[\r\n]+/g, ' ')).join('\n');
  }
  throw new Error('UNKNOWN_EXPORT');
}

export async function copyText(text, clipboard = globalThis.navigator?.clipboard) {
  if (!clipboard?.writeText) return false;
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    // Trello's iframe policy or browser permissions can deny clipboard access.
    return false;
  }
}
