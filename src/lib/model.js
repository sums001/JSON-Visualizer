// Core data model: flattens any JSON value into an indexed node tree that every view shares.

const IDENT = /^[A-Za-z_$][\w$]*$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const URL_RE = /^https?:\/\/\S+$/i;
const IMG_RE = /\.(png|jpe?g|gif|webp|svg|avif)(\?.*)?$/i;
const COLOR_RE = /^(#[0-9a-f]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\))$/i;

export const TYPES = ['object', 'array', 'string', 'number', 'boolean', 'null'];

export function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v === 'object' ? 'object' : typeof v === 'string' ? 'string' : typeof v === 'number' ? 'number' : typeof v === 'boolean' ? 'boolean' : 'null';
}

function childPath(parentPath, key) {
  if (typeof key === 'number') return `${parentPath}[${key}]`;
  return IDENT.test(key) ? `${parentPath}.${key}` : `${parentPath}[${JSON.stringify(key)}]`;
}

function primitiveSize(type, v) {
  if (type === 'string') return v.length + 2;
  if (type === 'number') return String(v).length;
  if (type === 'boolean') return v ? 4 : 5;
  return 4;
}

export function buildModel(json) {
  const nodes = [];
  let maxDepth = 0;

  function walk(value, key, parent, depth, index) {
    const type = typeOf(value);
    const node = {
      id: nodes.length,
      key,
      i: index,
      parent,
      depth,
      type,
      v: value,
      children: null,
      size: 0,
      count: 1,
      path: parent ? childPath(parent.path, key) : '$',
      gpath: parent ? (typeof key === 'number' ? `${parent.gpath}[*]` : `${parent.gpath}.${key}`) : '$',
    };
    nodes.push(node);
    if (depth > maxDepth) maxDepth = depth;

    if (type === 'object' || type === 'array') {
      const keys = type === 'object' ? Object.keys(value) : null;
      const n = type === 'object' ? keys.length : value.length;
      const kids = new Array(n);
      let size = 2 + Math.max(0, n - 1);
      let count = 1;
      for (let i = 0; i < n; i++) {
        const k = type === 'object' ? keys[i] : i;
        const c = walk(value[k], k, node, depth + 1, i);
        kids[i] = c;
        size += c.size + (type === 'object' ? k.length + 3 : 0);
        count += c.count;
      }
      node.children = kids;
      node.size = size;
      node.count = count;
    } else {
      node.size = primitiveSize(type, value);
    }
    return node;
  }

  const root = walk(json, 'root', null, 0, 0);
  return { root, nodes, maxDepth, json };
}

export const isContainer = (n) => n && (n.type === 'object' || n.type === 'array');

export function ancestors(node) {
  const out = [];
  let p = node;
  while (p) {
    out.unshift(p);
    p = p.parent;
  }
  return out;
}

const childMaps = new WeakMap();
export function getChild(node, key) {
  if (!node || !node.children) return undefined;
  if (node.type === 'array') return node.children[key];
  let m = childMaps.get(node);
  if (!m) {
    m = new Map(node.children.map((c) => [c.key, c]));
    childMaps.set(node, m);
  }
  return m.get(key);
}

// ---------- formatting ----------

export function formatBytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

export function formatNumber(n) {
  if (!Number.isFinite(n)) return String(n);
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (a >= 1e4) return `${(n / 1e3).toFixed(1)}K`;
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export function label(node) {
  if (!node.parent) return 'root';
  return String(node.key);
}

export function containerSummary(node) {
  const n = node.children.length;
  return node.type === 'array' ? `[${n}]` : `{${n}}`;
}

export function preview(node, max = 48) {
  switch (node.type) {
    case 'object':
      return `{ ${node.children.length} key${node.children.length === 1 ? '' : 's'} }`;
    case 'array':
      return `[ ${node.children.length} item${node.children.length === 1 ? '' : 's'} ]`;
    case 'string': {
      const s = node.v.length > max ? node.v.slice(0, max - 1) + '…' : node.v;
      return `"${s}"`;
    }
    default:
      return String(node.v);
  }
}

export function shortValue(node, max = 28) {
  if (isContainer(node)) return containerSummary(node);
  if (node.type === 'string') return node.v.length > max ? `"${node.v.slice(0, max - 1)}…"` : `"${node.v}"`;
  return String(node.v);
}

// ---------- string semantics ----------

export const isIsoDate = (s) => typeof s === 'string' && s.length >= 10 && s.length <= 35 && ISO_DATE.test(s) && !Number.isNaN(Date.parse(s));
export const isUrl = (s) => typeof s === 'string' && URL_RE.test(s);
export const isImageUrl = (s) => isUrl(s) && IMG_RE.test(s);
export const isColor = (s) => typeof s === 'string' && COLOR_RE.test(s.trim());

export function toNumber(node) {
  if (!node) return null;
  if (node.type === 'number') return node.v;
  if (node.type === 'string' && node.v.trim() !== '' && node.v.length < 32) {
    const n = Number(node.v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function toDate(node) {
  if (!node || node.type !== 'string' || !isIsoDate(node.v)) return null;
  return new Date(node.v);
}

// ---------- search ----------

export function searchNodes(model, query, limit = 5000) {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const ids = [];
  for (const n of model.nodes) {
    if (ids.length >= limit) break;
    const keyHit = n.parent && String(n.key).toLowerCase().includes(q);
    const valHit = !isContainer(n) && String(n.v).toLowerCase().includes(q);
    if (keyHit || valHit) ids.push(n.id);
  }
  return ids;
}

// Node ids whose subtree contains a match (so views can keep match paths lit).
export function matchTrail(model, ids) {
  const set = new Set();
  for (const id of ids) {
    let p = model.nodes[id];
    while (p && !set.has(p.id)) {
      set.add(p.id);
      p = p.parent;
    }
  }
  return set;
}
