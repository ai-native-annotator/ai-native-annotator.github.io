/**
 * Visible activity log drawer — every skill call and connector action shows
 * up here as it happens, success or failure, so nothing that "used a skill"
 * is only discoverable in devtools. See core/log.js.
 */

import { state, on } from '../core/state.js';
import { $, el } from '../core/dom.js';
import { t } from '../core/i18n.js';

let open = false;

export function mountLogPanel() {
  const btn = $('#btn-log');
  const panel = $('#log-panel');
  btn.onclick = () => { open = !open; panel.classList.toggle('show', open); renderLog(); };
  $('#log-panel-close').onclick = () => { open = false; panel.classList.remove('show'); };
  on('log', () => { updateBadge(); if (open) renderLog(); });
  updateBadge();
}

function updateBadge() {
  const badge = $('#log-badge');
  const errors = state.log.filter((e) => e.level === 'error').length;
  badge.textContent = errors ? String(errors) : '';
  badge.classList.toggle('show', errors > 0);
}

function renderLog() {
  const body = $('#log-panel-body');
  body.innerHTML = '';
  if (!state.log.length) {
    body.append(el('div', { class: 'empty sm' }, t('log.empty')));
    return;
  }
  for (const entry of state.log.slice().reverse()) {
    const time = new Date(entry.ts).toLocaleTimeString();
    body.append(el('div', { class: `log-row lvl-${entry.level}` },
      el('span', { class: 'log-time' }, time),
      el('span', { class: 'log-source' }, entry.source),
      el('span', { class: 'log-msg' }, entry.message),
    ));
  }
}
