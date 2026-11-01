// Swaps a JSON response for the Prism viewer, or flags it on the toolbar button, as the settings say.
// Runs at document_start in the top frame of every page.
(() => {
  // application/json, text/json, application/vnd.api+json, application/geo+json, application/x-ndjson, …
  const JSON_TYPE = /^(application|text)\/([\w.-]+\+)?(json|x-ndjson|ndjson|jsonl)$/i;
  const typed = JSON_TYPE.test(document.contentType);
  // plain text gets a closer look once it has loaded: raw.githubusercontent.com and many servers send JSON that way
  if (!typed && document.contentType !== 'text/plain') return;

  // keep in step with DEFAULTS in src/options/Options.jsx
  const DEFAULTS = { open: 'auto', detectText: true, view: 'raw' };
  const settings = chrome.storage.sync.get(DEFAULTS).catch(() => DEFAULTS);

  const root = document.documentElement;
  // CSSOM rather than a <style> element, which a page's CSP can block
  const hidePage = () => Object.assign(root.style, { visibility: 'hidden', overflow: 'hidden' });
  const showPage = () => Object.assign(root.style, { visibility: '', overflow: '' });

  // A declared JSON response stays hidden while we look, so the raw text never flashes. The settings are
  // read by then (they're local and fast); if they say to only flag the page, it's shown again.
  if (typed) hidePage();

  let text = null; // the response, once it's known to be JSON
  let prism = null; // the viewer's controls, once it's mounted

  // the toolbar button asks for the viewer; answering tells it whether this page has JSON to show
  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg?.type !== 'prism:open') return;
    if (text === null) return reply({ ok: false });
    if (prism) prism.show();
    else settings.then((s) => mount(s));
    reply({ ok: true });
  });

  document.addEventListener(
    'DOMContentLoaded',
    async () => {
      // Chrome renders a text response as <body><pre>…</pre></body>
      const pre = document.body?.querySelector(':scope > pre');
      const s = await settings;
      const body = pre?.textContent ?? '';
      if (!pre || (!typed && (!s.detectText || !isJsonDocument(body)))) return showPage();
      text = body;
      if (s.open === 'auto') return mount(s);
      showPage();
      chrome.runtime.sendMessage({ type: 'prism:detected' }).catch(() => {});
    },
    { once: true },
  );

  // Only an object or array counts; a lone number or string in a text file isn't worth a viewer.
  function isJsonDocument(body) {
    const t = body.trim();
    if (!/^[[{]/.test(t)) return false;
    try {
      return typeof JSON.parse(t) === 'object';
    } catch {
      return false;
    }
  }

  function mount({ view }) {
    const origin = chrome.runtime.getURL('').replace(/\/$/, '');
    const frame = document.createElement('iframe');
    frame.src = chrome.runtime.getURL('index.html?embed');
    frame.allow = 'clipboard-read; clipboard-write';
    Object.assign(frame.style, {
      position: 'fixed',
      inset: '0',
      width: '100%',
      height: '100%',
      border: '0',
      margin: '0',
      zIndex: '2147483647',
      visibility: 'visible', // the page underneath is hidden; the frame opts back in
    });

    // shown over the browser's own view, to return to Prism
    const back = document.createElement('button');
    back.textContent = 'Open in JSON Prism';
    Object.assign(back.style, {
      position: 'fixed',
      top: '12px',
      right: '16px',
      zIndex: '2147483647',
      display: 'none',
      padding: '7px 12px',
      font: '500 13px/16px system-ui, -apple-system, "Segoe UI", sans-serif',
      color: '#ededef',
      background: '#111214',
      border: '1px solid rgba(255, 255, 255, 0.10)',
      borderRadius: '8px',
      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.24)',
      cursor: 'pointer',
    });

    const show = () => {
      hidePage();
      frame.style.display = '';
      back.style.display = 'none';
      frame.focus();
    };
    const showOriginal = () => {
      showPage();
      frame.style.display = 'none';
      back.style.display = '';
    };
    back.addEventListener('click', show);

    window.addEventListener('message', (e) => {
      if (e.source !== frame.contentWindow || e.origin !== origin) return;
      const type = e.data?.type;
      if (type === 'prism:ready') frame.contentWindow.postMessage({ type: 'prism:json', text, url: location.href, view }, origin);
      else if (type === 'prism:original') showOriginal();
      else if (type === 'prism:fail') {
        frame.remove();
        back.remove();
        showPage();
        text = null;
        prism = null;
      }
    });

    hidePage();
    document.body.append(frame, back);
    frame.addEventListener('load', () => frame.focus(), { once: true });
    prism = { show };
  }
})();
