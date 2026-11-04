/**
 * Time spent on each sentence, per wave: while this page has the focus (it is shown and its window
 * is the active one), the second goes to the item selected in the wave selected (the left pane's
 * sentence). Kept in this browser per procedure and document (localStorage `skillparse_time`):
 *
 *   {"<skillset>|<doc>": {"<wave>": {"<item index>": milliseconds}}}
 *
 * The toolbar shows the selected sentence's time in the selected wave; its menu lists every
 * sentence's time in each wave, with totals.
 */

import { S, onRender } from './core.js';
import { h, clear } from './ui.js';
import { t } from './i18n.js';

const KEY = 'skillparse_time';
const MAX_STEP = 5000;          // a longer gap (the computer slept) counts as this much at most
let times = load();
let last = performance.now();
let unsaved = false;

function load() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

function save() {
  if (!unsaved) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(times));
    unsaved = false;
  } catch { /* storage blocked: the times live as long as the page */ }
}

const docKey = () => (S.skillset && S.doc ? `${S.skillset}|${S.doc}` : null);
const active = () => document.visibilityState === 'visible' && document.hasFocus();

/** {wave: {item: ms}} of the open document. */
function ofDoc(make = false) {
  const k = docKey();
  if (!k) return null;
  if (!times[k] && make) times[k] = {};
  return times[k] || null;
}

function spent(wave, item) {
  return ofDoc()?.[wave]?.[item] || 0;
}

export function fmt(ms) {
  const s = Math.floor(ms / 1000);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return hh ? `${hh}:${String(mm).padStart(2, '0')}:${ss}` : `${mm}:${ss}`;
}

function tick() {
  const now = performance.now();
  const step = Math.min(now - last, MAX_STEP);
  last = now;
  if (!active() || !S.desc || S.wave == null || S.item == null) return;
  const doc = ofDoc(true);
  if (!doc) return;
  doc[S.wave] = doc[S.wave] || {};
  doc[S.wave][S.item] = Math.round((doc[S.wave][S.item] || 0) + step);
  unsaved = true;
  drawButton();
  if (!menu().hidden) drawMenu();
}

const button = () => document.getElementById('btn-timer');
const menu = () => document.getElementById('menu-timer');

function drawButton() {
  const b = button();
  if (!b) return;
  const on = active();
  b.textContent = `⏱ ${fmt(spent(S.wave, S.item))}`;
  b.classList.toggle('paused', !on);
  b.title = t('timerTitle', { n: S.item + 1, wave: S.wave || '' }) + (on ? '' : ` · ${t('timerPaused')}`);
}

function drawMenu() {
  const m = menu();
  const waves = (S.desc?.waves || []).map((w) => w.name);
  const doc = ofDoc() || {};
  const n = Math.max(S.items?.length || 0, ...waves.map((w) => Math.max(-1, ...Object.keys(doc[w] || {}).map(Number)) + 1));
  const total = (w) => Object.values(doc[w] || {}).reduce((a, b) => a + b, 0);
  const rows = [];
  for (let i = 0; i < n; i++) {
    const label = String(S.items?.[i]?.label ?? '');
    const sum = waves.reduce((a, w) => a + (doc[w]?.[i] || 0), 0);
    rows.push(h('tr', { class: i === S.item ? 'current' : undefined },
      h('td', { class: 'num', text: `#${i + 1}` }),
      h('td', { class: 'lbl', title: label, text: label.length > 18 ? `${label.slice(0, 18)}…` : label }),
      waves.map((w) => h('td', { class: `t${w === S.wave && i === S.item ? ' now' : ''}`, text: doc[w]?.[i] ? fmt(doc[w][i]) : '—' })),
      h('td', { class: 't sum', text: sum ? fmt(sum) : '—' })));
  }
  const all = waves.reduce((a, w) => a + total(w), 0);
  clear(m,
    h('div', { class: 'note', text: t('timerMenuNote') }),
    h('table', { class: 'timer-table' },
      h('thead', {}, h('tr', {}, h('th', { text: '' }), h('th', { text: t('timerSentence') }),
        waves.map((w) => h('th', { text: w })), h('th', { text: t('timerTotal') }))),
      h('tbody', {}, rows),
      h('tfoot', {}, h('tr', {}, h('td', {}), h('td', { text: t('timerTotal') }),
        waves.map((w) => h('td', { class: 't', text: fmt(total(w)) })), h('td', { class: 't sum', text: fmt(all) })))),
    h('div', { class: 'row' },
      h('button', { class: 'btn sm', text: t('timerReset'), onclick: (e) => {
        e.stopPropagation();
        if (!confirm(t('timerResetAsk', { doc: S.doc }))) return;
        delete times[docKey()];
        unsaved = true;
        save();
        drawButton();
        drawMenu();
      } })));
}

function wire() {
  const b = button();
  if (!b) return;
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    const m = menu();
    m.hidden = !m.hidden;
    if (!m.hidden) drawMenu();
  });
  menu().addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', () => { menu().hidden = true; });
  // a second the page did not have is not counted: start again from now
  const restart = () => { last = performance.now(); drawButton(); };
  window.addEventListener('focus', restart);
  window.addEventListener('blur', () => { tick(); drawButton(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { tick(); save(); } restart(); });
  window.addEventListener('pagehide', () => { tick(); save(); });
  setInterval(tick, 1000);
  setInterval(save, 10000);
  drawButton();
}

onRender(drawButton);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
else wire();
