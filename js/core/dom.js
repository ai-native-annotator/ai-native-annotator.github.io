/** Tiny DOM helpers — shared by every pane so no pane hand-rolls escaping. */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/**
 * Every form control this app builds gets an id and a name, whether or not the
 * caller thought to pass one.
 *
 * Chrome's Issues panel reports an input with neither as an accessibility
 * problem, and it is a real one: without an id there is nothing for a <label>
 * to point at, so a screen reader announces an unlabelled box. The controls are
 * created in a dozen places across the panes, and relying on each site to
 * remember is exactly how you end up with 25 of them. Assigning here means it
 * cannot be forgotten.
 */
const FORM_TAGS = new Set(['input', 'textarea', 'select']);
let fieldSeq = 0;
export const nextFieldId = () => `f${++fieldSeq}`;

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  if (FORM_TAGS.has(tag)) {
    if (!attrs.id) attrs = { ...attrs, id: nextFieldId() };
    // radios share a name on purpose — never overwrite one that was given
    if (!attrs.name) attrs = { ...attrs, name: attrs.id };
  }
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

/**
 * A labelled row: `<label for=…>` genuinely bound to its control.
 *
 * The panes all built this as a label and a control side by side inside a div,
 * with nothing connecting them — which looks right and is not: clicking the
 * label does nothing and assistive tech cannot pair them. Binding is one line,
 * but only if there is one place to put it.
 */
export function labelledRow(labelText, control, extra = null, rowClass = 'settings-row', labelClass = 'settings-label') {
  const label = el('label', { class: labelClass, for: control?.id || undefined }, labelText);
  return el('div', { class: rowClass }, label, control, extra);
}

/**
 * Append children to an existing element, skipping the empty ones.
 *
 * `el()` already filters null/undefined/false out of its children, but native
 * `append()` does not — it stringifies null into a literal "null" text node.
 * Every pane that builds a list with `cond ? el(...) : null` and appends it
 * directly has hit this, twice now in different files, and each time it shipped
 * a visible "null" in the UI. This is the one-line fix, in one place.
 */
export function mount(container, ...children) {
  container.append(...children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false));
  return container;
}
