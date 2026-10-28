/**
 * A line diff for showing what changed (a correction against the model's output, a proposed
 * edit against the file). Longest common subsequence; inputs here are a few hundred lines.
 *
 *   lineDiff(a, b) -> [{op: ' ' | '-' | '+', text}]
 */

export function lineDiff(a, b) {
  const x = String(a ?? '').split('\n');
  const y = String(b ?? '').split('\n');
  const n = x.length;
  const m = y.length;
  if (n * m > 4e6) {
    return [...x.map((text) => ({ op: '-', text })), ...y.map((text) => ({ op: '+', text }))];
  }
  const L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    }
  }
  const out = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) { out.push({ op: ' ', text: x[i] }); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) out.push({ op: '-', text: x[i++] });
    else out.push({ op: '+', text: y[j++] });
  }
  while (i < n) out.push({ op: '-', text: x[i++] });
  while (j < m) out.push({ op: '+', text: y[j++] });
  return out;
}

/** Only the changed lines and `context` lines around them; runs of equal lines become one '…'. */
export function hunks(diff, context = 2) {
  const keep = diff.map(() => false);
  diff.forEach((d, k) => {
    if (d.op !== ' ') for (let c = Math.max(0, k - context); c <= Math.min(diff.length - 1, k + context); c++) keep[c] = true;
  });
  const out = [];
  diff.forEach((d, k) => {
    if (keep[k]) out.push(d);
    else if (out.length && out[out.length - 1].op !== '…') out.push({ op: '…', text: '' });
  });
  return out;
}

/** JSON with sorted keys, so two outputs diff by content, not by key order. */
export function stable(value) {
  const sort = (v) => (Array.isArray(v) ? v.map(sort)
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort(v[k])])) : v);
  return jsonText(sort(value));
}

const entries = (o) => Object.entries(o).filter(([, x]) => x !== undefined);

/** One value on one line: `[1, 2]`, `{"var": "x", "span": [1, 1]}`. */
function inline(v) {
  if (Array.isArray(v)) return `[${v.map(inline).join(', ')}]`;
  if (v && typeof v === 'object') return `{${entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`).join(', ')}}`;
  return JSON.stringify(v) ?? 'null';
}

/** JSON for reading: an object one key per line, everything inside [] on one line. */
export function jsonText(value, indent = '') {
  if (Array.isArray(value) || !value || typeof value !== 'object') return inline(value);
  const kv = entries(value);
  if (!kv.length) return '{}';
  const pad = `${indent}  `;
  return `{\n${kv.map(([k, x]) => `${pad}${JSON.stringify(k)}: ${jsonText(x, pad)}`).join(',\n')}\n${indent}}`;
}
