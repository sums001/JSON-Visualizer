import { useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { formatNumber, isColor, isContainer, isUrl, toNumber } from '../lib/model';
import { profileRecords } from '../lib/schema';
import { typeColor, typeSoft } from '../lib/colors';
import { useSize } from '../lib/hooks';
import { saveFile } from '../lib/file';
import RecordPicker, { NoRecords, useRecordSet } from '../components/RecordPicker';
import { TypeDot, ViewFrame } from '../components/common';
import Icon from '../components/Icons';

const ROW_H = 28;
const HEAD_H = 32;
const IDX_W = 64;
const WIDTH = { number: 120, boolean: 88, date: 176, text: 220, nested: 96, category: 140 };

const MAX_DEPTH = 4;

// Nested objects become dotted columns (address.city); arrays and very deep objects stay as one chip cell.
function flatten(row) {
  const map = new Map();
  const walk = (n, prefix, depth) => {
    for (const c of n.children) {
      const key = prefix ? `${prefix}.${c.key}` : String(c.key);
      if (c.type === 'object' && c.children.length && depth < MAX_DEPTH) walk(c, key, depth + 1);
      else map.set(key, { ...c, key });
    }
  };
  walk(row, '', 1);
  return { node: row, map };
}

const mainType = (col) => Object.entries(col.types).sort((a, b) => b[1] - a[1])[0][0];

function sortValue(node, kind) {
  if (!node || node.type === 'null') return null;
  if (kind === 'number') return toNumber(node);
  if (kind === 'date') return Date.parse(node.v);
  if (isContainer(node)) return node.children.length;
  if (node.type === 'boolean') return node.v ? 1 : 0;
  return String(node.v).toLowerCase();
}

function Cell({ node, col, max, onOpen, match }) {
  if (!node) return <span className="c-missing">—</span>;
  if (node.type === 'null') return <span className="c-null">null</span>;
  if (isContainer(node)) {
    return (
      <button className="c-nested mono" style={{ color: typeColor(node.type), background: typeSoft(node.type) }} onClick={(e) => { e.stopPropagation(); onOpen(node); }}>
        {node.type === 'array' ? `[${node.children.length}]` : `{${node.children.length}}`}
      </button>
    );
  }
  if (node.type === 'boolean') return <span className="c-bool">{String(node.v)}</span>;
  if (col.kind === 'number') {
    const n = toNumber(node);
    const pct = max > 0 && n > 0 ? Math.min(100, (n / max) * 100) : 0;
    return (
      <span className="c-num">
        <span className="c-bar" style={{ width: `${pct}%` }} />
        <span className="c-num-t">{n == null ? String(node.v) : formatNumber(n)}</span>
      </span>
    );
  }
  if (col.kind === 'date') {
    const d = new Date(node.v);
    return (
      <span className="c-date" title={node.v}>
        {d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
        <i>{node.v.length > 10 ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : ''}</i>
      </span>
    );
  }
  const s = String(node.v);
  return (
    <span className={'c-str' + (match ? ' match' : '')} title={s}>
      {isColor(s) && <i className="c-swatch" style={{ background: s }} />}
      {isUrl(s) && <Icon name="link" size={12} className="c-link" />}
      {s}
    </span>
  );
}

function toCsv(cols, rows) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.map((c) => esc(c.key)).join(',')];
  for (const r of rows) {
    lines.push(cols.map((c) => {
      const n = r.map.get(c.key);
      if (!n) return '';
      return esc(isContainer(n) ? JSON.stringify(n.v) : n.v);
    }).join(','));
  }
  return lines.join('\n');
}

