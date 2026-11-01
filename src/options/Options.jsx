import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { VIEWS } from '../views';
import Icon from '../components/Icons';
import { BrandMark, Seg } from '../components/common';

// keep in step with DEFAULTS in extension/content.js, which reads these on every JSON page
const DEFAULTS = { open: 'auto', detectText: true, view: 'raw' };

// chrome.storage.sync in the extension; localStorage when the page is previewed on the dev server
const ext = globalThis.chrome?.storage?.sync;
const storage = {
  get: () => (ext ? ext.get(DEFAULTS) : Promise.resolve({ ...DEFAULTS, ...JSON.parse(localStorage.getItem('prism-settings') || '{}') })),
  set: (all) => (ext ? ext.set(all) : Promise.resolve(localStorage.setItem('prism-settings', JSON.stringify(all)))),
};

function Toggle({ on, onChange, label }) {
  return (
    <button className={'toggle' + (on ? ' on' : '')} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}>
      <span />
    </button>
  );
}

function Row({ title, children, control }) {
  return (
    <div className="op-row">
      <div className="op-row-text">
        <h3>{title}</h3>
        <p>{children}</p>
      </div>
      <div className="op-row-control">{control}</div>
    </div>
  );
}

const OPEN_MODES = [
  ['auto', 'fit', 'Open in Prism', 'Replace the response with the viewer as soon as it loads.'],
  ['ask', 'sparkle', 'Highlight the toolbar button', 'Leave the response as the browser shows it. The Prism button gets a JSON badge; click it to open the page in Prism.'],
];

export default function Options() {
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const [settings, setSettings] = useState(null);
  const [saved, setSaved] = useState(false);
  const [fileAccess, setFileAccess] = useState(null);
  const savedTimer = useRef(0);

  useEffect(() => {
    storage.get().then(setSettings);
    globalThis.chrome?.extension?.isAllowedFileSchemeAccess?.().then(setFileAccess);
  }, []);

  const change = (patch) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    storage.set(next).then(() => {
      setSaved(true);
      clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaved(false), 1600);
    });
  };

  if (!settings) return null;

  return (
    <div className="options">
      <header className="op-head">
        <div className="op-brand">
          <BrandMark size={28} />
          <div>
            <h1>JSON Prism</h1>
            <p>Settings</p>
          </div>
        </div>
        <span className={'op-saved' + (saved ? ' show' : '')} aria-live="polite">
          <Icon name="check" size={15} />
          Saved
        </span>
      </header>

      <section className="op-section">
        <h2>JSON responses</h2>
        <div className="op-card">
          <div className="op-block">
            <h3>When a page is JSON</h3>
            <div className="op-choices" role="radiogroup">
              {OPEN_MODES.map(([id, icon, title, desc]) => (
                <button key={id} role="radio" aria-checked={settings.open === id} className={'op-choice' + (settings.open === id ? ' on' : '')} onClick={() => change({ open: id })}>
                  <span className="op-radio" />
                  <span className="op-choice-text">
                    <b><Icon name={icon} size={15} />{title}</b>
                    <span>{desc}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
          <Row title="Detect JSON sent as plain text" control={<Toggle label="Detect JSON sent as plain text" on={settings.detectText} onChange={(v) => change({ detectText: v })} />}>
            Some servers, like raw.githubusercontent.com, send JSON as <span className="mono">text/plain</span>. Prism checks whether it parses as an object or array.
          </Row>
          {fileAccess !== null && (
            <Row
              title="Local files"
              control={
                <>
                  <span className={'op-status' + (fileAccess ? ' ok' : '')}>{fileAccess ? 'Allowed' : 'Off'}</span>
                  {!fileAccess && (
                    <button className="btn" onClick={() => chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` })}>
                      Extension details
                    </button>
                  )}
                </>
              }
            >
              To open <span className="mono">.json</span> files from your disk, turn on “Allow access to file URLs” in the extension’s details.
            </Row>
          )}
        </div>
      </section>

      <section className="op-section">
        <h2>Viewer</h2>
        <div className="op-card">
          <Row
            title="Open responses in"
            control={
              <label className="picker">
                <select value={settings.view} onChange={(e) => change({ view: e.target.value })}>
                  {VIEWS.map((v) => (
                    <option key={v.id} value={v.id}>{v.label}</option>
                  ))}
                </select>
                <Icon name="chevronDown" size={14} />
              </label>
            }
          >
            The view a JSON response shows first. You can switch views any time with the sidebar or keys 1–8.
          </Row>
          <Row title="Theme" control={<Seg value={theme} options={[['light', 'Light'], ['dark', 'Dark']]} onChange={setTheme} />}>
            Applies to the viewer and this page.
          </Row>
        </div>
      </section>

      <footer className="op-foot">
        {ext ? 'Response settings sync across the Chrome browsers you’re signed in to.' : 'Preview: outside the extension, settings are kept in this browser only.'}
      </footer>
    </div>
  );
}
