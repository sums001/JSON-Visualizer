import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { useStore, childWindow, DEFAULT_WINDOW } from '../store';
import { isContainer, label, shortValue } from '../lib/model';
import { typeColor } from '../lib/colors';
import { fitTransform, useSize, useZoom } from '../lib/hooks';
import { NodeTip, Seg, Sep, useTip, ViewFrame, ZoomControl } from '../components/common';
import Icon from '../components/Icons';

const ROW = 24;
const CHAR = 7.2; // Geist Mono at 12px
const PILL_CHAR = 6.6; // at 11px

// Pager pseudo-nodes ("▲ N earlier" / "▼ N more") stand in for children outside the window.
function buildVisible(root, expanded, windows) {
  const make = (n) => {
    const o = { node: n, id: n.id };
    if (isContainer(n) && expanded.has(n.id) && n.children.length) {
      const { start, end } = childWindow(windows, n);
      o.children = n.children.slice(start, end).map(make);
      if (start > 0) o.children.unshift({ pager: 'less', count: start, parentId: n.id, id: `less-${n.id}` });
      if (end < n.children.length) o.children.push({ pager: 'more', count: n.children.length - end, parentId: n.id, id: `more-${n.id}` });
    }
    return o;
  };
  return d3.hierarchy(make(root));
}

const nodeRadius = (n) => (isContainer(n) ? 5.5 : 4);

function labelText(d) {
  if (d.data.pager === 'less') return `▲ ${d.data.count.toLocaleString()} earlier`;
  if (d.data.pager) return `▼ ${d.data.count.toLocaleString()} more`;
  const n = d.data.node;
  return n.parent?.type === 'array' ? `[${n.key}]` : label(n);
}

function valueText(d, keysOnly) {
  const n = d.data.node;
  if (!n) return '';
  if (isContainer(n)) return n.type === 'array' ? `[${n.children.length.toLocaleString()}]` : `{${n.children.length.toLocaleString()}}`;
  return keysOnly ? '' : shortValue(n, 26);
}

const FAN = 70; // past the longest label, room for a parent's links to fan out to its children

// Distance from the root to each depth: every level clears the longest label of the level
// before it, plus FAN, so links never start their fan on top of the labels.
function depthOffsets(h, min, keysOnly) {
  const widths = [];
  h.each((d) => {
    const w = (labelText(d).length + valueText(d, keysOnly).length + 1) * CHAR + 40;
    widths[d.depth] = Math.max(widths[d.depth] || 0, Math.min(w, 340));
  });
  const offsets = [0];
  for (let i = 1; i < widths.length; i++) offsets[i] = offsets[i - 1] + Math.max(min, widths[i - 1] + FAN);
  return offsets;
}

function layoutTree(h, keysOnly) {
  const offsets = depthOffsets(h, 170, keysOnly);
  d3.tree().nodeSize([ROW, 1]).separation((a, b) => (a.parent === b.parent ? 1 : 1.35))(h);
  const pos = new Map();
  h.each((d) => pos.set(d.data.id, { x: offsets[d.depth], y: d.x }));
  return pos;
}

function layoutRadial(h, keysOnly) {
  const leaves = h.leaves().length;
  const depth = h.height || 1;
  // labels point outward, so each ring sits past the previous ring's longest label
  const radii = depthOffsets(h, Math.max(120, (leaves * 16) / (2 * Math.PI) / depth), keysOnly);
  d3.tree()
    .size([2 * Math.PI, 1])
    .separation((a, b) => (a.parent === b.parent ? 1 : 2) / Math.max(1, a.depth))(h);
  const pos = new Map();
  h.each((d) => {
    const a = d.x - Math.PI / 2;
    const r = radii[d.depth];
    pos.set(d.data.id, { x: Math.cos(a) * r, y: Math.sin(a) * r, angle: d.x, r });
  });
  pos.radii = radii;
  return pos;
}

function linkPath(mode, s, t, off = 0) {
  if (mode === 'radial') {
    return d3.linkRadial().angle((p) => p.angle).radius((p) => p.r)({ source: { ...s, r: s.r + off }, target: t });
  }
  return d3.linkHorizontal()({ source: [s.x + off, s.y], target: [t.x, t.y] });
}

