import { $, el } from '../core/dom.js';

let hideTimer = null;

export function toast(message, isError = false, ms = 4200) {
  const host = $('#toast');
  if (!host) return;
  host.innerHTML = '';
  host.append(el('div', { class: `toast-msg${isError ? ' err' : ''}` }, message));
  host.classList.add('show');
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => host.classList.remove('show'), ms);
}
