import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { formatBytes, isContainer, label, shortValue } from '../lib/model';
import { typeColor } from '../lib/colors';
import Icon from './Icons';
import { BrandMark, Kbd, MOD, Seg, TypeDot } from './common';

const SHOWN = 50;

function Search() {
  const model = useStore((s) => s.model);
  const query = useStore((s) => s.query);
  const matches = useStore((s) => s.matches);
  const setQuery = useStore((s) => s.setQuery);
  const select = useStore((s) => s.select);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [scope, setScope] = useState('all');
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // "/" or Ctrl/Cmd+K jumps to search from anywhere
  useEffect(() => {
    const onKey = (e) => {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
      if ((e.key === '/' && !typing) || (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        if (useStore.getState().query) setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const q = query.trim().toLowerCase();
  // where each hit matched, for the Keys / Values filter and the counts
  const hits = useMemo(() => {
    if (!matches) return [];
    return matches.map((id) => {
      const n = model.nodes[id];
      return { n, k: !!n.parent && String(n.key).toLowerCase().includes(q), v: !isContainer(n) && String(n.v).toLowerCase().includes(q) };
    });
  }, [matches, model, q]);
  const list = scope === 'all' ? hits : hits.filter((h) => (scope === 'keys' ? h.k : h.v));

  useEffect(() => {
    listRef.current?.querySelector('.sp-hit.on')?.scrollIntoView({ block: 'nearest' });
  }, [cursor, open]);

  const go = (i) => {
    if (!list.length) return;
    const idx = ((i % list.length) + list.length) % list.length;
    setCursor(idx);
    select(list[idx].n.id);
  };
  // Enter selects the highlighted hit; pressed again on a hit that's already selected, it steps on
  const enter = (back) => {
    const onSel = list[cursor]?.n.id === useStore.getState().selectedId;
    go(back ? cursor - 1 : onSel ? cursor + 1 : cursor);
    setOpen(false);
  };
  const move = (d) => {
    setOpen(true);
    setCursor((c) => Math.max(0, Math.min(Math.min(list.length, SHOWN) - 1, c + d)));
  };

  const mark = (text) => {
    const i = text.toLowerCase().indexOf(q);
    if (!q || i < 0) return text;
    return (
      <>
        {text.slice(0, i)}
        <mark>{text.slice(i, i + q.length)}</mark>
        {text.slice(i + q.length)}
      </>
    );
  };

  const total = matches ? (matches.length >= 5000 ? '5000+' : matches.length.toLocaleString()) : '';
  const keyHits = hits.filter((h) => h.k).length;
  const valueHits = hits.filter((h) => h.v).length;

  return (
    <div className="search-wrap">
      <div className={'search' + (focused ? ' focus' : '')} onClick={() => inputRef.current?.focus()}>
        <Icon name="search" size={16} />
        <input
          ref={inputRef}
          value={query}
          placeholder="Search keys and values"
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
            setOpen(true);
          }}
          onFocus={() => {
            setFocused(true);
            if (query) setOpen(true);
          }}
          onBlur={() => {
            setFocused(false);
            setOpen(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') enter(e.shiftKey);
            else if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
            else if (e.key === 'Escape') {
              if (open) setOpen(false);
              else {
                setQuery('');
                inputRef.current.blur();
              }
            }
          }}
        />
        {matches ? (
          <>
            <span className="search-count">{list.length ? `${Math.min(cursor + 1, list.length)}/${scope === 'all' ? total : list.length}` : 'No hits'}</span>
            <span className="search-step" onMouseDown={(e) => e.preventDefault()}>
              <button title="Previous match (⇧↵)" onClick={(e) => { e.stopPropagation(); go(cursor - 1); }}><Icon name="chevronUp" size={15} /></button>
              <button title="Next match (↵)" onClick={(e) => { e.stopPropagation(); go(cursor + 1); }}><Icon name="chevronDown" size={15} /></button>
            </span>
          </>
        ) : (
          !focused && (
            <span className="search-keys">
              <Kbd>/</Kbd>
              <Kbd>{MOD === '⌘' ? '⌘K' : 'Ctrl K'}</Kbd>
            </span>
          )
        )}
      </div>

      {open && matches && (
        <div className="search-panel" onMouseDown={(e) => e.preventDefault()}>
          <div className="sp-head">
            <span>
              <b>{total} {matches.length === 1 ? 'match' : 'matches'}</b> · {keyHits.toLocaleString()} keys, {valueHits.toLocaleString()} values
            </span>
            <Seg value={scope} options={[['all', 'All'], ['keys', 'Keys'], ['values', 'Values']]} onChange={(s) => { setScope(s); setCursor(0); }} />
          </div>
          <div className="sp-list" ref={listRef}>
            {list.slice(0, SHOWN).map((h, i) => (
              <button key={h.n.id} className={'sp-hit' + (i === cursor ? ' on' : '')} onClick={() => { go(i); setOpen(false); }}>
                <TypeDot type={h.n.type} />
                <span className="sp-kv">
                  <span className="sp-k">{h.k ? mark(label(h.n)) : label(h.n)}</span>
                  <span className="sp-v" style={{ color: isContainer(h.n) ? 'var(--prism-text-3)' : typeColor(h.n.type) }}>{h.v ? mark(shortValue(h.n, 48)) : shortValue(h.n, 48)}</span>
                </span>
                <span className="sp-path">{h.n.path}</span>
              </button>
            ))}
            {!list.length && <div className="sp-none">No {scope === 'keys' ? 'keys' : scope === 'values' ? 'values' : 'keys or values'} contain “{query.trim()}”</div>}
          </div>
          <div className="sp-foot">
            <span><Kbd>↑↓</Kbd>Move</span>
            <span><Kbd>↵</Kbd>Select in all views</span>
            <span><Kbd>esc</Kbd>Close</span>
            <span className="sp-count">Showing {Math.min(SHOWN, list.length).toLocaleString()} of {list.length.toLocaleString()}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TopBar() {
  const model = useStore((s) => s.model);
  const name = useStore((s) => s.name);
  const close = useStore((s) => s.close);
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const inspectorOpen = useStore((s) => s.inspectorOpen);
  const toggleInspector = useStore((s) => s.toggleInspector);
  const setEditorOpen = useStore((s) => s.setEditorOpen);
  const download = useStore((s) => s.download);

  return (
    <header className="topbar">
      <div className="tb-left">
        <button className="brand" onClick={close} title="Back to start">
          <BrandMark size={24} />
          JSON Prism
        </button>
        <span className="vsep" style={{ margin: 0 }} />
        <span className="file-name" title={name}>
          <Icon name="file" size={16} />
          <span>{name}</span>
        </span>
        <span className="file-stats">
          <span><b>{model.nodes.length.toLocaleString()}</b> nodes</span>
          <span>depth <b>{model.maxDepth}</b></span>
          <b>{formatBytes(model.root.size)}</b>
        </span>
      </div>
      <Search />
      <div className="tb-right">
        <button className="btn" onClick={() => setEditorOpen(true)} title="Edit source"><Icon name="code" size={16} />Source</button>
        <button className="btn" onClick={download} title={`Download as JSON  ${MOD} S`}><Icon name="download" size={16} />Download</button>
        <button className="btn ghost" onClick={close} title="Open another document"><Icon name="plus" size={16} />New</button>
        <span className="vsep" />
        <button className="btn icon" onClick={toggleTheme} title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
        </button>
        <button className={'btn icon' + (inspectorOpen ? ' on' : '')} onClick={toggleInspector} title="Toggle inspector  ]">
          <Icon name="panel" size={17} />
        </button>
      </div>
    </header>
  );
}
