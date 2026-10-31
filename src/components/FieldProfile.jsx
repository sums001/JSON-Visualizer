import { useMemo, useState } from 'react';
import * as d3 from 'd3';
import { formatNumber, isContainer, TYPES } from '../lib/model';
import { typeColor, typeSoft } from '../lib/colors';
import { TypeDot } from './common';
import Icon from './Icons';

const TOP = 12; // a number field with at most this many distinct values reads as categories
const ALL = 200; // value lists up to this long render in full; longer ones start folded
const FOLDED = 50;

const fmt = (v) => (Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 4 }));
const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(a === b || !a ? 0 : 1)}%` : '—');
const day = (x) => new Date(x).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

// Everything is computed from the field's sampled instances (schema keeps up to 20k per path).
function compute(s) {
  const nodes = s.nodes;
  const scalars = nodes.filter((n) => !isContainer(n) && n.type !== 'null');
  const counts = new Map();
  for (const n of scalars) {
    const k = String(n.v);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const top = [...counts].sort((a, b) => b[1] - a[1]);
  const nums = nodes.filter((n) => n.type === 'number').map((n) => n.v).sort(d3.ascending);
  const strs = nodes.filter((n) => n.type === 'string').map((n) => n.v);
  const dates = strs.map((v) => Date.parse(v)).filter(Number.isFinite);
  const lens = nodes.filter((n) => n.type === 'array').map((n) => n.children.length);
  const keys = nodes.filter((n) => n.type === 'object').map((n) => n.children.length);
  return {
    sampled: s.count > nodes.length,
    scalars: scalars.length,
    top,
    unique: top.filter(([, c]) => c === 1).length,
    nums,
    strs,
    dates: s.dates >= s.count * 0.8 ? dates.sort(d3.ascending) : null,
    lens,
    keys,
  };
}

function Histogram({ values, color = typeColor('number') }) {
  const [lo, hi] = d3.extent(values);
  if (values.length < 2 || lo === hi) return null;
  const bins = d3.bin().domain([lo, hi]).thresholds(24)(values);
  const max = d3.max(bins, (b) => b.length);
  const w = 280 / bins.length;
  return (
    <div className="fp-hist">
      <svg viewBox="0 0 280 56" preserveAspectRatio="none">
        {bins.map((b, i) => {
          const h = b.length ? Math.max(1.5, (b.length / max) * 56) : 0;
          return (
            <rect key={i} x={i * w + 0.75} y={56 - h} width={w - 1.5} height={h} fill={color}>
              <title>{`${fmt(b.x0)} – ${fmt(b.x1)}: ${b.length.toLocaleString()}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="fp-axis mono"><span>{formatNumber(lo)}</span><span>{formatNumber(hi)}</span></div>
    </div>
  );
}

function Rows({ rows }) {
  return (
    <div className="details fp-details">
      {rows.filter(Boolean).map(([k, v]) => (
        <div key={k}>
          <span>{k}</span>
          <span className="mono">{v}</span>
        </div>
      ))}
    </div>
  );
}

function Section({ title, note, children }) {
  return (
    <section className="isec">
      <div className="isec-head">
        <span>{title}</span>
        {note && <span>{note}</span>}
      </div>
      {children}
    </section>
  );
}

function TopValues({ top, total, type }) {
  const [all, setAll] = useState(top.length <= ALL);
  const shown = all ? top : top.slice(0, FOLDED);
  const max = shown[0]?.[1] || 1;
  return (
    <div className="kids">
      {shown.map(([v, c]) => (
        <div key={v} className="kid val" title={`${v} — ${c.toLocaleString()} (${pct(c, total)})`}>
          <span className="kid-bar" style={{ width: `${Math.max(2, (c / max) * 100)}%`, background: typeSoft(type) }} />
          <span className="kid-v" style={{ color: typeColor(type) }}>{v === '' ? <span className="muted">(empty)</span> : v}</span>
          <span className="kid-s">{c.toLocaleString()} · {pct(c, total)}</span>
        </div>
      ))}
      {top.length > shown.length && (
        <button className="link-btn accent kids-more" onClick={() => setAll(true)}>Show all {top.length.toLocaleString()} values</button>
      )}
    </div>
  );
}