// An expanded parent keeps its label in place; its links fan out from the end of the label box.
function linkOffset(d, keysOnly, mode) {
  const n = d.data.node;
  if (!n || (mode === 'radial' && d.depth === 0)) return 0;
  const val = valueText(d, keysOnly);
  return nodeRadius(n) + 7 + (labelText(d).length + val.length) * CHAR + (val ? 7 : 0) + 6;
}

const Link = memo(function Link({ d, from, hot, dim, pager }) {
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    const r = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(r);
  }, []);
  const path = ready || !from ? d : from;
  return <path className={'h-link' + (hot ? ' hot' : '') + (dim ? ' dim' : '') + (pager ? ' pager' : '')} d={path} style={{ d: `path('${path}')` }} />;
});

// A container is a ring when expanded and a solid mark when collapsed; arrays are rounded squares.
function Mark({ n, r, open }) {
  const fill = open ? 'var(--prism-bg-0)' : typeColor(n.type);
  if (!isContainer(n)) return <circle className="core" r={r} fill={typeColor(n.type)} />;
  const inner = r - 1;
  return n.type === 'array' ? (
    <rect className="core" x={-inner} y={-inner} width={inner * 2} height={inner * 2} rx={2.5} fill={fill} stroke={typeColor(n.type)} strokeWidth={2} />
  ) : (
    <circle className="core" r={inner} fill={fill} stroke={typeColor(n.type)} strokeWidth={2} />
  );
}

const Node = memo(function Node({ d, p, from, mode, selected, hovered, matched, dim, expanded, keysOnly, onClick, onToggle, onHover, onLeave }) {
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    const r = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(r);
  }, []);
  const at = ready || !from ? p : from;
  const transform = `translate(${at.x}px, ${at.y}px)`;
  const handlers = { onClick: (e) => onClick(d, e), onMouseEnter: (e) => onHover(d, e), onMouseMove: (e) => onHover(d, e), onMouseLeave: onLeave };

  if (d.data.pager) {
    const text = labelText(d);
    return (
      <g className={'h-node pager' + (dim ? ' dim' : '')} style={{ transform }} {...handlers}>
        <rect className="pager-pill" x={-6} y={-11} width={text.length * PILL_CHAR + 18} height={22} rx={11} />
        <text className="pager-text" x={3} dy="0.35em">{text}</text>
      </g>
    );
  }

  const n = d.data.node;
  const r = nodeRadius(n);
  const container = isContainer(n) && n.children.length > 0;
  const key = labelText(d);
  const val = valueText(d, keysOnly);

  let textAnchor = 'start';
  let tx = r + 7;
  let rot = 0;
  if (mode === 'radial') {
    const deg = (p.angle * 180) / Math.PI - 90;
    const flip = p.angle > Math.PI;
    rot = d.depth === 0 ? 0 : flip ? deg + 180 : deg;
    textAnchor = d.depth === 0 ? 'middle' : flip ? 'end' : 'start';
    tx = d.depth === 0 ? 0 : flip ? -(r + 7) : r + 7;
  }
  // the selection / hover chip behind the label: mono text, so its width is exact
  const w = (key.length + (val ? val.length : 0)) * CHAR + (val ? 7 : 0) + 10;
  const chipX = textAnchor === 'end' ? tx - w + 5 : tx - 5;
  const isIndex = n.parent?.type === 'array';

  return (
    <g className={'h-node' + (selected ? ' sel' : '') + (hovered ? ' hov' : '') + (dim ? ' dim' : '') + (matched ? ' match' : '')} style={{ transform }} {...handlers}>
      {selected && (
        <>
          <circle className="sel-gap" r={r + 1.5} />
          <circle className="sel-ring" r={r + 3.75} />
        </>
      )}
      {matched && !selected && <circle className="match-ring" r={r + 3.5} />}
      <Mark n={n} r={r} open={container && expanded} />
      {mode === 'radial' && d.depth === 0 ? (
        <text className="h-label root-label" y={r + 18} textAnchor="middle">{key}</text>
      ) : (
        <g transform={`rotate(${rot})`}>
          {(selected || hovered) && <rect className={'label-chip' + (selected ? ' sel' : '')} x={chipX} y={-10} width={w} height={20} rx={4} />}
          <text className="h-label" x={tx} dy="0.35em" textAnchor={textAnchor}>
            <tspan className={'k' + (isIndex ? ' idx' : '')}>{key}</tspan>
            {val && (
              <tspan className="v" dx="7" fill={isContainer(n) ? undefined : typeColor(n.type)}>
                {val}
              </tspan>
            )}
          </text>
        </g>
      )}
      {container && (
        // drawn over the node's own mark, so it never covers a neighbouring row
        <g
          className="toggle"
          onClick={(e) => {
            e.stopPropagation();
            onToggle(d, e);
          }}
        >
          <circle r={7.5} />
          <path d={expanded ? 'M-3.5 0H3.5' : 'M-3.5 0H3.5M0 -3.5V3.5'} />
        </g>
      )}
    </g>
  );
});

