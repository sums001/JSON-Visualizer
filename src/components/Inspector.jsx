import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { ancestors, formatBytes, formatNumber, isColor, isContainer, isImageUrl, isIsoDate, isUrl, label, shortValue } from '../lib/model';
import { typeColor, typeSoft } from '../lib/colors';
import Icon from './Icons';
import { TypeBadge, TypeDot } from './common';
import FieldProfile from './FieldProfile';
import { saveJson } from '../lib/file';

// A branch is named after its key; array items borrow their list's name (or the document's), e.g. "markets-3.json".
const fileName = (n, doc) => (typeof n.key === 'number' ? `${n.parent.parent ? fileName(n.parent, doc) : doc}-${n.key}` : String(n.key));

const PREVIEW_KEYS = 40;
const KIDS = 100;

function relTime(d) {
  const diff = (d.getTime() - Date.now()) / 1000;
  const units = [['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [u, s] of units) if (Math.abs(diff) >= s) return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(Math.round(diff / s), u);
  return 'just now';
}

// "−17d 2h" / "+3h 12m"
function relShort(d) {
  const ms = d.getTime() - Date.now();
  const hours = Math.abs(ms) / 3.6e6;
  const sign = ms < 0 ? '−' : '+';
  const days = Math.floor(hours / 24);
  return days ? `${sign}${days.toLocaleString()}d ${Math.floor(hours % 24)}h` : `${sign}${Math.floor(hours)}h ${Math.floor((hours * 60) % 60)}m`;
}

function Details({ rows }) {
  return (
    <div className="details">
      {rows.map(([k, v]) => (
        <div key={k}>
          <span>{k}</span>
          <span className="mono">{v}</span>
        </div>
      ))}
    </div>
  );
}

function Stats({ items }) {
  return (
    <div className="stats">
      {items.map(([k, v]) => (
        <div key={k}>
          <span>{k}</span>
          <b className="mono">{v}</b>
        </div>
      ))}
    </div>
  );
}

function StringValue({ node }) {
  const [imgOk, setImgOk] = useState(true);
  const v = node.v;
  if (isIsoDate(v)) {
    const date = new Date(v);
    const hasTime = v.length > 10;
    return (
      <>
        <div className="vcard">
          <div className="vc-raw mono" style={{ color: typeColor('string') }}>{JSON.stringify(v)}</div>
          <div className="vc-body">
            <div className="vc-note"><Icon name="calendar" size={14} />Parsed as ISO 8601 date</div>
            <div className="vc-date">{date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: hasTime ? undefined : 'UTC' })}</div>
            <div className="vc-time">
              {hasTime && <span className="mono">{date.toISOString().slice(11, 19)} UTC</span>}
              <span className="pill">{relTime(date)}</span>
            </div>
          </div>
        </div>
        <Details rows={[['Local', date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })], ['Unix', Math.floor(date.getTime() / 1000)], ['Relative', relShort(date)]]} />
      </>
    );
  }
  return (
    <div className="vcard">
      {isColor(v) && <div className="vc-swatch" style={{ background: v }} />}
      {isImageUrl(v) && imgOk && (
        <div className="vc-img">
          <img src={v} alt="" onError={() => setImgOk(false)} />
        </div>
      )}
      <div className="vc-raw mono long" style={{ color: typeColor('string') }}>
        {isUrl(v) ? (
          <a href={v} target="_blank" rel="noreferrer">{v}</a>
        ) : (
          v || <span className="muted">(empty string)</span>
        )}
      </div>
    </div>
  );
}

function NumberValue({ node }) {
  const v = node.v;
  const rows = [['Raw', String(v)], ['Scientific', v.toExponential()]];
  if (!Number.isInteger(v)) rows.push(['Integer part', Math.trunc(v).toLocaleString()]);
  if (v > 1e9 && v < 1e13) rows.push(['As timestamp', new Date(v > 1e11 ? v : v * 1000).toISOString().replace('.000', '')]);
  return (
    <>
      <div className="vcard pad">
        <span className="vc-big mono" style={{ color: typeColor('number') }}>{v.toLocaleString(undefined, { maximumFractionDigits: 10 })}</span>
        {Math.abs(v) >= 1e4 && (
          <div className="vc-abbr">
            <span className="mono">{formatNumber(v)}</span>
            <span>abbreviated</span>
          </div>
        )}
      </div>
      <Details rows={rows} />
    </>
  );
}

