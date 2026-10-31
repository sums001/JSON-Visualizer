import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { useStore } from '../store';
import { ancestors, isContainer, label, shortValue } from '../lib/model';
import { palette } from '../lib/colors';
import { useSize } from '../lib/hooks';
import { NodeTip, Seg, Sep, useTip, ViewFrame, ZoomControl } from '../components/common';
import Icon from '../components/Icons';

const MAX_NODES = 2500;
const OBJECT_CAP = 60;
const AUTO_BUDGET = 1400;
const STEP = 24;
const FONT = '11px "Geist Mono", "JetBrains Mono", monospace';

const radiusOf = (n) => (isContainer(n) ? Math.min(12, 4 + Math.sqrt(Math.min(n.count, 2000)) * 0.22) : 3.5);

// Breadth-first walk showing at most `cap` children per container; the rest fold into one "+N" node.
// The pinned node's ancestor chain is always included so external selections can be revealed.
function buildGraph(model, depth, baseCap, caps, pinnedId) {
  const pinnedByParent = new Map();
  if (pinnedId != null && model.nodes[pinnedId]) for (const a of ancestors(model.nodes[pinnedId])) if (a.parent) pinnedByParent.set(a.parent.id, a);

  const nodes = [];
  const index = new Map();
  const add = (g) => {
    index.set(g.id, g);
    nodes.push(g);
  };
  add({ id: model.root.id, n: model.root, r: Math.max(7, radiusOf(model.root)), depth: 0, parent: null });
  let level = [nodes[0]];
  let truncated = false;
  while (level.length && !truncated) {
    const next = [];
    for (const pg of level) {
      const n = pg.n;
      if (!isContainer(n) || !n.children.length || n.depth >= depth) continue;
      // the per-list cap applies to arrays; objects show their keys unless they are huge
      let cap = caps.get(n.id) ?? (n.type === 'object' ? Math.max(baseCap, OBJECT_CAP) : baseCap);
      if (n.children.length - cap <= 5) cap = n.children.length;
      const shown = n.children.slice(0, cap);
      const pin = pinnedByParent.get(n.id);
      if (pin && pin.i >= cap) shown.push(pin);
      for (const c of shown) {
        if (nodes.length >= MAX_NODES) {
          truncated = true;
          break;
        }
        const g = { id: c.id, n: c, r: radiusOf(c), depth: c.depth, parent: pg };
        add(g);
        next.push(g);
      }
      const rest = n.children.length - shown.length;
      if (rest > 0 && !truncated) {
        add({ id: `more-${n.id}`, n: null, more: rest, owner: n, r: 4 + Math.log10(rest + 1) * 2.2, depth: n.depth + 1, parent: pg });
      }
      if (truncated) break;
    }
    level = next;
  }
  const links = nodes.filter((g) => g.parent).map((g) => ({ source: g.parent, target: g }));
  return { nodes, links, index, truncated };
}

// Deepest level whose cumulative node count stays within budget.
function autoDepth(model, baseCap) {
  const { nodes } = buildGraph(model, model.maxDepth, baseCap, new Map(), null);
  const perDepth = [];
  for (const g of nodes) perDepth[g.depth] = (perDepth[g.depth] || 0) + 1;
  let total = 0;
  for (let d = 0; d < perDepth.length; d++) {
    total += perDepth[d];
    if (total > AUTO_BUDGET) return Math.max(1, d - 1);
  }
  return Math.max(1, perDepth.length - 1);
}

