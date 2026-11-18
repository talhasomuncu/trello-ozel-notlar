/* The connector never reads or exposes note contents. */
window.TrelloPowerUp.initialize({
  'card-buttons': () => [{
    icon: new URL('icon.svg', window.location.href).href,
    text: 'Özel Notlarım',
    condition: 'signedIn',
    callback: (t) => t.popup({
      title: 'Özel Notlarım',
      url: './editor.html',
      height: 560,
    }),
  }],
});
