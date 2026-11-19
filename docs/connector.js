/* The connector never reads or exposes note contents. */
window.TrelloPowerUp.initialize({
  'card-back-section': (t) => {
    if (!t.isMemberSignedIn()) return null;
    return {
      title: 'Özel Notlarım',
      icon: new URL('icon.svg', window.location.href).href,
      content: {
        type: 'iframe',
        url: t.signUrl('./editor.html?embedded=1&v=20261119-directcopy'),
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
      url: './editor.html?v=20261119-directcopy',
      height: 560,
    }),
  }],
});