function Composition({ node }) {
  // every descendant, not just direct children, so the mix of a whole branch shows
  const counts = useMemo(() => {
    const c = {};
    const walk = (n) => {
      for (const k of n.children) {
        c[k.type] = (c[k.type] || 0) + 1;
        if (k.children) walk(k);
      }
    };
    walk(node);
    return c;
  }, [node]);
  const list = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  return (
    <section className="isec">
      <div className="isec-head">
        <span>Type composition</span>
        <span>{(node.count - 1).toLocaleString()} descendants</span>
      </div>
      <div className="comp-bar">
        {list.map((t) => <span key={t} style={{ flex: counts[t], background: typeColor(t) }} title={`${t}: ${counts[t].toLocaleString()}`} />)}
      </div>
      <div className="comp-legend">
        {list.map((t) => (
          <span key={t}>
            <TypeDot type={t} />
            {t}
            <b>{counts[t].toLocaleString()}</b>
          </span>
        ))}
      </div>
    </section>
  );
}

// One level of the value, with nested containers folded to "[ … 3 ]".
function Preview({ node }) {
  const kids = node.children.slice(0, PREVIEW_KEYS);
  const [open, close] = node.type === 'array' ? ['[', ']'] : ['{', '}'];
  const value = (c) => {
    if (isContainer(c)) {
      const cls = c.type === 'array' ? 'j-arr' : 'j-obj';
      return <span className={cls}>{c.type === 'array' ? `[ … ${c.children.length} ]` : `{ … ${c.children.length} }`}</span>;
    }
    if (c.type === 'string') return <span className="j-str">{JSON.stringify(c.v.length > 60 ? c.v.slice(0, 59) + '…' : c.v)}</span>;
    if (c.type === 'number') return <span className="j-num">{String(c.v)}</span>;
    if (c.type === 'boolean') return <span className="j-bool">{String(c.v)}</span>;
    return <span className="j-null">null</span>;
  };
  return (
    <pre className="json-prev mono">
      <div><span className="j-punc">{node.children.length ? open : open + close}</span></div>
      {kids.map((c, i) => (
        <div key={c.id}>
          {'  '}
          {node.type === 'object' && (
            <>
              <span className="j-key">{JSON.stringify(c.key)}</span>
              <span className="j-punc">: </span>
            </>
          )}
          {value(c)}
          {i < node.children.length - 1 && <span className="j-punc">,</span>}
        </div>
      ))}
      {node.children.length > kids.length && <div className="j-punc">{`  … ${(node.children.length - kids.length).toLocaleString()} more`}</div>}
      {node.children.length > 0 && <div><span className="j-punc">{close}</span></div>}
    </pre>
  );
}

