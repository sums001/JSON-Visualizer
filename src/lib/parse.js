// Parses JSON (or JSON Lines) and returns a friendly error location on failure.
export function parseInput(text) {
  const src = text.replace(/^﻿/, '');
  try {
    return { json: JSON.parse(src) };
  } catch (err) {
    const lines = src.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length > 1) {
      try {
        return { json: lines.map((l) => JSON.parse(l)), note: 'Parsed as JSON Lines' };
      } catch {
        /* fall through to the original error */
      }
    }
    const msg = String(err.message || err);
    let pos = null;
    const m = msg.match(/position (\d+)/i);
    if (m) pos = Number(m[1]);
    let line = null;
    let col = null;
    const lc = msg.match(/line (\d+) column (\d+)/i);
    if (lc) {
      line = Number(lc[1]);
      col = Number(lc[2]);
    } else if (pos != null) {
      const before = src.slice(0, pos).split('\n');
      line = before.length;
      col = before[before.length - 1].length + 1;
    }
    // engines append the location in their own words; it is shown separately as Ln / Col
    const clean = msg
      .replace(/^JSON\.parse: /, '')
      .replace(/\s*in JSON at position \d+.*$/i, '')
      .replace(/\s*at line \d+ column \d+ of the JSON data$/i, '')
      .replace(/\s*\(line \d+ column \d+\)/i, '');
    return { error: clean.charAt(0).toUpperCase() + clean.slice(1), line, col };
  }
}

// Node count and depth of a parsed value, without building the full model.
export function measure(json) {
  let nodes = 0;
  let depth = 0;
  const walk = (v, d) => {
    nodes++;
    if (d > depth) depth = d;
    if (v && typeof v === 'object') for (const k in v) walk(v[k], d + 1);
  };
  walk(json, 0);
  return { nodes, depth };
}
