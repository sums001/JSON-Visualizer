// The Chrome extension opens the app in a frame over a JSON response (index.html?embed) and hands it the
// response text. Messages to the parent carry no data, so they don't need a target origin.
export const EMBED = window.parent !== window && new URLSearchParams(location.search).has('embed');

const tell = (type) => window.parent.postMessage({ type }, '*');

export const announceReady = () => tell('prism:ready');
// Hand the page back to the browser's own view, with a button to come back.
export const showOriginal = () => tell('prism:original');
// The response wasn't JSON after all: restore the page for good.
export const giveUp = () => tell('prism:fail');

// Inside the extension (the frame or its own tab), opens its settings page; null on the website.
export const openSettings = globalThis.chrome?.runtime?.openOptionsPage ? () => chrome.runtime.openOptionsPage() : null;

// "https://api.x.com/v1/users?page=2" → "users.json"; a bare host falls back to its name.
export function fileNameFromUrl(url) {
  try {
    const u = new URL(url);
    const last = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || '') || u.hostname || 'response';
    return /\.(geo)?json$/i.test(last) ? last : last + '.json';
  } catch {
    return 'response.json';
  }
}