export default function FieldProfile({ s, onSelect }) {
  const p = useMemo(() => compute(s), [s]);
  const t = s.mainType;
  const nulls = s.types.null || 0;
  const types = TYPES.filter((x) => s.types[x]);
  const distinct = p.top.length;
  const categorical = distinct > 0 && (t === 'string' || t === 'boolean' || (t === 'number' && distinct <= TOP && p.scalars > distinct * 2));
  const fields = s.children;
  const [copied, setCopied] = useState(null);
  const copy = (what) => {
    const text = what === 'counts' ? p.top.map(([v, c]) => `${v}\t${c}`).join('\n') : p.top.map(([v]) => v).join('\n');
    navigator.clipboard?.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied(null), 1200);
  };

  return (
    <>
      <Section title="Field profile" note={p.sampled ? `sampled ${s.nodes.length.toLocaleString()}` : `${s.count.toLocaleString()} instances`}>
        <div className="fp-path mono" title={s.gpath}>{s.gpath}</div>
        <div className="stats">
          <div><span>Occurrences</span><b className="mono">{s.count.toLocaleString()}</b></div>
          <div><span>Presence</span><b className="mono">{s.key === '[*]' || !s.parent ? '—' : pct(s.presence, 1)}</b></div>
          {isContainer({ type: t }) ? (
            <div><span>{t === 'array' ? 'Avg items' : 'Avg keys'}</span><b className="mono">{fmt(d3.mean(t === 'array' ? p.lens : p.keys) || 0)}</b></div>
          ) : (
            <div><span>Distinct</span><b className="mono">{distinct.toLocaleString()}</b></div>
          )}
          <div><span>Nulls</span><b className="mono">{nulls ? `${nulls.toLocaleString()} · ${pct(nulls, s.count)}` : '0'}</b></div>
        </div>
        {distinct > 0 && (
          <div className="fp-actions">
            <button className="btn" onClick={() => copy('values')} title="Every distinct value, one per line">
              <Icon name="copy" size={15} />{copied === 'values' ? 'Copied' : `Copy ${distinct.toLocaleString()} ${categorical ? 'categories' : 'unique values'}`}
            </button>
            <button className="btn" onClick={() => copy('counts')} title="Value and count, tab-separated">
              <Icon name="copy" size={15} />{copied === 'counts' ? 'Copied' : 'With counts'}
            </button>
          </div>
        )}
      </Section>

      <Section title="Types" note={s.mixed ? 'mixed' : null}>
        <div className="comp-bar">
          {types.map((x) => <span key={x} style={{ flex: s.types[x], background: typeColor(x) }} title={`${x}: ${s.types[x].toLocaleString()}`} />)}
        </div>
        <div className="comp-legend">
          {types.map((x) => (
            <span key={x}><TypeDot type={x} />{x}<b>{pct(s.types[x], s.count)}</b></span>
          ))}
        </div>
      </Section>

      {p.nums.length > 0 && (
        <Section title="Distribution" note={`${p.nums.length.toLocaleString()} numbers`}>
          <Histogram values={p.nums} />
          <Rows
            rows={[
              ['Min', fmt(p.nums[0])],
              ['25th percentile', fmt(d3.quantileSorted(p.nums, 0.25))],
              ['Median', fmt(d3.quantileSorted(p.nums, 0.5))],
              ['75th percentile', fmt(d3.quantileSorted(p.nums, 0.75))],
              ['Max', fmt(p.nums[p.nums.length - 1])],
              ['Mean', fmt(d3.mean(p.nums))],
              p.nums.length > 1 && ['Std deviation', fmt(d3.deviation(p.nums))],
              ['Sum', fmt(d3.sum(p.nums))],
              ['Integers', pct(p.nums.filter(Number.isInteger).length, p.nums.length)],
              ['Zeros', p.nums.filter((v) => v === 0).length.toLocaleString()],
              ['Negative', p.nums.filter((v) => v < 0).length.toLocaleString()],
            ]}
          />
        </Section>
      )}

      {t === 'string' && p.dates?.length > 0 && (
        <Section title="Date range" note={`${p.dates.length.toLocaleString()} dates`}>
          <Histogram values={p.dates} color={typeColor('string')} />
          <Rows
            rows={[
              ['Earliest', day(p.dates[0])],
              ['Median', day(d3.quantileSorted(p.dates, 0.5))],
              ['Latest', day(p.dates[p.dates.length - 1])],
              ['Span', `${Math.round((p.dates[p.dates.length - 1] - p.dates[0]) / 864e5).toLocaleString()} days`],
            ]}
          />
        </Section>
      )}

      {t === 'string' && !p.dates && p.strs.length > 0 && (
        <Section title="Text" note={`${p.strs.length.toLocaleString()} strings`}>
          <Rows
            rows={[
              ['Shortest', `${d3.min(p.strs, (v) => v.length).toLocaleString()} chars`],
              ['Average', `${fmt(Math.round(d3.mean(p.strs, (v) => v.length) * 10) / 10)} chars`],
              ['Longest', `${d3.max(p.strs, (v) => v.length).toLocaleString()} chars`],
              ['Empty', p.strs.filter((v) => v === '').length.toLocaleString()],
              ['Unique (seen once)', `${p.unique.toLocaleString()} · ${pct(p.unique, distinct)}`],
            ]}
          />
        </Section>
      )}

      {t === 'boolean' && (() => {
        const tr = p.top.find(([v]) => v === 'true')?.[1] || 0;
        const fa = p.top.find(([v]) => v === 'false')?.[1] || 0;
        return (
          <Section title="Split">
            <div className="comp-bar">
              <span style={{ flex: tr, background: typeColor('boolean') }} />
              <span style={{ flex: fa, background: 'var(--prism-bg-4)' }} />
            </div>
            <Rows rows={[['true', `${tr.toLocaleString()} · ${pct(tr, tr + fa)}`], ['false', `${fa.toLocaleString()} · ${pct(fa, tr + fa)}`]]} />
          </Section>
        );
      })()}

      {categorical && t !== 'boolean' && (
        <Section title={t === 'string' && distinct > ALL ? 'Values by frequency' : 'Categories'} note={`${distinct.toLocaleString()} distinct`}>
          <TopValues key={s.gpath} top={p.top} total={p.scalars} type={t} />
        </Section>
      )}

      {t === 'array' && p.lens.length > 0 && (
        <Section title="Array length">
          <Histogram values={p.lens} color={typeColor('array')} />
          <Rows
            rows={[
              ['Min items', d3.min(p.lens).toLocaleString()],
              ['Average', fmt(Math.round(d3.mean(p.lens) * 10) / 10)],
              ['Max items', d3.max(p.lens).toLocaleString()],
              ['Empty arrays', p.lens.filter((v) => v === 0).length.toLocaleString()],
            ]}
          />
        </Section>
      )}

      {fields.length > 0 && (
        <Section title={t === 'array' ? 'Items' : 'Fields'} note={`${fields.length.toLocaleString()}`}>
          <div className="kids">
            {fields.map((c) => {
              const share = c.key === '[*]' ? 1 : c.presence;
              return (
                <button key={c.gpath} className="kid" onClick={() => onSelect(c.nodes[0].id)} title={c.gpath}>
                  <span className="kid-bar" style={{ width: `${Math.max(2, share * 100)}%`, background: typeSoft(c.mainType) }} />
                  <span className="kid-k"><TypeDot type={c.mainType} size={6} />{c.key}</span>
                  <span className="kid-v" style={{ color: 'var(--prism-text-3)' }}>{TYPES.filter((x) => c.types[x]).join(' · ')}</span>
                  <span className="kid-s">{c.key === '[*]' ? `×${c.count.toLocaleString()}` : pct(c.presence, 1)}</span>
                </button>
              );
            })}
          </div>
        </Section>
      )}
    </>
  );
}
