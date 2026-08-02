/** Tiny DOM helpers — shared by every pane so no pane hand-rolls escaping. */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

/** Syntax-highlight a JSON value for display. */
export function jsonHtml(value, indent = 2) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, indent);
  return esc(text)
    .replace(/&quot;([^&]*?)&quot;(\s*:)/g, '<span class="j-key">"$1"</span>$2')
    .replace(/:\s*&quot;([^&]*?)&quot;/g, ': <span class="j-str">"$1"</span>')
    .replace(/:\s*(-?\d+\.?\d*)/g, ': <span class="j-num">$1</span>')
    .replace(/\b(true|false|null)\b/g, '<span class="j-lit">$1</span>');
}

export function download(filename, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = el('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Format a duration in ms as a short human string. */
export function fmtMs(ms) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
