// Shape inference: generalises array indices to [*] so repeated structures collapse into one schema.
import { isContainer, isIsoDate, toNumber } from './model';

export function inferSchema(model) {
  const map = new Map();
  for (const n of model.nodes) {
    let s = map.get(n.gpath);
    if (!s) {
      s = {
        gpath: n.gpath,
        key: n.parent ? (typeof n.key === 'number' ? '[*]' : n.key) : 'root',
        depth: n.depth,
        parent: n.parent ? n.parent.gpath : null,
        types: {},
        count: 0,
        nodes: [],
        children: [],
        nums: [],
        distinct: new Map(),
        distinctOverflow: false,
        lenSum: 0,
        dates: 0,
      };
      map.set(n.gpath, s);
      if (n.parent) map.get(n.parent.gpath).children.push(s);
    }
    s.count++;
    s.types[n.type] = (s.types[n.type] || 0) + 1;
    if (s.nodes.length < 20000) s.nodes.push(n);
    if (n.type === 'number') s.nums.length < 20000 && s.nums.push(n.v);
    if (isContainer(n)) s.lenSum += n.children.length;
    else {
      if (n.type === 'string' && isIsoDate(n.v)) s.dates++;
      const k = String(n.v).slice(0, 80);
      if (s.distinct.has(k)) s.distinct.set(k, s.distinct.get(k) + 1);
      else if (s.distinct.size < 60) s.distinct.set(k, 1);
      else s.distinctOverflow = true;
    }
  }
  for (const s of map.values()) {
    const parent = s.parent ? map.get(s.parent) : null;
    if (parent && s.key !== '[*]') {
      const parentObjects = parent.types.object || 0;
      s.presence = parentObjects ? s.count / parentObjects : 1;
    } else s.presence = 1;
    s.mainType = Object.entries(s.types).sort((a, b) => b[1] - a[1])[0][0];
    s.mixed = Object.keys(s.types).filter((t) => t !== 'null').length > 1;
    s.nullable = !!s.types.null;
  }
  return map;
}

// Arrays-of-objects anywhere in the document become candidate "record sets" for tabular views.
export function findRecordSets(schema) {
  const sets = [];
  for (const s of schema.values()) {
    if ((s.key === '[*]' || s.gpath === '$') && (s.types.object || 0) >= Math.max(1, s.count * 0.6)) {
      const rows = s.nodes.filter((n) => n.type === 'object');
      if (s.gpath === '$' && rows.length === 1) {
        sets.push({ gpath: s.gpath, rows, depth: s.depth, label: '$ (root object)' });
        continue;
      }
      if (s.gpath === '$') continue;
      sets.push({ gpath: s.gpath, rows, depth: s.depth, label: s.gpath });
    }
  }
  sets.sort((a, b) => (b.rows.length >= 2) - (a.rows.length >= 2) || a.depth - b.depth || b.rows.length - a.rows.length);
  return sets;
}

// Profile every column of a record set so tables and charts know what each field "is".
export function profileRecords(rows) {
  const cols = new Map();
  rows.forEach((r) => {
    for (const c of r.children) {
      let col = cols.get(c.key);
      if (!col) {
        col = { key: c.key, count: 0, types: {}, numeric: 0, dates: 0, distinct: new Map(), overflow: false, firstSeen: cols.size };
        cols.set(c.key, col);
      }
      col.count++;
      col.types[c.type] = (col.types[c.type] || 0) + 1;
      if (toNumber(c) !== null && (c.type === 'number' || c.v.length < 24)) col.numeric++;
      if (c.type === 'string' && isIsoDate(c.v)) col.dates++;
      if (!isContainer(c)) {
        const k = String(c.v);
        if (col.distinct.has(k)) col.distinct.set(k, col.distinct.get(k) + 1);
        else if (col.distinct.size < 200) col.distinct.set(k, 1);
        else col.overflow = true;
      }
    }
  });
  const ID_KEY = /(^|_|-)id$|[a-z]Id$|ID$|^uuid|hash|address|^code$|^zip|phone/i;
  for (const col of cols.values()) {
    const nonNull = col.count - (col.types.null || 0);
    const idLike = ID_KEY.test(String(col.key)) && (col.types.string || 0) >= nonNull * 0.5;
    const nested = (col.types.object || 0) + (col.types.array || 0);
    col.presence = col.count / rows.length;
    if (nested > nonNull * 0.5) col.kind = 'nested';
    else if (col.types.boolean && col.types.boolean >= nonNull * 0.9) col.kind = 'boolean';
    else if (col.dates && col.dates >= nonNull * 0.9) col.kind = 'date';
    else if (!idLike && nonNull && col.numeric >= nonNull * 0.9 && !(col.types.string && col.distinct.size <= 2 && rows.length > 6)) col.kind = 'number';
    else if (!col.overflow && col.distinct.size <= Math.max(12, rows.length * 0.3) && col.distinct.size < rows.length) col.kind = 'category';
    else col.kind = 'text';
  }
  return [...cols.values()].sort((a, b) => a.firstSeen - b.firstSeen);
}
