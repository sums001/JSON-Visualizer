import { useMemo, useState } from 'react';
import * as d3 from 'd3';
import { useStore } from '../store';
import { formatNumber, TYPES } from '../lib/model';
import { typeColor } from '../lib/colors';
import { TypeDot, ViewFrame } from '../components/common';
import Icon from '../components/Icons';

const chip = (v, c) => (
  <span key={v} className="sc-chip mono" title={`${v} (${c}×)`}>{v.length > 18 ? v.slice(0, 17) + '…' : v || '(empty)'}{c > 1 && <i>×{c}</i>}</span>
);

// Only the values themselves: a range for numbers and dates, the most common values otherwise.
// Counts, distributions and the full value list live in the sidebar's field profile.
function stats(s) {
  const t = s.mainType;
  if (t === 'number' && s.nums.length) {
    const [lo, hi] = d3.extent(s.nums);
    return <span className="sc-range mono">{lo === hi ? formatNumber(lo) : `${formatNumber(lo)} → ${formatNumber(hi)}`}</span>;
  }
  if (t === 'string') {
    if (s.dates >= s.count * 0.8) {
      const ds = s.nodes.filter((n) => n.type === 'string').map((n) => Date.parse(n.v)).filter(Number.isFinite);
      const [lo, hi] = d3.extent(ds);
      const f = (x) => new Date(x).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
      return <span className="sc-range mono">{f(lo)} → {f(hi)}</span>;
    }
    const top = [...s.distinct.entries()].filter(([v]) => !(v === 'null' && s.types.null)).sort((a, b) => b[1] - a[1]).slice(0, 4);
    return top.map(([v, c]) => chip(v, c));
  }
  if (t === 'boolean') return ['true', 'false'].filter((v) => s.distinct.get(v)).map((v) => chip(v, s.distinct.get(v)));
  return null;
}

export default function SchemaView() {
  const schema = useStore((s) => s.schema);
  const model = useStore((s) => s.model);
  const selectedId = useStore((s) => s.selectedId);
  const select = useStore((s) => s.select);
  const root = schema.get('$');
  const [open, setOpen] = useState(() => {
    const o = new Set();
    for (const s of schema.values()) if (s.depth < 4) o.add(s.gpath);
    return o;
  });
  const selG = model.nodes[selectedId]?.gpath;

  const summary = useMemo(() => {
    const all = [...schema.values()];
    return {
      paths: all.length,
      mixed: all.filter((s) => s.mixed).length,
      optional: all.filter((s) => s.presence < 1).length,
      nullable: all.filter((s) => s.nullable).length,
    };
  }, [schema]);

  const rows = [];
  const walk = (s, guides) => {
    rows.push({ s, guides });
    if (open.has(s.gpath)) s.children.forEach((c, i) => walk(c, [...guides, i === s.children.length - 1]));
  };
  walk(root, []);

  const toggle = (g) =>
    setOpen((o) => {
      const n = new Set(o);
      n.has(g) ? n.delete(g) : n.add(g);
      return n;
    });

  return (
    <ViewFrame
      title="Schema"
      subtitle="Array items merged into one shape · presence, types and value profiles per field"
      tools={
        <>
          <button className="btn" onClick={() => setOpen(new Set([...schema.keys()]))}><Icon name="unfoldMore" size={16} />Expand all</button>
          <button className="btn" onClick={() => setOpen(new Set(['$']))}><Icon name="unfoldLess" size={16} />Collapse</button>
        </>
      }
      hints={[['Click', 'Select first instance'], ['›', 'Expand field']]}
      status={`${summary.paths.toLocaleString()} paths`}
    >
    <div className="schema-body">
      <div className="schema-kpis">
        <div><span>Unique paths</span><b>{summary.paths.toLocaleString()}</b></div>
        <div><span>Optional fields</span><b>{summary.optional.toLocaleString()}</b></div>
        <div><span>Mixed-type fields</span><b style={{ color: summary.mixed ? 'var(--prism-type-number)' : undefined }}>{summary.mixed.toLocaleString()}</b></div>
        <div><span>Nullable fields</span><b>{summary.nullable.toLocaleString()}</b></div>
      </div>
      <div className="schema-head">
        <span style={{ flex: 1 }}>Field</span>
        <span style={{ width: 170 }}>Types</span>
        <span style={{ width: 130 }}>Presence</span>
        <span style={{ width: 320 }}>Profile</span>
      </div>
      <div className="schema-list">
        {rows.map(({ s, guides }) => {
          const total = s.count;
          const hasKids = s.children.length > 0;
          return (
            <div key={s.gpath} className={'sc-row' + (selG === s.gpath ? ' sel' : '')} onClick={() => select(s.nodes[0].id)}>
              <span className="sc-field" style={{ flex: 1 }}>
                {guides.map((last, i) => <span key={i} className={'guide' + (i === guides.length - 1 ? (last ? ' elbow' : ' tee') : '')} />)}
                <button className={'sc-tog' + (hasKids ? '' : ' none')} onClick={(e) => { e.stopPropagation(); hasKids && toggle(s.gpath); }}>
                  {hasKids && <Icon name="chevron" size={12} style={{ transform: open.has(s.gpath) ? 'rotate(90deg)' : 'none' }} />}
                </button>
                <TypeDot type={s.mainType} />
                <span className={'sc-key mono' + (s.key === '[*]' ? ' star' : '')}>{s.key}</span>
                {s.count > 1 && <span className="sc-count mono">×{s.count.toLocaleString()}</span>}
                {s.mixed && <span className="sc-warn" title="This field has more than one non-null type">mixed</span>}
              </span>
              <span className="sc-types" style={{ width: 170 }}>
                <span className="st-bar">
                  {TYPES.filter((t) => s.types[t]).map((t) => <i key={t} style={{ flex: s.types[t] / total, background: typeColor(t) }} />)}
                </span>
                <span className="st-names">
                  {TYPES.filter((t) => s.types[t]).map((t) => <span key={t} style={{ color: typeColor(t) }}>{t}</span>)}
                </span>
              </span>
              <span className="sc-pres" style={{ width: 130 }}>
                {s.key === '[*]' || !s.parent ? (
                  <span className="muted">—</span>
                ) : (
                  <>
                    <span className="sp-bar"><i style={{ width: `${s.presence * 100}%`, opacity: s.presence < 1 ? 0.75 : 1 }} /></span>
                    <span className="mono">{(s.presence * 100).toFixed(s.presence < 1 && s.presence > 0.99 ? 1 : 0)}%</span>
                  </>
                )}
              </span>
              <span className="sc-prof" style={{ width: 320 }}>{stats(s)}</span>
            </div>
          );
        })}
      </div>
    </div>
    </ViewFrame>
  );
}
