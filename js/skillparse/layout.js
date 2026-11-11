/**
 * The four panes of the workspace (context, skills, the work in the middle, AI) fold: a button in
 * each pane's title folds it to a narrow strip with its name, and the strip opens it again. The
 * panes left open share the width. Which panes are folded is kept in this browser.
 */

import { h } from './ui.js';
import { t } from './i18n.js';

const KEY = 'skillparse_folded';
// each pane: its width open (as the stylesheet has it), and the title its strip shows
const PANES = [
  { id: 'pane-context', open: 'minmax(220px, 280px)', label: 'context' },
  { id: 'pane-skills', open: 'minmax(200px, 250px)', label: 'skills' },
  { id: 'pane-work', open: 'minmax(360px, 1fr)', label: 'generated', grow: true },
  { id: 'pane-ai', open: 'minmax(300px, 380px)', label: 'ai', grow: true },
];
const STRIP = '34px';

function folded() {
  try { return new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch { return new Set(); }
}

function keep(set) {
  try { localStorage.setItem(KEY, JSON.stringify([...set])); } catch { /* kept for this visit only */ }
}

function apply(set) {
  const ws = document.querySelector('.workspace');
  const open = PANES.filter((p) => !set.has(p.id));
  // the middle takes what is left; with it folded, the AI pane does; with both folded, the last open one
  const filler = open.find((p) => p.id === 'pane-work') || open.find((p) => p.grow) || open[open.length - 1];
  for (const p of PANES) {
    const el = document.getElementById(p.id);
    const shut = set.has(p.id);
    el.classList.toggle('folded', shut);
    el.querySelector('.fold-btn')?.setAttribute('aria-expanded', String(!shut));
  }
  // narrow screens stack the panes (the stylesheet's own columns); there a folded pane is only its strip
  if (window.matchMedia('(max-width: 1100px)').matches) {
    ws.style.gridTemplateColumns = '';
    return;
  }
  ws.style.gridTemplateColumns = PANES.map((p) => (set.has(p.id) ? STRIP : p === filler ? 'minmax(300px, 1fr)' : p.open)).join(' ');
}

function toggle(id) {
  const set = folded();
  if (set.has(id)) set.delete(id); else set.add(id);
  keep(set);
  apply(set);
}

export function setupFolding() {
  for (const p of PANES) {
    const el = document.getElementById(p.id);
    if (!el) continue;
    const head = el.querySelector('.pane-head');
    const btn = h('button', { class: 'fold-btn btn ghost sm icon', type: 'button', 'aria-expanded': 'true', 'aria-controls': p.id,
      title: t('fold'), 'aria-label': t('fold'), text: '⟨', onclick: () => toggle(p.id) });
    head.append(btn);
    el.append(h('button', { class: 'fold-strip', type: 'button', title: t('unfold'), 'aria-label': `${t('unfold')}: ${t(p.label)}`,
      onclick: () => toggle(p.id) }, h('span', { text: t(p.label) })));
  }
  apply(folded());
  window.matchMedia('(max-width: 1100px)').addEventListener('change', () => apply(folded()));
}

/** The labels follow the page's language. */
export function relabelFolding() {
  for (const p of PANES) {
    const el = document.getElementById(p.id);
    if (!el) continue;
    const btn = el.querySelector('.fold-btn');
    if (btn) { btn.title = t('fold'); btn.setAttribute('aria-label', t('fold')); }
    const strip = el.querySelector('.fold-strip');
    if (strip) {
      strip.title = t('unfold');
      strip.setAttribute('aria-label', `${t('unfold')}: ${t(p.label)}`);
      strip.querySelector('span').textContent = t(p.label);
    }
  }
}
