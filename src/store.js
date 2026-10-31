import { create } from 'zustand';
import { buildModel, isContainer, matchTrail, searchNodes } from './lib/model';
import { findRecordSets, inferSchema } from './lib/schema';
import { saveJson } from './lib/file';

// Long child lists are shown through a window so a 4,000-item array never renders as one giant column.
// Objects are usually read whole, so they get a much larger window than arrays.
export const DEFAULT_WINDOW = 20;
export const OBJECT_WINDOW = 60;
const SLACK = 5; // never leave a pager for just a handful of items
export const MIN_SHOWN = 10; // "show less" stops here; closing the card hides the rest

export const defaultWindow = (node) => (node.type === 'object' ? OBJECT_WINDOW : DEFAULT_WINDOW);
// Long enough to be windowed at all, so its pager stays up even while every child is shown.
export const isPaged = (node) => node.children.length > defaultWindow(node) + SLACK;

export function childWindow(windows, node) {
  const total = node.children.length;
  const w = windows.get(node.id);
  let start = w ? Math.min(w.start, Math.max(0, total - 1)) : 0;
  if (start <= SLACK) start = 0;
  let end = Math.min(total, start + (w ? w.count : defaultWindow(node)));
  if (total - end <= SLACK) end = total;
  return { start, end };
}

function initialExpanded(root) {
  const set = new Set([root.id]);
  if (root.children && root.children.length <= 60) {
    const first = root.children.find(isContainer);
    if (first) set.add(first.id);
  }
  return set;
}

export const useStore = create((set, get) => ({
  model: null,
  schema: null,
  recordSets: [],
  source: '',
  name: '',
  view: 'tree',
  selectedId: 0,
  hoverId: null,
  expanded: new Set(),
  windows: new Map(),
  query: '',
  matches: null,
  matchSet: null,
  trail: null,
  recordPath: null,
  inspectorOpen: true,
  editorOpen: false,
  shortcutsOpen: false,
  revealTick: 0,
  theme: document.documentElement.dataset.theme === 'light' ? 'light' : 'dark',

  setTheme(theme) {
    // the attribute goes first: canvas views read the resolved tokens when they re-render
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('prism-theme', theme);
    } catch {
      /* private mode: the choice just won't persist */
    }
    set({ theme });
  },

  toggleTheme() {
    get().setTheme(get().theme === 'dark' ? 'light' : 'dark');
  },

  load(json, name = 'untitled.json', source) {
    const model = buildModel(json);
    const schema = inferSchema(model);
    const recordSets = findRecordSets(schema);
    set({
      model,
      schema,
      recordSets,
      name,
      source: source ?? JSON.stringify(json, null, 2),
      selectedId: model.root.id,
      hoverId: null,
      expanded: initialExpanded(model.root),
      windows: new Map(),
      query: '',
      matches: null,
      matchSet: null,
      trail: null,
      recordPath: recordSets[0]?.gpath ?? null,
      editorOpen: false,
    });
  },

  download() {
    const { model, name } = get();
    if (model) saveJson(name, model.root.v);
  },

  close() {
    set({ model: null, schema: null, recordSets: [], source: '', name: '' });
  },

  setView(view) {
    set({ view });
  },

  select(id, { reveal = true } = {}) {
    const { model, expanded } = get();
    if (!model || id == null) return;
    const node = model.nodes[id];
    if (!node) return;
    let next = expanded;
    if (reveal) {
      next = new Set(expanded);
      let p = node.parent;
      while (p) {
        next.add(p.id);
        p = p.parent;
      }
      // slide each ancestor's window so the selected node is in view (rather than growing the list)
      const windows = new Map(get().windows);
      let c = node;
      while (c.parent) {
        const { start, end } = childWindow(windows, c.parent);
        const count = defaultWindow(c.parent);
        if (c.i < start || c.i >= end) windows.set(c.parent.id, { start: Math.max(0, c.i - Math.floor(count / 2)), count });
        c = c.parent;
      }
      set({ windows });
    }
    set((s) => ({ selectedId: id, expanded: next, revealTick: s.revealTick + 1 }));
  },

  hover(id) {
    if (get().hoverId !== id) set({ hoverId: id });
  },

  toggle(id) {
    const expanded = new Set(get().expanded);
    if (expanded.has(id)) expanded.delete(id);
    else expanded.add(id);
    set({ expanded });
  },

  expandAll(id, depth = 2) {
    const { model } = get();
    const expanded = new Set(get().expanded);
    const walk = (n, d) => {
      if (!isContainer(n) || d > depth) return;
      expanded.add(n.id);
      n.children.forEach((c) => walk(c, d + 1));
    };
    walk(model.nodes[id], 0);
    set({ expanded });
  },

  collapseAll(id) {
    const { model } = get();
    const expanded = new Set(get().expanded);
    const walk = (n) => {
      if (!isContainer(n)) return;
      expanded.delete(n.id);
      n.children.forEach(walk);
    };
    walk(model.nodes[id]);
    if (id === model.root.id) expanded.add(id);
    set({ expanded });
  },

  showMore(id, amount = DEFAULT_WINDOW) {
    const windows = new Map(get().windows);
    const { start, end } = childWindow(windows, get().model.nodes[id]);
    windows.set(id, { start, count: end - start + amount });
    set({ windows });
  },

  // Drop rows off the end of the window, never below MIN_SHOWN.
  showLess(id, amount = DEFAULT_WINDOW) {
    const windows = new Map(get().windows);
    const { start, end } = childWindow(windows, get().model.nodes[id]);
    windows.set(id, { start, count: Math.max(MIN_SHOWN, end - start - amount) });
    set({ windows });
  },

  showAll(id) {
    const windows = new Map(get().windows);
    windows.set(id, { start: 0, count: get().model.nodes[id].children.length });
    set({ windows });
  },

  // Back to the first page.
  resetWindow(id) {
    const windows = new Map(get().windows);
    windows.delete(id);
    set({ windows });
  },

  showEarlier(id, amount = DEFAULT_WINDOW) {
    const windows = new Map(get().windows);
    const w = windows.get(id) ?? { start: 0, count: defaultWindow(get().model.nodes[id]) };
    const start = Math.max(0, w.start - amount);
    windows.set(id, { start, count: w.count + (w.start - start) });
    set({ windows });
  },

  setQuery(query) {
    const { model } = get();
    const ids = model ? searchNodes(model, query) : null;
    set({
      query,
      matches: ids,
      matchSet: ids ? new Set(ids) : null,
      trail: ids ? matchTrail(model, ids) : null,
    });
  },

  setRecordPath(recordPath) {
    set({ recordPath });
  },

  toggleInspector() {
    set((s) => ({ inspectorOpen: !s.inspectorOpen }));
  },

  setEditorOpen(editorOpen) {
    set({ editorOpen });
  },

  setShortcutsOpen(shortcutsOpen) {
    set({ shortcutsOpen });
  },

  // keyboard navigation over the node tree
  navigate(dir) {
    const { model, selectedId } = get();
    if (!model) return;
    const n = model.nodes[selectedId];
    let target = null;
    if (dir === 'parent') target = n.parent;
    else if (dir === 'child') target = n.children?.[0];
    else if (dir === 'next') target = n.parent?.children[n.i + 1];
    else if (dir === 'prev') target = n.parent?.children[n.i - 1];
    if (target) get().select(target.id);
  },
}));
