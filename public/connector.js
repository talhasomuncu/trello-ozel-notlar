const RELEASE = '20261119-autosave';
const ICON = new URL('icon.svg', window.location.href).href;
window.TrelloPowerUp.initialize({
  'card-back-section': (t) => {
    if (!t.isMemberSignedIn()) return null;
    return {
      title: 'Özel Notlarım',
      icon: new URL('icon.svg', window.location.href).href,
      content: {
        type: 'iframe',
        url: t.signUrl(`./editor.html?embedded=1&v=${RELEASE}`),
        height: 560,
      },
    };
  },
  'card-buttons': () => [{
    icon: new URL('icon.svg', window.location.href).href,
    text: 'Özel Notlarım',
    condition: 'signedIn',
    callback: (t) => t.popup({
      title: 'Özel Notlarım',
      url: `./editor.html?v=${RELEASE}`,
      height: 560,
    }),
  }],
  'card-badges': async (t) => {
    if (!t.isMemberSignedIn()) return [];
    try {
      const value = await t.get('card', 'private', 'personalNotes', null);
      const content = value && (value.note?.trim() || value.nextStep?.trim() ||
        (value.priority && value.priority !== 'normal') || value.items?.some(item => item.text?.trim()));
      return content ? [{ icon: ICON, text: 'Özel notum var', color: 'blue' }] : [];
    } catch { return []; }
  },
  'board-buttons': () => [{
    icon: { dark: ICON, light: ICON }, text: 'Özel Notlarım', condition: 'signedIn',
    callback: t => t.modal({ title: 'Bu panodaki özel notlarım', url: `./board.html?v=${RELEASE}`, height: 640, fullscreen: false }),
  }],
});
