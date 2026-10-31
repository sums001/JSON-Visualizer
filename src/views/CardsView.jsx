import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as d3 from 'd3';
import { useStore, childWindow, isPaged, MIN_SHOWN } from '../store';
import { isContainer, label, shortValue } from '../lib/model';
import { typeColor } from '../lib/colors';
import { fitTransform, useSize, useZoom } from '../lib/hooks';
import { TypeDot, ViewFrame, ZoomControl } from '../components/common';
import Icon from '../components/Icons';

const W = 260;
const GAP_X = 110;
const HEAD = 34;
const ROW = 22;
const BAR = 28; // pager under the header of a long card
const PAD = 4;
const STEP = 10; // rows per pager click
const STICK = 8; // screen y the header + pager pin to, just under the top of the canvas
const GAP_Y = 18; // between cards in a column

function layoutCards(model, expanded, windows) {
  const cards = [];
  const byId = new Map();
  const visit = (n, parentCard, rowIndex) => {
    const { start, end } = childWindow(windows, n);
    const rows = n.children.slice(start, end);
    const paged = isPaged(n);
    const top = HEAD + (paged ? BAR : 0);
    const card = {
      n,
      rows,
      less: start,
      more: n.children.length - end,
      paged,
      top,
      depth: n.depth,
      h: top + PAD * 2 + rows.length * ROW,
      parent: parentCard,
      rowIndex,
    };
    cards.push(card);
    byId.set(n.id, card);
    rows.forEach((c, i) => {
      if (isContainer(c) && c.children.length && expanded.has(c.id)) visit(c, card, i);
    });
  };
  visit(model.root, null, 0);

  // Place column by column, like the tree view: each card centred on the row that opened it,
  // so a card's contents spread above and below that row rather than only down from it.
  const columns = d3.group(cards, (c) => c.depth);
  const depths = [...columns.keys()].sort((a, b) => a - b);
  for (const d of depths) {
    const col = columns.get(d);
    col.forEach((c) => {
      c.x = d * (W + GAP_X);
      c.want = c.parent ? c.parent.y + c.parent.top + PAD + c.rowIndex * ROW + ROW / 2 - c.h / 2 : 0;
    });
    col.sort((a, b) => a.want - b.want);
    settle(col);
  }
  return { cards, byId };
}

// Stack a column's cards (sorted by `want`) without overlaps. Cards that would overlap merge
// into a run, and each run sits where its cards want on average, so a crowd of child cards
// grows evenly up and down around the rows that opened them.
function settle(col) {
  const runs = [];
  for (const c of col) {
    // `sum` adds up each card's want minus its offset inside the run; the run's top is the mean
    let run = { cards: [c], h: c.h, sum: c.want, y: c.want };
    while (runs.length) {
      const prev = runs[runs.length - 1];
      if (prev.y + prev.h + GAP_Y <= run.y) break;
      runs.pop();
      const sum = prev.sum + run.sum - (prev.h + GAP_Y) * run.cards.length;
      const cards = prev.cards.concat(run.cards);
      run = { cards, h: prev.h + GAP_Y + run.h, sum, y: sum / cards.length };
    }
    runs.push(run);
  }
  for (const run of runs) {
    let y = run.y;
    for (const c of run.cards) {
      c.y = y;
      y += c.h + GAP_Y;
    }
  }
}

// Which slice of a long list a card shows, and the controls to grow, shrink or reset it.
function Pager({ c, step, onPage }) {
  const { showMore, showLess, showEarlier, showAll, resetWindow } = useStore.getState();
  const { n, less, rows } = c;
  const id = n.id;
  const total = n.children.length;
  const first = childWindow(new Map(), n).end; // the default page
  const fmt = (v) => v.toLocaleString();
  return (
    <div className="jcard-pager" style={{ height: BAR }}>
      <span className="jp-range mono">
        {fmt(less + 1)}–{fmt(less + rows.length)} <i>/</i> {fmt(total)}
      </span>
      {less > 0 && <button title={`Show ${step} earlier`} onClick={() => onPage(c, () => showEarlier(id, step))}>▲ {step}</button>}
      <button title={`Hide the last ${step}`} disabled={rows.length <= MIN_SHOWN} onClick={() => onPage(c, () => showLess(id, step))}>−{step}</button>
      <button title={`Show ${step} more`} disabled={!c.more} onClick={() => onPage(c, () => showMore(id, step))}>+{step}</button>
      <button title={`Show all ${fmt(total)}`} disabled={!c.more && !less} onClick={() => onPage(c, () => showAll(id))}>All</button>
      <button title={`Back to the first ${first}`} disabled={!less && rows.length === first} onClick={() => onPage(c, () => resetWindow(id))}><Icon name="shrink" size={12} /></button>
    </div>
  );
}

