import { useStore } from '../store';
import Icon from './Icons';
import { Kbd, MOD } from './common';

const GROUPS = [
  ['Views', [['1 – 8', 'Switch view'], ['/', 'Search'], [`${MOD} K`, 'Search'], [']', 'Toggle inspector'], ['?', 'This list']]],
  ['Selection', [['←', 'Parent'], ['→', 'First child'], ['↑ ↓', 'Previous / next sibling'], ['↵', 'Step through search hits']]],
  ['Canvas', [['Click', 'Select'], ['⇧ Click', 'Expand two levels'], ['Drag', 'Pan'], ['Wheel', 'Zoom']]],
  ['Source', [[`${MOD} ↵`, 'Visualize / apply'], [`${MOD} S`, 'Download JSON'], ['Esc', 'Close dialogs']]],
];

export default function Shortcuts() {
  const setShortcutsOpen = useStore((s) => s.setShortcutsOpen);
  const close = () => setShortcutsOpen(false);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal shortcuts">
        <div className="modal-head">
          <span className="mh-title">Keyboard shortcuts</span>
          <span className="spacer" />
          <button className="btn icon" onClick={close} title="Close"><Icon name="close" size={18} /></button>
        </div>
        <div className="sc-grid">
          {GROUPS.map(([title, rows]) => (
            <section key={title}>
              <h4>{title}</h4>
              {rows.map(([k, t]) => (
                <div key={k + t} className="sc-line">
                  <span>{t}</span>
                  <Kbd>{k}</Kbd>
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
