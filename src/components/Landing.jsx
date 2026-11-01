import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { measure, parseInput } from '../lib/parse';
import { SAMPLES } from '../lib/samples';
import { buildModel, formatBytes, isContainer, label, shortValue } from '../lib/model';
import { inferSchema } from '../lib/schema';
import { typeColor } from '../lib/colors';
import { openSettings } from '../lib/embed';
import Icon from './Icons';
import CodeArea, { LINE_H, offsetOf } from './CodeArea';
import { BrandMark, Kbd, MOD, TypeDot } from './common';

const PREVIEW_SAMPLE = 'missions';

// ---------- the preview on the right: the missions sample drawn with the real view styles ----------

function MiniNode({ x, y, n, open, sel, vmax = 14 }) {
  const c = isContainer(n);
  const s = c ? 10 : 7;
  return (
    <div className="mn" style={{ left: x - 5, top: y - 10 }}>
      <span
        className={'mn-dot' + (sel ? ' sel' : '')}
        style={{ width: s, height: s, margin: c ? 0 : '0 1.5px', borderRadius: n.type === 'array' ? 3 : '50%', borderColor: typeColor(n.type), background: open ? 'var(--prism-bg-0)' : typeColor(n.type) }}
      />
      <span className={'mn-lab' + (sel ? ' sel' : '')}>
        <span className="mn-k">{n.parent?.type === 'array' ? `[${n.key}]` : label(n)}</span>
        <span className="mn-v" style={{ color: c ? 'var(--prism-text-3)' : typeColor(n.type) }}>{shortValue(n, vmax)}</span>
      </span>
    </div>
  );
}

