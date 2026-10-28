/** Small DOM helpers. Text always goes in as text, never as HTML. */

import { jsonText } from './diff.js';

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el, ...children) {
  el.replaceChildren(...children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false));
  return el;
}

let toastTimer = null;
export function toast(text, ms = 3500) {
  const el = document.getElementById('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

let onClose = null;
export function openModal(title, body, { wide = true, close } = {}) {
  const m = document.getElementById('modal');
  document.getElementById('modal-title').textContent = title;
  clear(document.getElementById('modal-body'), body);
  m.querySelector('.modal-card').style.width = wide ? '' : 'min(640px, 100%)';
  m.hidden = false;
  onClose = close || null;
  return m;
}

export function closeModal() {
  document.getElementById('modal').hidden = true;
  const fn = onClose;
  onClose = null;
  fn?.();
}

export function download(name, text, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function pretty(v) {
  return typeof v === 'string' ? v : jsonText(v);
}

/** A diff rendered as lines (see diff.js). */
export function diffView(lines) {
  return h('div', { class: 'diff' }, lines.map((d) => (d.op === '…' ? h('span', { class: 'gap', text: '⋯' })
    : h('span', { class: d.op === '-' ? 'del' : d.op === '+' ? 'ins' : '' , text: `${d.op === ' ' ? ' ' : d.op} ${d.text}` }))));
}