export default function GraphView() {
  const model = useStore((s) => s.model);
  const selectedId = useStore((s) => s.selectedId);
  const revealTick = useStore((s) => s.revealTick);
  const matchSet = useStore((s) => s.matchSet);
  const theme = useStore((s) => s.theme);
  const select = useStore((s) => s.select);
  const [sizeRef, size] = useSize();
  const canvasRef = useRef(null);
  const [baseCap, setBaseCap] = useState(STEP);
  const [depth, setDepth] = useState(() => autoDepth(model, STEP));
  const [caps, setCaps] = useState(() => new Map());
  const [pinned, setPinned] = useState(() => (selectedId === model.root.id ? null : selectedId));
  const [labels, setLabels] = useState('auto');
  const [zoomPct, setZoomPct] = useState(0.7);
  const [tip, showTip, hideTip] = useTip();
  const st = useRef({ transform: d3.zoomIdentity, hover: null, nodes: [], sim: null, zoom: null, pendingPan: null });
  const [running, setRunning] = useState(true);

  const graph = useMemo(() => buildGraph(model, depth, baseCap, caps, pinned), [model, depth, baseCap, caps, pinned]);
  const folded = useMemo(() => graph.nodes.reduce((s, g) => s + (g.more || 0), 0), [graph]);

  const labelOf = (g, k) => {
    if (g.more) return `+${g.more.toLocaleString()}`;
    const n = g.n;
    const key = n.parent?.type === 'array' ? `[${n.key}]` : label(n);
    if (isContainer(n)) return `${key} ${n.type === 'array' ? '[' + n.children.length + ']' : '{' + n.children.length + '}'}`;
    return k > 3.5 ? `${key}: ${shortValue(n, 22)}` : key;
  };

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pal = palette(useStore.getState().theme);
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const { transform: t, hover } = st.current;
    const { nodes, links } = graph;
    const sel = useStore.getState().selectedId;
    const matches = useStore.getState().matchSet;
    const isMatch = (g) => !matches || (g.n && matches.has(g.id));
    const colorOf = (g) => pal.type[g.more ? g.owner.type : g.n.type];
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.scale(t.k, t.k);

    // links
    ctx.lineWidth = 1 / t.k;
    ctx.strokeStyle = pal.link;
    ctx.globalAlpha = matches ? 0.4 : 1;
    ctx.beginPath();
    for (const l of links) {
      ctx.moveTo(l.source.x, l.source.y);
      ctx.lineTo(l.target.x, l.target.y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    // path to the selected / hovered node
    const hotIds = new Set();
    let p = model.nodes[typeof hover === 'number' ? hover : sel];
    while (p) {
      hotIds.add(p.id);
      p = p.parent;
    }
    ctx.strokeStyle = pal.accentLine;
    ctx.lineWidth = 1.5 / t.k;
    ctx.beginPath();
    for (const l of links) {
      if (hotIds.has(l.target.id)) {
        ctx.moveTo(l.source.x, l.source.y);
        ctx.lineTo(l.target.x, l.target.y);
      }
    }
    ctx.stroke();

    // marks, each with a thin canvas-coloured ring so neighbours stay separate
    for (const g of nodes) {
      ctx.globalAlpha = isMatch(g) ? 1 : 0.15;
      ctx.beginPath();
      ctx.arc(g.x, g.y, g.r, 0, Math.PI * 2);
      if (g.more) {
        ctx.fillStyle = pal.bg0;
        ctx.fill();
        ctx.setLineDash([2.5 / t.k, 2 / t.k]);
        ctx.strokeStyle = colorOf(g);
        ctx.lineWidth = (g.id === hover ? 2 : 1.5) / t.k;
        ctx.stroke();
        ctx.setLineDash([]);
        continue;
      }
      ctx.fillStyle = colorOf(g);
      ctx.fill();
      ctx.strokeStyle = pal.bg0;
      ctx.lineWidth = 1.5 / t.k;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    const sg = graph.index.get(sel);
    if (sg) {
      ctx.strokeStyle = pal.bg0;
      ctx.lineWidth = 3 / t.k;
      ctx.beginPath();
      ctx.arc(sg.x, sg.y, sg.r + 1.5 / t.k, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = pal.accent;
      ctx.lineWidth = 1.5 / t.k;
      ctx.beginPath();
      ctx.arc(sg.x, sg.y, sg.r + 3.75 / t.k, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    // labels in screen space: selection first, then biggest nodes, skipping collisions
    ctx.font = FONT;
    ctx.textBaseline = 'middle';
    const placed = [];
    const hit = (b) => placed.some((q) => b.x0 < q.x1 && b.x1 > q.x0 && b.y0 < q.y1 && b.y1 > q.y0);
    const hot = (g) => g.id === sel || g.id === hover;
    const candidates = nodes
      .filter((g) => {
        if (hot(g)) return true;
        if (labels === 'none' || !isMatch(g)) return false;
        if (labels === 'all') return true;
        if (g.more) return t.k > 0.5;
        return isContainer(g.n) ? g.r * t.k > 4.5 : t.k > 2.2;
      })
      .sort((a, b) => hot(b) - hot(a) || b.r - a.r);
    for (const g of candidates.slice(0, labels === 'all' ? 1500 : 500)) {
      const sx = t.applyX(g.x) + g.r * t.k + 6;
      const sy = t.applyY(g.y);
      if (sx < -50 || sy < 0 || sx > size.width || sy > size.height) continue;
      const text = labelOf(g, t.k);
      const w = ctx.measureText(text).width;
      const box = { x0: sx - 4, y0: sy - 8, x1: sx + w + 4, y1: sy + 8 };
      if (!hot(g) && labels !== 'all' && hit(box)) continue;
      placed.push(box);
      if (g.id === sel) {
        ctx.fillStyle = pal.accentSoft;
        ctx.beginPath();
        ctx.roundRect(sx - 4, sy - 8, w + 8, 16, 3);
        ctx.fill();
      } else {
        ctx.lineWidth = 3;
        ctx.strokeStyle = pal.bg0;
        ctx.strokeText(text, sx, sy);
      }
      ctx.fillStyle = hot(g) ? pal.text1 : g.more ? colorOf(g) : pal.text2;
      ctx.fillText(text, sx, sy);
    }
  };
  const drawRef = useRef(draw);
  drawRef.current = draw;

  const zoomTo = (tr, duration = 750) => {
    const { zoom } = st.current;
    if (zoom && canvasRef.current) d3.select(canvasRef.current).transition().duration(duration).call(zoom.transform, tr);
  };
  const scaleBy = (f) => {
    st.current.userZoomed = true;
    const { zoom } = st.current;
    if (zoom && canvasRef.current) d3.select(canvasRef.current).transition().duration(200).call(zoom.scaleBy, f);
  };
  const panTo = (g) => {
    const k = Math.max(st.current.transform.k, 1.4);
    zoomTo(d3.zoomIdentity.translate(size.width / 2 - g.x * k, size.height / 2 - g.y * k).scale(k));
  };
  const fit = () => {
    const { nodes } = st.current;
    if (!nodes.length) return;
    const [x0, x1] = d3.extent(nodes, (g) => g.x);
    const [y0, y1] = d3.extent(nodes, (g) => g.y);
    const k = Math.min(3, 0.86 / Math.max((x1 - x0) / size.width, (y1 - y0) / size.height));
    zoomTo(d3.zoomIdentity.translate(size.width / 2 - ((x0 + x1) / 2) * k, size.height / 2 - ((y0 + y1) / 2) * k).scale(k));
  };
  const fitRef = useRef(fit);
  fitRef.current = fit;

  // simulation
  useEffect(() => {
    if (!size.width) return;
    const { nodes, links, index } = graph;
    const prevById = new Map(st.current.nodes.map((g) => [g.id, g]));
    if (nodes.some((g) => !prevById.has(g.id)) && !prevById.size) {
      // seed from a radial tree so the layout starts structured and settles quickly
      const h = d3.stratify().id((g) => g.id).parentId((g) => (g.parent ? g.parent.id : null))(nodes);
      d3.tree().size([2 * Math.PI, Math.sqrt(nodes.length) * 22]).separation((a, b) => (a.parent === b.parent ? 1 : 2) / Math.max(1, a.depth))(h);
      h.each((d) => {
        d.data.x = Math.cos(d.x - Math.PI / 2) * d.y;
        d.data.y = Math.sin(d.x - Math.PI / 2) * d.y;
      });
    } else {
      for (const g of nodes) {
        const old = prevById.get(g.id);
        if (old) {
          g.x = old.x;
          g.y = old.y;
        } else {
          const parent = g.parent && (prevById.get(g.parent.id) || index.get(g.parent.id));
          const a = Math.random() * Math.PI * 2;
          g.x = (parent?.x ?? 0) + Math.cos(a) * 14;
          g.y = (parent?.y ?? 0) + Math.sin(a) * 14;
        }
      }
    }
    st.current.nodes = nodes;
    const sim = d3
      .forceSimulation(nodes)
      .force('link', d3.forceLink(links).distance((l) => (l.target.more ? 26 : isContainer(l.target.n) ? 30 + l.target.r * 3 : 18 + l.source.r * 0.6)).strength(0.8))
      .force('charge', d3.forceManyBody().strength((g) => (isContainer(g.n) ? -80 - g.r * 9 : g.more ? -50 : -16)).distanceMax(450))
      .force('collide', d3.forceCollide((g) => g.r + 2.5).iterations(2))
      .force('x', d3.forceX(0).strength(0.015))
      .force('y', d3.forceY(0).strength(0.015))
      .alpha(prevById.size ? 0.5 : 0.9)
      .alphaDecay(0.024)
      .velocityDecay(0.4)
      .on('tick', () => drawRef.current())
      .on('end', () => {
        setRunning(false);
        if (!st.current.userZoomed) fitRef.current();
      });
    st.current.sim = sim;
    setRunning(true);
    const pending = st.current.pendingPan;
    if (pending != null && index.has(pending)) {
      st.current.pendingPan = null;
      setTimeout(() => panTo(index.get(pending)), 400);
    }
    return () => sim.stop();
  }, [graph, size.width > 0]);

  // zoom
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size.width) return;
    const zoom = d3
      .zoom()
      .scaleExtent([0.05, 12])
      .on('zoom', (e) => {
        if (e.sourceEvent) st.current.userZoomed = true;
        st.current.transform = e.transform;
        setZoomPct(e.transform.k);
        drawRef.current();
      });
    st.current.zoom = zoom;
    const sel = d3.select(canvas).call(zoom).on('dblclick.zoom', null);
    if (st.current.transform === d3.zoomIdentity) sel.call(zoom.transform, d3.zoomIdentity.translate(size.width / 2, size.height / 2).scale(0.7));
    return () => sel.on('.zoom', null);
  }, [size.width > 0]);

  useEffect(() => drawRef.current(), [size, labels, selectedId, matchSet, theme]);

  // reveal externally selected nodes, pulling them into the graph if they were folded away
  const lastTick = useRef(revealTick);
  useEffect(() => {
    if (revealTick === lastTick.current) return;
    lastTick.current = revealTick;
    const g = graph.index.get(selectedId);
    st.current.userZoomed = true;
    if (g) return panTo(g);
    const node = model.nodes[selectedId];
    if (node && node.depth > depth) setDepth(node.depth);
    st.current.pendingPan = selectedId;
    setPinned(selectedId);
  }, [revealTick]);

  const findAt = (e) => {
    const b = canvasRef.current.getBoundingClientRect();
    const [x, y] = st.current.transform.invert([e.clientX - b.left, e.clientY - b.top]);
    let best = null;
    let bestD = (12 / st.current.transform.k) ** 2;
    for (const g of graph.nodes) {
      const d = (g.x - x) ** 2 + (g.y - y) ** 2 - g.r * g.r;
      if (d < bestD) {
        bestD = d;
        best = g;
      }
    }
    return best;
  };

  const onMove = (e) => {
    const g = findAt(e);
    const id = g ? g.id : null;
    if (id !== st.current.hover) {
      st.current.hover = id;
      drawRef.current();
    }
    canvasRef.current.style.cursor = g ? 'pointer' : 'grab';
    if (!g) hideTip();
    else if (g.more) showTip(g.owner, e, `${g.more.toLocaleString()} more ${g.owner.type === 'array' ? 'items' : 'keys'} folded · click to show ${STEP} more`);
    else showTip(g.n, e);
  };

  const onClick = (e) => {
    const g = findAt(e);
    if (!g) return;
    if (g.more) {
      setCaps((m) => new Map(m).set(g.owner.id, (m.get(g.owner.id) ?? baseCap) + STEP));
      return;
    }
    select(g.id, { reveal: false });
  };

  const toggleRun = () => {
    const sim = st.current.sim;
    if (!sim) return;
    if (running) {
      sim.stop();
      setRunning(false);
    } else {
      sim.alpha(0.5).restart();
      setRunning(true);
    }
  };

  const maxDepth = Math.min(model.maxDepth, 30);

  return (
    <ViewFrame
      title="Graph"
      subtitle={`${graph.nodes.length.toLocaleString()} of ${model.nodes.length.toLocaleString()} nodes${folded ? ` · ${folded.toLocaleString()} folded` : ''}${graph.truncated ? ' · capped' : ''}`}
      tools={
        <>
          <Seg label="Labels" value={labels} options={[['auto', 'Auto'], ['all', 'All'], ['none', 'None']]} onChange={setLabels} />
          <label className="picker" title="How many levels of nesting to draw">
            <span className="dim">Depth</span>
            <input type="range" min={1} max={maxDepth} value={Math.min(depth, maxDepth)} onChange={(e) => setDepth(+e.target.value)} />
            <span className="range-val">{depth}</span>
          </label>
          <label className="picker" title="Items drawn per list before the rest fold into a +N node">
            <span className="dim">Per list</span>
            <input type="range" min={4} max={100} step={4} value={baseCap} onChange={(e) => { setBaseCap(+e.target.value); setCaps(new Map()); }} />
            <span className="range-val">{baseCap}</span>
          </label>
          <Sep />
          <button className="btn" onClick={fit}><Icon name="fit" size={16} />Fit</button>
          <button className="btn icon bordered" onClick={toggleRun} title={running ? 'Pause simulation' : 'Resume simulation'}>
            <Icon name={running ? 'pause' : 'play'} size={15} />
          </button>
        </>
      }
      hints={[['Click', 'Select'], ['Click +N', `Unfold ${STEP} more`], ['Hover', 'Trace path'], ['Drag', 'Pan'], ['Wheel', 'Zoom']]}
      status={running ? 'Simulating…' : 'Simulation settled'}
      bodyRef={sizeRef}
      canvas
    >
      <canvas
        ref={canvasRef}
        width={size.width * Math.min(2, window.devicePixelRatio || 1)}
        height={size.height * Math.min(2, window.devicePixelRatio || 1)}
        style={{ width: size.width, height: size.height, display: 'block', cursor: 'grab' }}
        onMouseMove={onMove}
        onMouseLeave={() => { st.current.hover = null; hideTip(); drawRef.current(); }}
        onClick={onClick}
      />
      <ZoomControl k={zoomPct} onZoom={scaleBy} />
      <NodeTip tip={tip} />
    </ViewFrame>
  );
}
