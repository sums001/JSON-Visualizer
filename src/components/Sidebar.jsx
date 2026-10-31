import { useStore } from '../store';
import { VIEWS } from '../views';
import Icon from './Icons';
import { Kbd } from './common';

export default function Sidebar() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const setShortcutsOpen = useStore((s) => s.setShortcutsOpen);
  const groups = [...new Set(VIEWS.map((v) => v.group))];
  return (
    <nav className="sidebar">
      {groups.map((g) => (
        <div key={g} className="sb-group">
          <div className="sb-label">{g}</div>
          {VIEWS.map((v, i) =>
            v.group !== g ? null : (
              <button key={v.id} className={'sb-item' + (view === v.id ? ' on' : '')} onClick={() => setView(v.id)} title={`${v.desc}  (${i + 1})`}>
                <Icon name={v.icon} size={18} />
                <span className="lbl">{v.label}</span>
                <Kbd>{i + 1}</Kbd>
              </button>
            ),
          )}
        </div>
      ))}
      <button className="sb-item sb-foot" onClick={() => setShortcutsOpen(true)} title="Keyboard shortcuts  (?)">
        <Icon name="keyboard" size={18} />
        <span className="lbl">Shortcuts</span>
        <Kbd>?</Kbd>
      </button>
    </nav>
  );
}