export default function HierarchyView({ mode = 'tree' }) {
  const model = useStore((s) => s.model);
  const expanded = useStore((s) => s.expanded);
  const windows = useStore((s) => s.windows);
  const selectedId = useStore((s) => s.selectedId);
  const revealTick = useStore((s) => s.revealTick);
  const matchSet = useStore((s) => s.matchSet);
  const trail = useStore((s) => s.trail);
  const { select, toggle, showMore, showEarlier, expandAll, collapseAll } = useStore.getState();
  const [sizeRef, size] = useSize();
  const [zoomRef, transform, zoom] = useZoom({ min: 0.03, max: 4 });
  const [tip, showTip, hideTip] = useTip();
  const [hoverId, setHoverId] = useState(null);
  const [keysOnly, setKeysOnly] = useState(false);
  const prevPos = useRef(new Map());

  const h = useMemo(() => buildVisible(model.root, expanded, windows), [model, expanded, windows]);
  const pos = useMemo(() => (mode === 'radial' ? layoutRadial(h, keysOnly) : layoutTree(h, keysOnly)), [h, mode, keysOnly]);
  const nodes = useMemo(() => h.descendants(), [h]);
  const links = useMemo(() => h.links(), [h]);

  // where newly-appearing nodes should grow from: their parent's previous position
  const fromOf = (d) => {
    if (prevPos.current.has(d.data.id)) return null;
    let p = d.parent;
    while (p && !prevPos.current.has(p.data.id)) p = p.parent;
    return p ? prevPos.current.get(p.data.id) : null;
  };
  useEffect(() => {
    prevPos.current = pos;
  }, [pos]);

  const bounds = () => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pos.values()) {
      x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
    }
    return mode === 'radial' ? { x0: x0 - 120, y0: y0 - 60, x1: x1 + 120, y1: y1 + 60 } : { x0: x0 - 60, y0, x1: x1 + 260, y1 };
  };
  const fit = (duration = 650) => size.width && zoom.to(fitTransform(bounds(), size.width, size.height, 40, 1.3), duration);

  const centerOn = (id, duration = 650) => {
    const p = pos.get(id);
    if (!p || !size.width) return;
    const k = Math.max(transform.k, 0.6);
    zoom.to(d3.zoomIdentity.translate(size.width / 2 - p.x * k - (mode === 'tree' ? 120 : 0), size.height / 2 - p.y * k).scale(k), duration);
  };

  const booted = useRef(false);
  useEffect(() => {
    if (!size.width || booted.current) return;
    booted.current = true;
    if (selectedId !== model.root.id && pos.has(selectedId)) centerOn(selectedId, 0);
    else zoom.set(fitTransform(bounds(), size.width, size.height, 40, 1.2));
  }, [size.width]);

  const lastTick = useRef(revealTick);
  useEffect(() => {
    if (revealTick === lastTick.current) return;
    lastTick.current = revealTick;
    const t = setTimeout(() => {
      const p = pos.get(selectedId);
      if (!p) return;
      const sx = transform.applyX(p.x);
      const sy = transform.applyY(p.y);
      if (sx < 60 || sy < 40 || sx > size.width - 200 || sy > size.height - 40) centerOn(selectedId);
    }, 60);
    return () => clearTimeout(t);
  }, [revealTick, pos]);

  // path from root to selected / hovered
  const hotSet = useMemo(() => {
    const s = new Set();
    let n = model.nodes[hoverId ?? selectedId];
    while (n) {
      s.add(n.id);
      n = n.parent;
    }
    return s;
  }, [hoverId, selectedId, model]);

  const onClick = (d, e) => {
    if (d.data.pager === 'less') return showEarlier(d.data.parentId, DEFAULT_WINDOW);
    if (d.data.pager) return showMore(d.data.parentId, DEFAULT_WINDOW);
    const n = d.data.node;
    if (e.shiftKey && isContainer(n)) return expandAll(n.id, 2);
    select(n.id, { reveal: false });
    if (isContainer(n) && !expanded.has(n.id)) toggle(n.id);
  };
  const onToggle = (d, e) => {
    const n = d.data.node;
    select(n.id, { reveal: false }); // the glyph covers the node's mark, so clicking it selects too
    if (e.shiftKey) return expanded.has(n.id) ? collapseAll(n.id) : expandAll(n.id, 2);
    toggle(n.id);
  };
  const onHover = (d, e) => {
    if (d.data.node) {
      setHoverId(d.data.node.id);
      showTip(d.data.node, e);
    }
  };
  const onLeave = () => {
    setHoverId(null);
    hideTip();
  };

  const searching = !!trail;
  const sel = model.nodes[selectedId];
  let status = '';
  if (sel?.parent) {
    const { start, end } = childWindow(windows, sel.parent);
    const total = sel.parent.children.length;
    if (end - start < total && expanded.has(sel.parent.id)) status = `Window ${(start + 1).toLocaleString()}–${end.toLocaleString()} of ${total.toLocaleString()}`;
  }

  return (
    <ViewFrame
      title={mode === 'radial' ? 'Radial' : 'Tree'}
      subtitle={`${nodes.length.toLocaleString()} visible of ${model.nodes.length.toLocaleString()} nodes`}
      tools={
        <>
          <button className="btn" onClick={() => fit()}><Icon name="fit" size={16} />Fit</button>
          <button className="btn" onClick={() => expandAll(selectedId, 1)}><Icon name="unfoldMore" size={16} />Expand selected</button>
          <button className="btn" onClick={() => collapseAll(model.root.id)}><Icon name="unfoldLess" size={16} />Collapse all</button>
          <Sep />
          <Seg value={keysOnly ? 'k' : 'kv'} options={[['kv', 'Key + value'], ['k', 'Key']]} onChange={(v) => setKeysOnly(v === 'k')} />
        </>
      }
      hints={[['Click', 'Select'], ['⇧ Click', 'Expand two levels'], ['←↑↓→', 'Navigate'], ['Drag', 'Pan'], ['Wheel', 'Zoom']]}
      status={status}
      bodyRef={sizeRef}
      canvas
    >
      <svg ref={zoomRef} className="canvas-svg" width={size.width} height={size.height}>
        <g transform={transform.toString()}>
          {mode === 'radial' && h.height > 0 &&
            d3.range(1, h.height + 1).map((i) => <circle key={i} className="ring" r={pos.radii[i]} />)}
          <g>
            {links.map((l) => {
              const s = pos.get(l.source.data.id);
              const t = pos.get(l.target.data.id);
              const from = fromOf(l.target);
              const hot = l.target.data.node && hotSet.has(l.target.data.node.id);
              const dim = searching && !(l.target.data.node && trail.has(l.target.data.node.id));
              const off = linkOffset(l.source, keysOnly, mode);
              return <Link key={l.target.data.id} d={linkPath(mode, s, t, off)} from={from ? linkPath(mode, from, from, off) : null} hot={hot} dim={dim} pager={!!l.target.data.pager} />;
            })}
          </g>
          <g>
            {nodes.map((d) => {
              const n = d.data.node;
              const id = d.data.id;
              return (
                <Node
                  key={id}
                  d={d}
                  p={pos.get(id)}
                  from={fromOf(d)}
                  mode={mode}
                  selected={n && n.id === selectedId}
                  hovered={n && n.id === hoverId}
                  matched={n && matchSet?.has(n.id)}
                  dim={searching && !(n && trail.has(n.id))}
                  expanded={n && expanded.has(n.id)}
                  keysOnly={keysOnly}
                  onClick={onClick}
                  onToggle={onToggle}
                  onHover={onHover}
                  onLeave={onLeave}
                />
              );
            })}
          </g>
        </g>
      </svg>
      <ZoomControl k={transform.k} onZoom={zoom.scaleBy} />
      <NodeTip tip={tip} />
    </ViewFrame>
  );
}