export default function CardsView() {
  const model = useStore((s) => s.model);
  const expanded = useStore((s) => s.expanded);
  const windows = useStore((s) => s.windows);
  const selectedId = useStore((s) => s.selectedId);
  const revealTick = useStore((s) => s.revealTick);
  const matchSet = useStore((s) => s.matchSet);
  const { select, toggle, collapseAll } = useStore.getState();
  const [sizeRef, size] = useSize();
  const [zoomRef, transform, zoom] = useZoom({ min: 0.08, max: 2.5 });

  const { cards, byId } = useMemo(() => layoutCards(model, expanded, windows), [model, expanded, windows]);

  const bounds = () => ({
    x0: d3.min(cards, (c) => c.x),
    y0: d3.min(cards, (c) => c.y),
    x1: d3.max(cards, (c) => c.x + W),
    y1: d3.max(cards, (c) => c.y + c.h),
  });
  const fit = (d = 650) => zoom.to(fitTransform(bounds(), size.width, size.height, 50, 1), d);

  const booted = useRef(false);
  useEffect(() => {
    if (!size.width || booted.current) return;
    booted.current = true;
    const b = bounds();
    const k = Math.min(1, (size.height - 48) / Math.max(400, b.y1 - b.y0), (size.width - 64) / (b.x1 - b.x0));
    zoom.set(d3.zoomIdentity.translate(32, 24 - b.y0 * k).scale(Math.max(0.45, k)));
  }, [size.width]);

  // locate the card that shows the selected node
  const lastTick = useRef(revealTick);
  useEffect(() => {
    if (revealTick === lastTick.current) return;
    lastTick.current = revealTick;
    const n = model.nodes[selectedId];
    const card = byId.get(n.id) || (n.parent && byId.get(n.parent.id));
    if (!card) return;
    const k = Math.max(0.7, transform.k);
    zoom.to(d3.zoomIdentity.translate(size.width / 2 - (card.x + W / 2) * k, 32 - card.y * k).scale(k));
  }, [revealTick, byId]);

  // A paged card's header and pager pin to the top of the screen while the rest of the card
  // is still in view, so its controls never need a pan back up to reach.
  const liftOf = (c) => (c.paged ? Math.max(0, Math.min((STICK - transform.y) / transform.k - c.y, c.h - c.top)) : 0);

  // Paging resizes a card, and a centred card re-centres (its neighbours may shift too), so
  // keep the paged card's header where it was on screen: the controls stay under the pointer.
  // A header pinned at the top stays pinned, and if the card no longer reaches that far (say,
  // collapsed from deep inside it), the view comes back to its header.
  const anchor = useRef(null);
  const onPage = (c, act) => {
    anchor.current = { id: c.n.id, y: c.y, pinned: liftOf(c) > 0 };
    act();
  };
  useLayoutEffect(() => {
    const a = anchor.current;
    anchor.current = null;
    const c = a && byId.get(a.id);
    if (!c) return;
    const { x, y, k } = transform;
    let next = y + (a.y - c.y) * k;
    if (a.pinned) {
      const reaches = c.y * k + y <= STICK && (c.y + c.h - c.top) * k + y >= STICK;
      next = reaches ? y : STICK - c.y * k;
    }
    if (next !== y) zoom.set(d3.zoomIdentity.translate(x, next).scale(k));
  }, [byId]);

  const selNode = model.nodes[selectedId];
  const hotIds = useMemo(() => {
    const s = new Set();
    let p = selNode;
    while (p) {
      s.add(p.id);
      p = p.parent;
    }
    return s;
  }, [selNode]);

  return (
    <ViewFrame
      title="Cards"
      subtitle={`${cards.length.toLocaleString()} open ${cards.length === 1 ? 'card' : 'cards'}`}
      tools={
        <>
          <button className="btn" onClick={() => fit()}><Icon name="fit" size={16} />Fit</button>
          <button className="btn" onClick={() => collapseAll(model.root.id)}><Icon name="unfoldLess" size={16} />Close all</button>
        </>
      }
      hints={[['Click row', 'Open child card'], ['± 10 · All', 'Page long lists'], ['×', 'Close card'], ['Drag', 'Pan'], ['Wheel', 'Zoom']]}
      bodyRef={sizeRef}
      canvas
    >
      <div ref={zoomRef} className="cards-surface">
        <div className="cards-world" style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})` }}>
          <svg className="cards-links" style={{ overflow: 'visible' }}>
            {cards.map((c) => {
              if (!c.parent) return null;
              const x0 = c.parent.x + W;
              const y0 = c.parent.y + c.parent.top + PAD + c.rowIndex * ROW + ROW / 2;
              const x1 = c.x;
              const y1 = c.y + HEAD / 2;
              const hot = hotIds.has(c.n.id);
              const mx = (x0 + x1) / 2;
              return (
                <g key={c.n.id}>
                  <path className={'card-link' + (hot ? ' hot' : '')} d={`M${x0},${y0} C${mx},${y0} ${mx},${y1} ${x1},${y1}`} />
                  <circle className={'card-link-dot' + (hot ? ' hot' : '')} cx={x0} cy={y0} r={3} />
                </g>
              );
            })}
          </svg>
          {cards.map((c) => {
            const n = c.n;
            const sel = n.id === selectedId;
            const lift = liftOf(c);
            return (
              <div key={n.id} className={'jcard' + (sel ? ' sel' : '') + (hotIds.has(n.id) ? ' hot' : '')} style={{ left: c.x, top: c.y, width: W, height: c.h }}>
                <div className={'jcard-top' + (lift ? ' stuck' : '')} style={lift ? { transform: `translateY(${lift}px)` } : undefined}>
                  <div className="jcard-head" style={{ height: HEAD }} onClick={() => select(n.id, { reveal: false })}>
                    <TypeDot type={n.type} />
                    <span className="jk mono">{n.parent?.type === 'array' ? `[${n.key}]` : label(n)}</span>
                    <span className="jc mono">{n.type === 'array' ? `[${n.children.length.toLocaleString()}]` : `{${n.children.length.toLocaleString()}}`}</span>
                    {n.parent && (
                      <button className="jx" title="Close card" onClick={(e) => { e.stopPropagation(); toggle(n.id); }}>
                        <Icon name="close" size={13} />
                      </button>
                    )}
                  </div>
                  {c.paged && <Pager c={c} step={STEP} onPage={onPage} />}
                </div>
                <div className="jcard-rows" style={{ padding: `${PAD}px 0` }}>
                  {c.rows.map((r) => {
                    const cont = isContainer(r) && r.children.length > 0;
                    const open = cont && expanded.has(r.id);
                    return (
                      <div
                        key={r.id}
                        className={'jrow' + (r.id === selectedId ? ' sel' : '') + (open ? ' open' : '') + (matchSet?.has(r.id) ? ' match' : '')}
                        style={{ height: ROW }}
                        onClick={() => {
                          select(r.id, { reveal: false });
                          if (cont) toggle(r.id);
                        }}
                      >
                        <span className="jrk mono">
                          {cont && <Icon name="chevron" size={12} className="jchev" />}
                          {n.type === 'array' ? `[${r.key}]` : label(r)}
                        </span>
                        <span className="jrv mono" style={{ color: cont ? 'var(--prism-text-3)' : typeColor(r.type) }}>
                          {cont ? (r.type === 'array' ? `[${r.children.length.toLocaleString()}]` : `{${r.children.length.toLocaleString()}}`) : shortValue(r, 22)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <ZoomControl k={transform.k} onZoom={zoom.scaleBy} />
    </ViewFrame>
  );
}
