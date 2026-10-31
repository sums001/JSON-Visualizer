import { useMemo, useRef, useState } from 'react';
import { highlightJson } from './common';

export const LINE_H = 20;
const PAD = 12;
const ABOVE = 20; // lines highlighted above the first visible one
const SPAN = 100; // lines highlighted in total, enough for a tall window
const SLICE_LIMIT = 60000; // a slice longer than this (one huge minified line) stays plain

// A textarea with a line gutter and JSON highlighting: the coloured text is a <pre> drawn under
// a transparent textarea. Only the lines around the viewport are highlighted, so large files
// stay quick to type in; JSON tokens never span lines, so a slice highlights the same as the whole.
export default function CodeArea({ value, onChange, onKeyDown, placeholder, errorLine, textareaRef, autoFocus }) {
  const hlRef = useRef(null);
  const gutterRef = useRef(null);
  const errRef = useRef(null);
  const scroll = useRef({ top: 0, left: 0 });
  const [first, setFirst] = useState(0);
  const firstRef = useRef(0);
  const lines = useMemo(() => value.split('\n'), [value]);
  const numbers = useMemo(() => Array.from({ length: lines.length }, (_, i) => i + 1).join('\n'), [lines.length]);
  const slice = lines.slice(first, first + SPAN).join('\n');
  const colored = useMemo(() => (slice.length <= SLICE_LIMIT ? highlightJson(slice) : slice), [slice]);

  const hlTransform = () => `translate(${-scroll.current.left}px, ${firstRef.current * LINE_H - scroll.current.top}px)`;

  const onScroll = (e) => {
    const { scrollTop: top, scrollLeft: left } = e.currentTarget;
    scroll.current = { top, left };
    const want = Math.max(0, Math.floor(top / LINE_H) - ABOVE);
    if (Math.abs(want - firstRef.current) > 15) {
      firstRef.current = want;
      setFirst(want);
    }
    hlRef.current.style.transform = hlTransform();
    gutterRef.current.style.transform = `translateY(${-top}px)`;
    if (errRef.current) errRef.current.style.transform = `translateY(${-top}px)`;
  };

  return (
    <div className={'code-area' + (value ? '' : ' is-empty')}>
      <div className="ca-gutter" aria-hidden="true">
        <div ref={gutterRef} style={{ transform: `translateY(${-scroll.current.top}px)` }}>{numbers}</div>
      </div>
      <div className="ca-main">
        {errorLine && (
          <div ref={errRef} className="ca-errline" style={{ top: PAD + (errorLine - 1) * LINE_H, transform: `translateY(${-scroll.current.top}px)` }} />
        )}
        <pre ref={hlRef} className="ca-hl" aria-hidden="true" style={{ transform: hlTransform() }}>
          {colored}
          {'\n'}
        </pre>
        <textarea
          ref={textareaRef}
          className="ca-input"
          spellCheck={false}
          wrap="off"
          autoFocus={autoFocus}
          value={value}
          placeholder={placeholder}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onScroll={onScroll}
        />
      </div>
    </div>
  );
}

// Character offset of a 1-based line / column, for jumping the caret to a parse error.
export function offsetOf(text, line, col) {
  const lines = text.split('\n');
  let pos = 0;
  for (let i = 0; i < Math.min(line - 1, lines.length); i++) pos += lines[i].length + 1;
  return pos + Math.max(0, col - 1);
}
