// Hands the browser a file to save.
export function saveFile(name, text, type = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  // revoking in the same tick can cancel the download in some browsers
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Downloads are always plain JSON, so "data.jsonl" or "log.txt" is saved as "data.json" / "log.json".
export function jsonFileName(name) {
  const base = (name || 'untitled').replace(/[\\/:*?"<>|]+/g, '_');
  return /\.(geo)?json$/i.test(base) ? base : base.replace(/\.(jsonl|ndjson|txt)$/i, '') + '.json';
}

export function saveJson(name, value) {
  saveFile(jsonFileName(name), JSON.stringify(value, null, 2) + '\n');
}
