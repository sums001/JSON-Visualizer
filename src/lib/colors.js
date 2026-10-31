// Type colours live in prism-tokens.css so both themes stay in sync; the DOM uses them as var()s.
export const TYPE_GLYPH = { object: '{}', array: '[]', string: '""', number: '#', boolean: '?', null: '∅' };

const known = (t) => (TYPE_GLYPH[t] ? t : 'null');
export const typeColor = (t) => `var(--prism-type-${known(t)})`;
export const typeSoft = (t) => `var(--prism-type-${known(t)}-soft)`;

// Canvas can't read var(), so resolve the tokens it draws with, once per theme.
const palettes = new Map();
export function palette(theme) {
  if (palettes.has(theme)) return palettes.get(theme);
  const cs = getComputedStyle(document.documentElement);
  const v = (name) => cs.getPropertyValue(`--prism-${name}`).trim();
  const p = {
    type: Object.fromEntries(Object.keys(TYPE_GLYPH).map((t) => [t, v(`type-${t}`)])),
    link: v('link'),
    accent: v('accent'),
    accentLine: v('accent-line'),
    accentSoft: v('accent-soft'),
    bg0: v('bg-0'),
    text1: v('text-1'),
    text2: v('text-2'),
    text3: v('text-3'),
  };
  palettes.set(theme, p);
  return p;
}
