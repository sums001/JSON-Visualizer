import { Component, useEffect, useState } from 'react';
import { useStore } from './store';
import { parseInput } from './lib/parse';
import { SAMPLES } from './lib/samples';
import { EMBED, announceReady, fileNameFromUrl, giveUp } from './lib/embed';
import { VIEWS } from './views';
import Landing from './components/Landing';
import TopBar from './components/TopBar';
import Sidebar from './components/Sidebar';
import Inspector from './components/Inspector';
import SourceEditor from './components/SourceEditor';
import Shortcuts from './components/Shortcuts';
import Icon from './components/Icons';

class ViewBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidUpdate(prev) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const { label, onOpenTree } = this.props;
    const detail = [`${error.name || 'Error'}: ${error.message || error}`, ...String(error.stack || '').split('\n').filter((l) => /^\s+at /.test(l)).slice(0, 2)].join('\n');
    return (
      <div className="empty">
        <div className="empty-card left">
          <span className="empty-icon danger"><Icon name="alert" size={20} /></span>
          <div className="empty-text">
            <h3>This view hit a snag</h3>
            <p>{label} couldn’t render this document. The other views still work, and your selection is kept.</p>
          </div>
          <pre className="empty-pre">{detail}</pre>
          <div className="empty-actions">
            <button className="btn primary" onClick={() => this.setState({ error: null })}><Icon name="refresh" size={16} />Retry</button>
            {onOpenTree && <button className="btn" onClick={onOpenTree}>Open in Tree</button>}
            <button className="btn ghost" onClick={() => navigator.clipboard?.writeText(detail)}><Icon name="copy" size={16} />Copy error</button>
          </div>
        </div>
      </div>
    );
  }
}

function useGlobalKeys() {
  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement?.tagName;
      // Ctrl/⌘ S saves the document rather than the page
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && useStore.getState().model && !useStore.getState().editorOpen) {
        e.preventDefault();
        return useStore.getState().download();
      }
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.ctrlKey || e.metaKey || e.altKey) return;
      const s = useStore.getState();
      if (s.shortcutsOpen && e.key === 'Escape') return s.setShortcutsOpen(false);
      if (!s.model || s.editorOpen) return;
      if (e.key === '?') return s.setShortcutsOpen(!s.shortcutsOpen);
      if (e.key === ']') return s.toggleInspector();
      if (/^[1-9]$/.test(e.key) && VIEWS[+e.key - 1]) s.setView(VIEWS[+e.key - 1].id);
      const nav = { ArrowLeft: 'parent', ArrowRight: 'child', ArrowDown: 'next', ArrowUp: 'prev' }[e.key];
      if (nav && !['table', 'raw', 'schema'].includes(s.view)) {
        e.preventDefault();
        s.navigate(nav);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

function useDropLoader() {
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    let depth = 0;
    const enter = (e) => {
      if (![...(e.dataTransfer?.types || [])].includes('Files')) return;
      depth++;
      setDragging(true);
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const over = (e) => e.preventDefault();
    const drop = async (e) => {
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (!file) return;
      const text = await file.text();
      const res = parseInput(text);
      if (res.error) alert(`Could not parse ${file.name}: ${res.error}${res.line ? ` (Ln ${res.line}, Col ${res.col})` : ''}`);
      else useStore.getState().load(res.json, file.name, text);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, []);
  return dragging;
}

// ?sample=markets&view=tree deep-links straight into a sample; &theme=light picks a theme.
function useUrlBoot() {
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const theme = p.get('theme');
    if (theme === 'light' || theme === 'dark') useStore.getState().setTheme(theme);
    const sample = SAMPLES.find((s) => s.id === p.get('sample'));
    if (sample) {
      const s = useStore.getState();
      s.load(sample.build(), sample.file);
      s.setView(p.get('view') || sample.view);
    }
  }, []);
}

// In the extension's frame: wait for the response text from the content script instead of showing the start page.
function useEmbedBoot() {
  const [waiting, setWaiting] = useState(EMBED);
  useEffect(() => {
    if (!EMBED) return;
    const onMessage = (e) => {
      if (e.source !== window.parent || e.data?.type !== 'prism:json') return;
      const { text, url, view } = e.data;
      const res = parseInput(String(text));
      if (res.error) return giveUp();
      useStore.getState().load(res.json, fileNameFromUrl(url), text);
      // the view responses open in, from the extension's settings
      if (VIEWS.some((v) => v.id === view)) useStore.getState().setView(view);
      setWaiting(false);
    };
    window.addEventListener('message', onMessage);
    announceReady();
    return () => window.removeEventListener('message', onMessage);
  }, []);
  return waiting;
}

export default function App() {
  const waiting = useEmbedBoot();
  const model = useStore((s) => s.model);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const inspectorOpen = useStore((s) => s.inspectorOpen);
  const editorOpen = useStore((s) => s.editorOpen);
  const shortcutsOpen = useStore((s) => s.shortcutsOpen);
  const dragging = useDropLoader();
  useGlobalKeys();
  useUrlBoot();

  const active = VIEWS.find((v) => v.id === view) || VIEWS[0];
  const View = active.component;

  if (waiting) return null;

  return (
    <>
      {!model ? (
        <Landing />
      ) : (
        <div className="app">
          <TopBar />
          <Sidebar />
          <main className="stage">
            <ViewBoundary resetKey={view + model.nodes.length} label={active.label} onOpenTree={view !== 'tree' ? () => setView('tree') : null}>
              <div className="view" key={view + ':' + model.nodes.length}>
                <View {...(active.props || {})} />
              </div>
            </ViewBoundary>
          </main>
          {inspectorOpen && <Inspector />}
        </div>
      )}
      {editorOpen && model && <SourceEditor />}
      {shortcutsOpen && <Shortcuts />}
      {dragging && (
        <div className="drop-overlay">
          <div className="drop-frame" />
          <div className="drop-body">
            <span className="drop-icon"><Icon name="uploadFile" size={28} /></span>
            <span className="drop-title">Drop to open</span>
            <span className="drop-sub">The file is read in this tab and never leaves your machine.</span>
          </div>
        </div>
      )}
    </>
  );
}