export default function Inspector() {
  const model = useStore((s) => s.model);
  const selectedId = useStore((s) => s.selectedId);
  const select = useStore((s) => s.select);
  const setView = useStore((s) => s.setView);
  const setRecordPath = useStore((s) => s.setRecordPath);
  const recordSets = useStore((s) => s.recordSets);
  const docName = useStore((s) => s.name);
  const view = useStore((s) => s.view);
  const schema = useStore((s) => s.schema);
  const [copied, setCopied] = useState(null);
  const [bySize, setBySize] = useState(true);
  const node = model.nodes[selectedId] || model.root;
  const container = isContainer(node);
  // in Schema the selection stands for a whole field, so profile every instance of its path
  const field = view === 'schema' ? schema?.get(node.gpath) : null;

  const kids = useMemo(() => {
    if (!container) return [];
    return (bySize ? [...node.children].sort((a, b) => b.size - a.size) : node.children).slice(0, KIDS);
  }, [node, bySize]);
  const maxKid = Math.max(1, ...kids.map((c) => c.size));

  const copy = (what, text) => {
    navigator.clipboard?.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied(null), 1200);
  };

  // deep paths keep the root and the last three steps, with the middle folded into "…"
  const chain = ancestors(node);
  const crumbs = chain.length > 5 ? [chain[0], null, ...chain.slice(-3)] : chain;
  const crumbLabel = (c) => (!c.parent ? 'root' : typeof c.key === 'number' ? `[${c.key}]` : c.key);

  const elementPath = node.type === 'array' ? node.gpath + '[*]' : null;
  const tableSet = elementPath && recordSets.find((r) => r.gpath === elementPath);
  const share = node.parent ? node.size / model.root.size : 1;
  const pct = share >= 0.0001 ? `${(share * 100).toFixed(share < 0.01 ? 2 : 1)}%` : '<0.01%';
  const meta = container
    ? `${node.children.length.toLocaleString()} ${node.type === 'array' ? (node.children.length === 1 ? 'item' : 'items') : node.children.length === 1 ? 'key' : 'keys'}`
    : node.type === 'string'
      ? `${node.v.length.toLocaleString()} chars`
      : node.type === 'number'
        ? (Number.isInteger(node.v) ? 'integer' : 'float')
        : '';
  const path = node.path.length > 38 ? '…' + node.path.slice(-37) : node.path;

  return (
    <aside className="inspector">
      <div className="insp-head">
        <div className="ih-top">
          <span className="ih-label">Inspector</span>
          <span className="ih-path mono" title={node.path}>{path}</span>
        </div>
        <nav className="crumbs mono">
          {crumbs.map((c, i) => (
            <span key={c ? c.id : 'gap'}>
              {i > 0 && <Icon name="chevron" size={12} />}
              {c ? (
                <button className={c.id === node.id ? 'on' : ''} onClick={() => select(c.id)}>{crumbLabel(c)}</button>
              ) : (
                <span className="gap" title={chain.slice(1, -3).map(crumbLabel).join(' › ')}>…</span>
              )}
            </span>
          ))}
        </nav>
        <div className="ih-title">
          <span className="ih-key mono" title={label(node)}>{label(node)}</span>
          <TypeBadge type={node.type} />
          <span className="ih-meta">{meta}</span>
        </div>
        <div className="ih-actions">
          <button className="btn" onClick={() => copy('path', node.path)}><Icon name="route" size={15} />{copied === 'path' ? 'Copied' : 'Copy path'}</button>
          <button className="btn" onClick={() => copy('value', container ? JSON.stringify(node.v, null, 2) : String(node.v))}><Icon name="copy" size={15} />{copied === 'value' ? 'Copied' : 'Copy value'}</button>
          {container && node.parent && (
            <button className="btn" onClick={() => saveJson(fileName(node, docName.replace(/\.[^.]+$/, '')), node.v)} title="Save this branch as a .json file"><Icon name="download" size={15} />Download</button>
          )}
          {tableSet && (
            <button className="btn" onClick={() => { setRecordPath(tableSet.gpath); setView('table'); }}><Icon name="table" size={15} />Open as table</button>
          )}
        </div>
      </div>

      <div className="insp-scroll">
        {field && (
          <>
            <FieldProfile s={field} onSelect={select} />
            <div className="isec-head fp-divider"><span>Selected instance</span><span className="mono">{node.path.length > 30 ? '…' + node.path.slice(-29) : node.path}</span></div>
          </>
        )}
        {node.type === 'string' && <StringValue node={node} />}
        {node.type === 'number' && <NumberValue node={node} />}
        {(node.type === 'boolean' || node.type === 'null') && (
          <div className="vcard pad">
            <span className="vc-big mono" style={{ color: typeColor(node.type), fontStyle: node.type === 'null' ? 'italic' : 'normal' }}>{String(node.v)}</span>
          </div>
        )}

        <Stats
          items={
            container
              ? [[node.type === 'array' ? 'Items' : 'Keys', node.children.length.toLocaleString()], ['Descendants', (node.count - 1).toLocaleString()], ['Size', formatBytes(node.size)], ['% of file', pct]]
              : node.type === 'string'
                ? [['Length', node.v.length.toLocaleString()], ['Size', formatBytes(node.size)]]
                : [['Size', formatBytes(node.size)], ['% of file', pct]]
          }
        />

        {container && node.children.length > 0 && (
          <>
            <Composition node={node} />

            <section className="isec">
              <div className="isec-head">
                <span>Children</span>
                <button className="link-btn" onClick={() => setBySize((b) => !b)} title="Change the order">{bySize ? 'by size' : 'in order'}</button>
              </div>
              <div className="kids">
                {kids.map((c) => (
                  <button key={c.id} className={'kid' + (c.id === selectedId ? ' on' : '')} onClick={() => select(c.id)}>
                    <span className="kid-bar" style={{ width: `${Math.max(2, (c.size / maxKid) * 100)}%`, background: typeSoft(c.type) }} />
                    <span className="kid-k"><TypeDot type={c.type} size={6} />{node.type === 'array' ? `[${c.key}]` : label(c)}</span>
                    <span className="kid-v" style={{ color: isContainer(c) ? 'var(--prism-text-3)' : typeColor(c.type) }}>{shortValue(c, 30)}</span>
                    <span className="kid-s">{formatBytes(c.size)}</span>
                  </button>
                ))}
                {node.children.length > kids.length && <div className="kids-more">+{(node.children.length - kids.length).toLocaleString()} more</div>}
              </div>
            </section>

            <section className="isec">
              <div className="isec-head">
                <span>Preview</span>
                <button className="link-btn accent" onClick={() => setView('raw')}>Open in Raw</button>
              </div>
              <Preview node={node} />
            </section>
          </>
        )}
      </div>
    </aside>
  );
}
