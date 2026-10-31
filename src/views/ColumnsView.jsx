import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { ancestors, formatBytes, isColor, isContainer, isImageUrl, isIsoDate, label, shortValue } from '../lib/model';
import { typeColor, typeSoft } from '../lib/colors';
import { TypeBadge, TypeDot, ViewFrame } from '../components/common';
import Icon from '../components/Icons';

const CAP = 800;

function Column({ node, activeId, selectedId, matchSet, onPick }) {
  const [cap, setCap] = useState(CAP);
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current?.querySelector('.mc-item.active');
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [activeId]);
  const maxSize = Math.max(1, ...node.children.slice(0, cap).map((c) => c.size));
  return (
    <div className="mcol">
      <div className="mc-head">
        <TypeDot type={node.type} />
        <span className="mono mc-title">{node.parent?.type === 'array' ? `[${node.key}]` : label(node)}</span>
        <span className="mc-count mono">{node.type === 'array' ? `[${node.children.length}]` : `{${node.children.length}}`}</span>
      </div>
      <div className="mc-list" ref={ref}>
        {node.children.slice(0, cap).map((c) => (
          <button
            key={c.id}
            className={'mc-item' + (c.id === activeId ? ' active' : '') + (c.id === selectedId ? ' sel' : '') + (matchSet?.has(c.id) ? ' match' : '')}
            onClick={() => onPick(c)}
          >
            <span className="mc-size" style={{ width: `${Math.max(2, (c.size / maxSize) * 100)}%`, background: typeSoft(c.type) }} />
            <TypeDot type={c.type} size={6} />
            <span className="mc-k mono">{node.type === 'array' ? `[${c.key}]` : label(c)}</span>
            <span className="mc-v mono" style={{ color: isContainer(c) ? 'var(--prism-text-3)' : typeColor(c.type) }}>{shortValue(c, 24)}</span>
            {isContainer(c) && <Icon name="chevron" size={12} className="mc-chev" />}
          </button>
        ))}
        {node.children.length > cap && (
          <button className="mc-more" onClick={() => setCap((c) => c + CAP)}>Show {Math.min(CAP, node.children.length - cap).toLocaleString()} more of {(node.children.length - cap).toLocaleString()}</button>
        )}
      </div>
    </div>
  );
}

function LeafPanel({ node }) {
  const v = node.v;
  return (
    <div className="mcol leaf-panel">
      <div className="mc-head">
        <span className="mono mc-title">{label(node)}</span>
        <TypeBadge type={node.type} />
      </div>
      <div className="lp-body">
        {node.type === 'string' && isColor(v) && <div className="swatch big" style={{ background: v }} />}
        {node.type === 'string' && isImageUrl(v) && <img className="lp-img" src={v} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />}
        <div className="lp-val mono" style={{ color: typeColor(node.type) }}>{node.type === 'string' ? v : String(v)}</div>
        {node.type === 'string' && isIsoDate(v) && <div className="lp-meta">{new Date(v).toUTCString()}</div>}
        <div className="lp-meta mono">{formatBytes(node.size)} · {node.path}</div>
      </div>
    </div>
  );
}

export default function ColumnsView() {
  const model = useStore((s) => s.model);
  const selectedId = useStore((s) => s.selectedId);
  const matchSet = useStore((s) => s.matchSet);
  const select = useStore((s) => s.select);
  const scrollRef = useRef(null);
  const sel = model.nodes[selectedId] || model.root;
  const chain = ancestors(sel);
  const columns = chain.filter(isContainer);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' });
  }, [selectedId]);

  return (
    <ViewFrame
      title="Columns"
      subtitle="Drill down one level per column · bars show relative size"
      hints={[['Click', 'Drill in'], ['←↑↓→', 'Navigate']]}
      status={sel.path.length > 60 ? '…' + sel.path.slice(-59) : sel.path}
    >
      <div className="miller" ref={scrollRef}>
        {columns.map((c) => {
          const activeIdx = chain.indexOf(c) + 1;
          const active = chain[activeIdx];
          return <Column key={c.id} node={c} activeId={active?.id} selectedId={selectedId} matchSet={matchSet} onPick={(n) => select(n.id, { reveal: false })} />;
        })}
        {!isContainer(sel) && <LeafPanel node={sel} />}
        <div style={{ flex: '0 0 24px' }} />
      </div>
    </ViewFrame>
  );
}
