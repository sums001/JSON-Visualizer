import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { parseInput } from '../lib/parse';
import Icon from './Icons';
import CodeArea, { LINE_H, offsetOf } from './CodeArea';
import { Kbd, MOD } from './common';

export default function SourceEditor() {
  const source = useStore((s) => s.source);
  const name = useStore((s) => s.name);
  const setEditorOpen = useStore((s) => s.setEditorOpen);
  const [text, setText] = useState(source);
  const [check, setCheck] = useState(null);
  const taRef = useRef(null);
  const close = () => setEditorOpen(false);

  useEffect(() => {
    const t = setTimeout(() => {
      const res = parseInput(text);
      setCheck(res.error ? { ...res, src: text } : { ok: true, json: res.json, src: text });
    }, text.length > 200000 ? 400 : 150);
    return () => clearTimeout(t);
  }, [text]);

  const error = check?.error && check.src === text ? check : null;

  // re-parse, then put the selection back if its path still exists
  const apply = () => {
    const res = check?.ok && check.src === text ? check : parseInput(text);
    if (res.error) return setCheck({ ...res, src: text });
    const s = useStore.getState();
    const keepPath = s.model.nodes[s.selectedId]?.path;
    const view = s.view;
    s.load(res.json, name, text);
    s.setView(view);
    const next = useStore.getState().model;
    const hit = keepPath && next.nodes.find((n) => n.path === keepPath);
    if (hit) useStore.getState().select(hit.id);
  };

  const reformat = (indent) => {
    const res = parseInput(text);
    if (res.error) return setCheck({ ...res, src: text });
    setText(JSON.stringify(res.json, null, indent));
  };

  const goToError = () => {
    const ta = taRef.current;
    if (!ta || !error?.line) return;
    const pos = offsetOf(text, error.line, error.col);
    ta.focus();
    ta.setSelectionRange(pos, pos);
    ta.scrollTop = Math.max(0, (error.line - 1) * LINE_H - ta.clientHeight / 3);
  };

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal editor">
        <div className="modal-head">
          <span className="mh-title">Source</span>
          <span className="mh-sub mono">{name}{text !== source ? ' · edited' : ''}</span>
          <span className="spacer" />
          <button className="btn ghost" onClick={() => reformat(2)}><Icon name="format" size={16} />Format</button>
          <button className="btn ghost" onClick={() => reformat(0)}>Minify</button>
          <button className="btn icon" onClick={close} title="Close (Esc)"><Icon name="close" size={18} /></button>
        </div>
        <div className="modal-code">
          <CodeArea
            value={text}
            textareaRef={taRef}
            autoFocus
            errorLine={error?.line}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) apply();
              if (e.key === 'Escape') close();
            }}
          />
        </div>
        {error && (
          <div className="err-bar">
            <Icon name="alert" size={16} />
            <span className="eb-msg">{error.error}</span>
            {error.line && <span className="mono eb-loc">Ln {error.line}, Col {error.col}</span>}
            {error.line && <button className="eb-go" onClick={goToError}>Go to error</button>}
          </div>
        )}
        <div className="modal-foot">
          <span className="mf-note">Applying re-parses the file and keeps your selection when the path still exists.</span>
          <span className="spacer" />
          <button className="btn lg" onClick={close}>Cancel</button>
          <button className="btn lg primary" onClick={apply} disabled={!!error}>
            Apply
            <Kbd>{MOD} ↵</Kbd>
          </button>
        </div>
      </div>
    </div>
  );
}
