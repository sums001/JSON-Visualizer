import { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { typeColor, typeSoft, TYPE_GLYPH } from '../lib/colors';
import { formatBytes, isContainer, preview } from '../lib/model';
import { useStore } from '../store';
import Icon from './Icons';

export const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';

// The prism inside braces; the braces are drawn in each theme's ink, so swap the file with the theme.
export function BrandMark({ size = 20 }) {
  const theme = useStore((s) => s.theme);
  return <img className="brand-mark" src={`/prism-mark-on-${theme}-512.png`} width={size} height={size} alt="" draggable={false} />;
}

export function Kbd({ children }) {
  return <span className="kbd">{children}</span>;
}

// Glyph plus hue, so a type is never told apart by colour alone.
export function TypeBadge({ type }) {
  return (
    <span className="tbadge" style={{ color: typeColor(type), background: typeSoft(type) }}>
      <b>{TYPE_GLYPH[type]}</b>
      {type}
    </span>
  );
}

// Arrays get a rounded square, everything else a circle.
export function TypeDot({ type, size = 7 }) {
  return <span className="tdot" style={{ width: size, height: size, background: typeColor(type), borderRadius: type === 'array' ? 2 : '50%' }} />;
}

export function Sep() {
  return <span className="vsep" />;
}

export function Seg({ value, options, onChange, label }) {
  return (
    <div className="seg">
      {label && <span className="seg-label">{label}</span>}
      {options.map(([v, text]) => (
        <button key={v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

// Every view sits in the same frame: its title and tools (portalled into the top bar, so there's
// one header row), the canvas, and a strip of interaction hints. bodyRef measures only the canvas.
export function ViewFrame({ title, subtitle, tools, hints = [], status, bodyRef, canvas, children }) {
  const slot = useStore((s) => s.viewSlot);
  return (
    <div className="vf">
      {slot &&
        createPortal(
          <>
            <div className="vf-title">
              <h2>{title}</h2>
              {subtitle && <p title={subtitle}>{subtitle}</p>}
            </div>
            {tools && <div className="vf-tools">{tools}</div>}
          </>,
          slot,
        )}
      <div className={'vf-body' + (canvas ? ' canvas' : '')} ref={bodyRef}>
        {children}
      </div>
      <div className="vf-foot">
        {hints.map(([k, t]) => (
          <span key={k + t}>
            <Kbd>{k}</Kbd>
            {t}
          </span>
        ))}
        {status && <span className="vf-status">{status}</span>}
      </div>
    </div>
  );
}

export function ZoomControl({ k, onZoom }) {
  return (
    <div className="zoomctl" data-nozoom>
      <button onClick={() => onZoom(1 / 1.25)} title="Zoom out"><Icon name="minus" size={14} /></button>
      <span>{Math.round(k * 100)}%</span>
      <button onClick={() => onZoom(1.25)} title="Zoom in"><Icon name="plus" size={14} /></button>
    </div>
  );
}

export function EmptyState({ icon, title, children, tone, action }) {
  return (
    <div className="empty">
      <div className="empty-card">
        <span className={'empty-icon' + (tone === 'danger' ? ' danger' : '')}><Icon name={icon} size={20} /></span>
        <div className="empty-text">
          <h3>{title}</h3>
          {children}
        </div>
        {action}
      </div>
    </div>
  );
}

// Lightweight hover tooltip shared by all views.
export function useTip() {
  const [tip, setTip] = useState(null);
  const show = useCallback((node, e, extra) => setTip({ node, x: e.clientX, y: e.clientY, extra }), []);
  const hide = useCallback(() => setTip(null), []);
  return [tip, show, hide];
}

export function NodeTip({ tip }) {
  if (!tip || !tip.node) return null;
  const { node, x, y, extra } = tip;
  const left = Math.min(x + 16, window.innerWidth - 268);
  const top = y + 16 > window.innerHeight - 170 ? y - 150 : y + 16;
  const container = isContainer(node);
  return (
    <div className="tip" style={{ left, top }}>
      <div className="tp">{node.path}</div>
      <div className="tv-row">
        <span className="tv" style={{ color: container ? 'var(--prism-text-1)' : typeColor(node.type) }}>{preview(node, 60)}</span>
        <TypeBadge type={node.type} />
      </div>
      {extra && <div className="tx">{extra}</div>}
      <div className="tm">
        <span>Depth</span><b>{node.depth}</b>
        <span>Size</span><b>{formatBytes(node.size)}</b>
        {container ? (
          <><span>Descendants</span><b>{(node.count - 1).toLocaleString()}</b></>
        ) : node.parent ? (
          <><span>Sibling</span><b>{(node.i + 1).toLocaleString()} of {node.parent.children.length.toLocaleString()}</b></>
        ) : null}
      </div>
    </div>
  );
}

// Tiny JSON syntax highlighter for previews.
export function highlightJson(text) {
  const out = [];
  const re = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false)\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}[\],:]/g;
  let last = 0;
  let m;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    let cls;
    if (m[1]) cls = m[2] ? 'j-key' : 'j-str';
    else if (m[3]) cls = 'j-bool';
    else if (m[0] === 'null') cls = 'j-null';
    else if (/^[{}[\],:]$/.test(m[0])) cls = 'j-punc';
    else cls = 'j-num';
    if (m[1] && m[2]) {
      out.push(<span key={i++} className={cls}>{m[1]}</span>);
      out.push(<span key={i++} className="j-punc">{m[2]}</span>);
    } else out.push(<span key={i++} className={cls}>{m[0]}</span>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
