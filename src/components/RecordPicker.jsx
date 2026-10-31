import { useStore } from '../store';
import Icon from './Icons';
import { EmptyState, TypeDot } from './common';

export function useRecordSet() {
  const recordSets = useStore((s) => s.recordSets);
  const recordPath = useStore((s) => s.recordPath);
  return recordSets.find((r) => r.gpath === recordPath) || recordSets[0] || null;
}

export default function RecordPicker() {
  const recordSets = useStore((s) => s.recordSets);
  const setRecordPath = useStore((s) => s.setRecordPath);
  const current = useRecordSet();
  if (!recordSets.length) return null;
  return (
    <label className="picker" title="Which array of records the table shows">
      <TypeDot type="array" />
      <select value={current?.gpath} onChange={(e) => setRecordPath(e.target.value)}>
        {recordSets.map((r) => (
          <option key={r.gpath} value={r.gpath}>
            {r.label.replace(/\[\*\]$/, '')} · {r.rows.length.toLocaleString()}
          </option>
        ))}
      </select>
      <Icon name="unfoldMore" size={14} />
    </label>
  );
}

export function NoRecords() {
  return (
    <EmptyState icon="table" title="Nothing to tabulate here">
      <p>Table needs an array of objects, and this document doesn’t have one. Tree, Schema and Raw work with any shape.</p>
    </EmptyState>
  );
}
