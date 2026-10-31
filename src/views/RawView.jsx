import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { isContainer } from '../lib/model';
import { useSize } from '../lib/hooks';
import { Seg, ViewFrame } from '../components/common';
import Icon from '../components/Icons';

const LH = 20;
const INDENT = 2;

function initialCollapsed(model) {
  const set = new Set();
  if (model.nodes.length < 4000) return set;
  for (const n of model.nodes) if (isContainer(n) && n.depth >= 2) set.add(n.id);
  return set;
}

function buildLines(root, collapsed) {
  const lines = [];
  const walk = (n, comma) => {
    if (isContainer(n) && n.children.length) {
      if (collapsed.has(n.id)) {
        lines.push({ n, kind: 'collapsed', comma });
        return;
      }
      lines.push({ n, kind: 'open' });
      n.children.forEach((c, i) => walk(c, i < n.children.length - 1));
      lines.push({ n, kind: 'close', comma });
    } else lines.push({ n, kind: 'leaf', comma });
  };
  walk(root, false);
  return lines;
}

function KeyPart({ n }) {
  if (!n.parent || n.parent.type === 'array') return null;
  return (
    <>
      <span className="j-key">{JSON.stringify(n.key)}</span>
      <span className="j-punc">: </span>
    </>
  );
}

function valueSpan(n) {
  switch (n.type) {
    case 'string':
      return <span className="j-str">{JSON.stringify(n.v.length > 400 ? n.v.slice(0, 400) + '…' : n.v)}</span>;
    case 'number':
      return <span className="j-num">{String(n.v)}</span>;
    case 'boolean':
      return <span className="j-bool">{String(n.v)}</span>;
    case 'null':
      return <span className="j-null">null</span>;
    case 'object':
      return <span className="j-punc">{'{}'}</span>;
    default:
      return <span className="j-punc">[]</span>;
  }
}

export default function RawView() {
  const model = useStore((s) => s.model);
  const selectedId = useStore((s) => s.selectedId);
  const revealTick = useStore((s) => s.revealTick);
  const matchSet = useStore((s) => s.matchSet);
  const select = useStore((s) => s.select);
  const [collapsed, setCollapsed] = useState(() => initialCollapsed(model));
  const [foldLevel, setFoldLevel] = useState(() => (model.nodes.length < 4000 ? 'none' : '2'));
  const [scrollTop, setScrollTop] = useState(0);
  const [sizeRef, size] = useSize();
  const scrollRef = useRef(null);

  const lines = useMemo(() => buildLines(model.root, collapsed), [model, collapsed]);
  const lineOf = useMemo(() => {
    const m = new Map();
    lines.forEach((l, i) => {
      if (l.kind !== 'close' && !m.has(l.n.id)) m.set(l.n.id, i);
    });
    return m;
  }, [lines]);

  // selected range (open..close) for the gutter highlight
  const range = useMemo(() => {
    const start = lineOf.get(selectedId);
    if (start == null) return null;
    if (lines[start].kind !== 'open') return [start, start];
    let i = start + 1;
    while (i < lines.length && !(lines[i].kind === 'close' && lines[i].n.id === selectedId)) i++;
    return [start, i];
  }, [lineOf, lines, selectedId]);

  // reveal externally selected nodes
  useEffect(() => {
    const n = model.nodes[selectedId];
    if (!n) return;
    let p = n.parent;
    let changed = false;
    const next = new Set(collapsed);
    while (p) {
      if (next.delete(p.id)) changed = true;
      p = p.parent;
    }
    if (changed) setCollapsed(next);
  }, [revealTick]);

  useEffect(() => {
    const i = lineOf.get(selectedId);
    const el = scrollRef.current;
    if (i == null || !el) return;
    const y = i * LH;
    if (y < el.scrollTop + 20 || y > el.scrollTop + el.clientHeight - 60) el.scrollTo({ top: y - el.clientHeight / 3, behavior: 'smooth' });
  }, [selectedId, lineOf]);

  const toggle = (id) => {
    setFoldLevel(null);
    setCollapsed((c) => {
      const n = new Set(c);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const collapseDepth = (d) => {
    const s = new Set();
    for (const n of model.nodes) if (isContainer(n) && n.depth >= d) s.add(n.id);
    setCollapsed(s);
  };

  const viewH = size.height;
  const start = Math.max(0, Math.floor(scrollTop / LH) - 10);
  const end = Math.min(lines.length, start + Math.ceil(viewH / LH) + 20);
  const gutterW = String(lines.length).length * 8 + 44;

  return (
    <ViewFrame
      title="Raw"
      subtitle={`${lines.length.toLocaleString()} lines · synced with the selection`}
      tools={
        <Seg
          label="Fold from depth"
          value={foldLevel}
          options={[['none', 'None'], ['1', '1'], ['2', '2'], ['3', '3']]}
          onChange={(v) => {
            setFoldLevel(v);
            if (v === 'none') setCollapsed(new Set());
            else collapseDepth(+v);
          }}
        />
      }
      hints={[['Click', 'Select'], ['›', 'Fold or unfold']]}
      status={range ? `Ln ${(range[0] + 1).toLocaleString()}${range[1] > range[0] ? `–${(range[1] + 1).toLocaleString()}` : ''}` : ''}
      bodyRef={sizeRef}
    >
      <div className="raw-wrap mono" ref={scrollRef} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
        <div style={{ height: lines.length * LH + 40, position: 'relative' }}>
          {lines.slice(start, end).map((l, k) => {
            const i = start + k;
            const n = l.n;
            const depth = l.kind === 'close' ? n.depth : n.depth;
            const inRange = range && i >= range[0] && i <= range[1];
            const isSel = n.id === selectedId && l.kind !== 'close';
            return (
              <div
                key={i}
                className={'raw-line' + (inRange ? ' in-range' : '') + (isSel ? ' sel' : '') + (matchSet?.has(n.id) && l.kind !== 'close' ? ' match' : '')}
                style={{ top: i * LH, height: LH }}
                onClick={() => select(n.id, { reveal: false })}
              >
                <span className="ln" style={{ width: gutterW }}>
                  {i + 1}
                  {(l.kind === 'open' || l.kind === 'collapsed') && (
                    <button className="fold" onClick={(e) => { e.stopPropagation(); toggle(n.id); }}>
                      <Icon name="chevron" size={11} style={{ transform: l.kind === 'open' ? 'rotate(90deg)' : 'none' }} />
                    </button>
                  )}
                </span>
                <span className="code" style={{ paddingLeft: depth * INDENT * 8.2 + 10 }}>
                  {Array.from({ length: depth }, (_, g) => (
                    <i key={g} className="iguide" style={{ left: g * INDENT * 8.2 + 14 }} />
                  ))}
                  {l.kind === 'close' ? (
                    <span className="j-punc">{n.type === 'array' ? ']' : '}'}</span>
                  ) : (
                    <>
                      <KeyPart n={n} />
                      {l.kind === 'open' && <span className="j-punc">{n.type === 'array' ? '[' : '{'}</span>}
                      {l.kind === 'collapsed' && (
                        <>
                          <span className="j-punc">{n.type === 'array' ? '[' : '{'}</span>
                          <span className="j-fold" onClick={(e) => { e.stopPropagation(); toggle(n.id); }}>
                            {n.children.length} {n.type === 'array' ? 'items' : 'keys'}
                          </span>
                          <span className="j-punc">{n.type === 'array' ? ']' : '}'}</span>
                        </>
                      )}
                      {l.kind === 'leaf' && valueSpan(n)}
                    </>
                  )}
                  {l.comma && <span className="j-punc">,</span>}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </ViewFrame>
  );
}