function LandingPreview({ onOpen }) {
  const sample = SAMPLES.find((s) => s.id === PREVIEW_SAMPLE);
  const data = useMemo(() => {
    const model = buildModel(sample.build());
    const schema = inferSchema(model);
    const root = model.root;
    const list = root.children.find((c) => c.type === 'array' && c.children.length > 6) || root.children[0];
    const items = list.children.slice(0, 7);
    const sel = items[2];
    const leaves = sel.children.filter((c) => !isContainer(c)).slice(0, 6);
    const fields = (schema.get(list.gpath + '[*]')?.children || []).slice(0, 6);
    const rows = list.children.slice(0, 6);
    return { model, root, list, items, sel, leaves, fields, rows };
  }, []);
  const { root, list, items, sel, leaves, fields, rows } = data;

  // a fixed four-column layout, the same shape the Tree view draws
  const R = { x: 28, y: 156 };
  const d1 = root.children.slice(0, 6).map((n, i, a) => ({ n, x: 150, y: 156 + (i - (a.length - 1) / 2) * 36 }));
  const L = d1.find((d) => d.n === list) || d1[0];
  const d2 = items.map((n, i) => ({ n, x: 350, y: L.y + (i - 3) * 26 }));
  const S = d2[2];
  const d3 = leaves.map((n, i, a) => ({ n, x: 460, y: S.y + (i - (a.length - 1) / 2) * 26 }));
  const curve = (a, b, r = 5) => {
    const x1 = a.x + r;
    const x2 = b.x - r;
    const m = (x1 + x2) / 2;
    return `M${x1},${a.y} C${m},${a.y} ${m},${b.y} ${x2},${b.y}`;
  };
  const links = [
    ...d1.map((d) => [R, d, d.n === list]),
    ...d2.map((d) => [L, d, d === S]),
    ...d3.map((d) => [S, d, false]),
  ];

  const tabs = [['tree', 'tree', 'Tree'], ['graph', 'graph', 'Graph'], ['schema', 'schema', 'Schema'], ['table', 'table', 'Table'], ['raw', 'raw', 'Raw']];
  const recordCol = (r, key) => r.children.find((c) => c.key === key);
  const presence = (f) => Math.round(f.presence * 1000) / 10;

  return (
    <div className="ld-preview">
      <div className="pv-card pv-tree">
        <div className="pv-tabs">
          {tabs.map(([id, icon, text], i) => (
            <button key={id} className={'pv-tab' + (i === 0 ? ' on' : '')} onClick={() => onOpen(sample, id)} title={`Open the ${sample.name.toLowerCase()} sample in ${text}`}>
              <Icon name={icon} size={14} />
              {text}
            </button>
          ))}
          <span className="pv-file mono">{sample.file}</span>
        </div>
        <div className="pv-canvas">
          <svg className="pv-links">
            {links.map(([a, b, hot], i) => (
              <path key={i} d={curve(a, b)} className={hot ? 'hot' : ''} />
            ))}
          </svg>
          <MiniNode x={R.x} y={R.y} n={root} open />
          {d1.map((d) => <MiniNode key={d.n.id} {...d} open={d.n === list} />)}
          {d2.map((d) => <MiniNode key={d.n.id} {...d} open={d === S} sel={d === S} />)}
          {d3.map((d) => <MiniNode key={d.n.id} {...d} vmax={16} />)}
        </div>
      </div>

      <div className="pv-card">
        <div className="pv-head">
          <Icon name="schema" size={14} />
          Schema
          <span className="mono">{label(list)}[ ]</span>
        </div>
        <div className="pv-schema">
          {fields.map((f) => {
            const types = Object.keys(f.types);
            const p = presence(f);
            return (
              <div key={f.gpath} className="pv-field mono">
                <span className="pf-k">
                  <TypeDot type={f.mainType} size={6} />
                  {f.key}
                  <span className="muted">{types.join(' | ')}</span>
                </span>
                <span className="pf-bar"><i style={{ width: `${p}%`, background: p < 50 ? 'var(--prism-text-3)' : 'var(--prism-text-2)' }} /></span>
                <span className="pf-p">{p}%</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="pv-card">
        <div className="pv-head">
          <Icon name="table" size={14} />
          Table
          <span className="mono">{list.children.length.toLocaleString()} rows</span>
        </div>
        <div className="pv-table mono">
          <div className="pt-row head">
            <span>name</span>
            <span className="r">budget</span>
            <span className="r">crewed</span>
          </div>
          {rows.map((r, i) => {
            const b = recordCol(r, 'budgetMillions');
            const c = recordCol(r, 'crewed');
            return (
              <div key={r.id} className={'pt-row' + (i === 0 ? ' on' : '')}>
                <span>{recordCol(r, 'name')?.v}</span>
                <span className="r" style={{ color: typeColor('number') }}>{b ? b.v.toLocaleString(undefined, { minimumFractionDigits: 1 }) : ''}</span>
                <span className="r" style={{ color: typeColor('boolean') }}>{c ? String(c.v) : ''}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------- fetching ----------

function Step({ state, children }) {
  return (
    <span className={'fc-step ' + state}>
      {state === 'done' ? <Icon name="check" size={16} /> : state === 'active' ? <span className="spinner" /> : <span className="todo-dot" />}
      {children}
    </span>
  );
}

function FetchProgress({ job, onCancel }) {
  const pct = job.total ? Math.min(100, (job.received / job.total) * 100) : null;
  const order = ['connect', 'download', 'parse'];
  const at = order.indexOf(job.phase);
  const st = (i) => (i < at ? 'done' : i === at ? 'active' : 'todo');
  return (
    <div className="fetch-card">
      <div className="fc-top">
        <span className="fc-title">Fetching</span>
        <span className="mono">{job.received ? `${formatBytes(job.received)}${job.total ? ` of ${formatBytes(job.total)}` : ''}` : ''}</span>
      </div>
      <div className="progress">
        <div className={pct == null ? 'indeterminate' : ''} style={pct == null ? undefined : { width: `${pct}%` }} />
      </div>
      <span className="fc-url mono" title={job.url}>GET {job.url}</span>
      <div className="fc-steps">
        <Step state={st(0)}>{at > 0 ? `Connected · ${job.status} in ${job.ms} ms` : 'Connecting'}</Step>
        <Step state={st(1)}>Downloading</Step>
        <Step state={st(2)}>Parse and index</Step>
      </div>
      <button className="btn" onClick={onCancel}>Cancel</button>
    </div>
  );
}

// ---------- page ----------

export default function Landing() {
  const load = useStore((s) => s.load);
  const setView = useStore((s) => s.setView);
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [check, setCheck] = useState(null); // live parse result for the paste area
  const [fetchErr, setFetchErr] = useState(null);
  const [job, setJob] = useState(null);
  const fileRef = useRef(null);
  const taRef = useRef(null);

  // validate a beat after the last keystroke
  useEffect(() => {
    if (!text.trim()) return setCheck(null);
    const t = setTimeout(() => {
      const res = parseInput(text);
      setCheck(res.error ? { ...res, src: text } : { ok: true, src: text, json: res.json, note: res.note, bytes: new Blob([text]).size, ...measure(res.json) });
    }, text.length > 200000 ? 400 : 120);
    return () => clearTimeout(t);
  }, [text]);

  // paste anywhere on the page lands in the editor
  useEffect(() => {
    const onPaste = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
      const t = e.clipboardData?.getData('text');
      if (!t) return;
      e.preventDefault();
      setText(t);
      taRef.current?.focus();
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  const error = check?.error && check.src === text ? check : null;
  const canSubmit = !!text.trim() && !error;

  const submit = () => {
    if (!text.trim()) return taRef.current?.focus();
    const res = check?.ok && check.src === text ? check : parseInput(text);
    if (res.error) return setCheck({ ...res, src: text });
    load(res.json, 'pasted.json', text);
  };

  const showError = (src, res) => {
    setText(src.length < 2e6 ? src : src.slice(0, 2e6));
    setCheck({ ...res, src: src.length < 2e6 ? src : src.slice(0, 2e6) });
  };

  const openFile = async (file) => {
    if (!file) return;
    const src = await file.text();
    const res = parseInput(src);
    if (res.error) showError(src, res);
    else load(res.json, file.name, src);
  };

  const fetchUrl = async () => {
    const u = url.trim();
    if (!/^https?:\/\/\S+$/i.test(u)) return setFetchErr('Enter a valid http(s) URL');
    const ctrl = new AbortController();
    const t0 = performance.now();
    setFetchErr(null);
    setJob({ url: u, phase: 'connect', received: 0, total: 0, ctrl });
    try {
      const res = await fetch(u, { signal: ctrl.signal });
      const status = `${res.status} ${res.statusText || (res.ok ? 'OK' : '')}`.trim();
      setJob((j) => ({ ...j, phase: 'download', status, ms: Math.round(performance.now() - t0), total: Number(res.headers.get('content-length')) || 0 }));
      if (!res.ok) throw new Error(`the server answered ${status}`);
      let src;
      const reader = res.body?.getReader();
      if (reader) {
        const chunks = [];
        let received = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          received += value.length;
          setJob((j) => ({ ...j, received }));
        }
        src = await new Blob(chunks).text();
      } else src = await res.text();
      setJob((j) => ({ ...j, phase: 'parse' }));
      await new Promise((r) => setTimeout(r, 30)); // let the parse step paint before the parse blocks
      const parsed = parseInput(src);
      setJob(null);
      if (parsed.error) return showError(src, parsed);
      const name = u.split('?')[0].split('/').filter(Boolean).pop() || 'remote.json';
      load(parsed.json, name.endsWith('.json') ? name : name + '.json', src);
    } catch (e) {
      setJob(null);
      if (e.name !== 'AbortError') setFetchErr(`Could not fetch: ${e.message}. The server may block cross-origin requests.`);
    }
  };

  const goToError = () => {
    const ta = taRef.current;
    if (!ta || !error?.line) return;
    const pos = offsetOf(text, error.line, error.col);
    ta.focus();
    ta.setSelectionRange(pos, pos);
    ta.scrollTop = Math.max(0, (error.line - 1) * LINE_H - ta.clientHeight / 3);
  };

  const openSample = (s, view) => {
    load(s.build(), s.file);
    setView(view || s.view);
  };
  const sampleMeta = useMemo(
    () =>
      Object.fromEntries(
        SAMPLES.map((s) => {
          const m = measure(s.build());
          return [s.id, `${m.nodes.toLocaleString()} nodes · depth ${m.depth}`];
        }),
      ),
    [],
  );

  return (
    <div className="landing">
      <header className="ld-head">
        <div className="ld-brand">
          <BrandMark size={30} />
          JSON Prism
        </div>
        <div className="ld-head-r">
          <span className="ld-privacy"><Icon name="lock" size={15} />Runs in your browser. Nothing is uploaded.</span>
          {openSettings && (
            <button className="btn icon bordered" onClick={openSettings} title="Extension settings">
              <Icon name="settings" size={16} />
            </button>
          )}
          <button className="btn icon bordered" onClick={toggleTheme} title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
          </button>
        </div>
      </header>

      <main className="ld-main">
        <div className="ld-left">
          <div className="ld-hero">
            <h1>Explore any JSON, at any size.</h1>
            <p>Paste, open, fetch or drop a file, then move between eight linked views that share one selection.</p>
          </div>

          <div className={'ld-card' + (error ? ' error' : check?.ok ? ' valid' : '')}>
            {job ? (
              <FetchProgress job={job} onCancel={() => job.ctrl.abort()} />
            ) : (
              <div className="ld-code">
                <CodeArea
                  value={text}
                  textareaRef={taRef}
                  autoFocus
                  errorLine={error?.line}
                  placeholder={`Paste JSON here, or press ${MOD === '⌘' ? '⌘V' : 'Ctrl V'} anywhere`}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
                  }}
                />
              </div>
            )}
            {!job && check?.ok && check.src === text && (
              <div className="ld-status">
                <Icon name="checkCircle" size={16} className="ok" />
                {check.note || 'Valid JSON'}
                <span className="mono muted">· {check.nodes.toLocaleString()} nodes · depth {check.depth} · {formatBytes(check.bytes)}</span>
              </div>
            )}
            {!job && error && (
              <div className="ld-status error">
                <Icon name="alert" size={16} className="bad" />
                <span className="ls-msg">{error.error}</span>
                {error.line && <button className="ls-loc mono" onClick={goToError} title="Jump to the error">Ln {error.line}, Col {error.col}</button>}
              </div>
            )}
            <div className="ld-actions">
              <button className="btn lg" onClick={() => fileRef.current.click()}><Icon name="folder" size={16} />Open file</button>
              <input ref={fileRef} type="file" accept=".json,.jsonl,.ndjson,.geojson,.txt,application/json" hidden onChange={(e) => openFile(e.target.files[0])} />
              <div className={'url-field' + (fetchErr ? ' invalid' : '')}>
                <Icon name="link" size={15} />
                <input
                  className="mono"
                  placeholder="https://api.example.com/data.json"
                  value={url}
                  onChange={(e) => { setUrl(e.target.value); setFetchErr(null); }}
                  onKeyDown={(e) => e.key === 'Enter' && fetchUrl()}
                />
                <button onClick={fetchUrl} disabled={!!job}>Fetch</button>
              </div>
              <button className="btn lg primary" onClick={submit} disabled={!canSubmit}>
                Visualize
                <Kbd>{MOD} ↵</Kbd>
              </button>
            </div>
          </div>
          {fetchErr && <div className="ld-fetch-err">{fetchErr}</div>}

          <div className="ld-samples">
            <div className="ld-samples-head">
              <span>Try a sample</span>
              <span className="ld-drop"><Icon name="download" size={14} />Or drop a .json file anywhere</span>
            </div>
            <div className="ld-sample-grid">
              {SAMPLES.map((s) => (
                <button key={s.id} className="ld-sample" onClick={() => openSample(s)}>
                  <span className="n">{s.name}</span>
                  <span className="d">{s.blurb}</span>
                  <span className="m mono">{sampleMeta[s.id]}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <LandingPreview onOpen={openSample} />
      </main>
    </div>
  );
}