export default function TableView() {
  const set = useRecordSet();
  const selectedId = useStore((s) => s.selectedId);
  const matchSet = useStore((s) => s.matchSet);
  const select = useStore((s) => s.select);
  const [sort, setSort] = useState(null);
  const [filter, setFilter] = useState('');
  const [scrollTop, setScrollTop] = useState(0);
  const [sizeRef, size] = useSize();
  const scrollRef = useRef(null);

  const flat = useMemo(() => (set ? set.rows.map(flatten) : []), [set]);
  const cols = useMemo(() => profileRecords(flat.map((f) => ({ children: [...f.map.values()] }))), [flat]);
  const maxes = useMemo(() => {
    const m = {};
    if (!set) return m;
    for (const c of cols) {
      if (c.kind !== 'number') continue;
      let max = 0;
      for (const r of flat) {
        const v = toNumber(r.map.get(c.key));
        if (v > max) max = v;
      }
      m[c.key] = max;
    }
    return m;
  }, [cols, set, flat]);

  const rows = useMemo(() => {
    if (!set) return [];
    let out = flat;
    const q = filter.trim().toLowerCase();
    if (q) out = out.filter((r) => [...r.map.values()].some((c) => !isContainer(c) && String(c.v).toLowerCase().includes(q)));
    if (sort) {
      const col = cols.find((c) => c.key === sort.key);
      const keyed = out.map((r) => [sortValue(r.map.get(sort.key), col?.kind), r]);
      keyed.sort((a, b) => {
        if (a[0] == null) return 1;
        if (b[0] == null) return -1;
        return (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0) * sort.dir;
      });
      out = keyed.map((k) => k[1]);
    }
    return out;
  }, [set, flat, filter, sort, cols]);

  if (!set) return <NoRecords />;

  const totalW = IDX_W + cols.reduce((s, c) => s + WIDTH[c.kind], 0);
  const viewH = size.height - HEAD_H;
  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - 6);
  const end = Math.min(rows.length, start + Math.ceil(viewH / ROW_H) + 12);
  const firstVisible = Math.min(rows.length, Math.floor(scrollTop / ROW_H) + 1);
  const lastVisible = Math.min(rows.length, Math.floor((scrollTop + viewH) / ROW_H));

  const clickHeader = (key) => {
    setSort((s) => (!s || s.key !== key ? { key, dir: 1 } : s.dir === 1 ? { key, dir: -1 } : null));
  };

  const download = () => saveFile('records.csv', toCsv(cols, rows), 'text/csv');

  return (
    <ViewFrame
      title="Table"
      subtitle={`${set.label.replace(/\[\*\]$/, '')} · ${rows.length === set.rows.length ? '' : `${rows.length.toLocaleString()} of `}${set.rows.length.toLocaleString()} records · ${cols.length} columns`}
      tools={
        <>
          <RecordPicker />
          <div className="field filter">
            <Icon name="filter" size={15} />
            <input placeholder="Filter rows" value={filter} onChange={(e) => setFilter(e.target.value)} />
            {filter && <button className="field-clear" onClick={() => setFilter('')} title="Clear filter"><Icon name="close" size={13} /></button>}
          </div>
          <button className="btn icon" onClick={download} title="Export CSV"><Icon name="download" size={16} /></button>
        </>
      }
      hints={[['Click row', 'Select record'], ['Click cell', 'Select value'], ['Click header', 'Sort']]}
      status={rows.length ? `Rows ${firstVisible.toLocaleString()}–${lastVisible.toLocaleString()} of ${rows.length.toLocaleString()}` : 'No rows match'}
      bodyRef={sizeRef}
    >
      <div className="table-wrap" ref={scrollRef} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
        <div style={{ width: totalW, minWidth: '100%' }}>
          <div className="t-head" style={{ width: totalW, height: HEAD_H }}>
            <div className="t-th idx" style={{ width: IDX_W }}>#</div>
            {cols.map((c) => (
              <div
                key={c.key}
                className={'t-th' + (c.kind === 'number' ? ' num' : '') + (sort?.key === c.key ? ' sorted' : '')}
                style={{ width: WIDTH[c.kind] }}
                onClick={() => clickHeader(c.key)}
                title={`${c.key} · ${c.kind} · present in ${(c.presence * 100).toFixed(0)}% of rows`}
              >
                <TypeDot type={mainType(c)} size={6} />
                <span className="th-k">{c.key}</span>
                {sort?.key === c.key && <Icon name={sort.dir === 1 ? 'arrowUp' : 'arrowDown'} size={13} className="arrow" />}
                {c.presence < 1 && <span className="pres" style={{ '--p': c.presence }} />}
              </div>
            ))}
          </div>
          <div style={{ height: rows.length * ROW_H, position: 'relative' }}>
            {rows.slice(start, end).map((f, i) => {
              const idx = start + i;
              const r = f.node;
              const selInside = selectedId === r.id || [...f.map.values()].some((c) => c.id === selectedId) || r.children.some((c) => c.id === selectedId);
              return (
                <div key={r.id} className={'t-row' + (selInside ? ' sel' : '')} style={{ top: idx * ROW_H, height: ROW_H, width: totalW }} onClick={() => select(r.id, { reveal: true })}>
                  <div className="t-td idx" style={{ width: IDX_W }} title={r.path}>{r.key}</div>
                  {cols.map((c) => {
                    const node = f.map.get(c.key);
                    return (
                      <div
                        key={c.key}
                        className={'t-td' + (node && node.id === selectedId ? ' cell-sel' : '') + (c.kind === 'number' ? ' num' : '')}
                        style={{ width: WIDTH[c.kind] }}
                        onClick={(e) => { if (node) { e.stopPropagation(); select(node.id, { reveal: true }); } }}
                      >
                        <Cell node={node} col={c} max={maxes[c.key]} match={node && matchSet?.has(node.id)} onOpen={(n) => select(n.id, { reveal: true })} />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </ViewFrame>
  );
}
