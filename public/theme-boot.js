// Applies the saved theme (light unless the user picked dark) before first paint so the page never flashes the other one.
// A file rather than an inline script: the Chrome extension's pages forbid inline scripts.
var t = 'light';
try {
  if (localStorage.getItem('prism-theme') === 'dark') t = 'dark';
} catch (e) {}
document.documentElement.dataset.theme = t;
// Preload only this theme's brand mark; preloading both always leaves one unused, which Chrome warns about.
var l = document.createElement('link');
l.rel = 'preload';
l.as = 'image';
l.href = '/prism-mark-on-' + t + '-512.png';
document.head.appendChild(l);
