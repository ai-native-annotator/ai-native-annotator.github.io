/**
 * The three ways to work on a document. They are views of the same steps and the same export,
 * and can be switched at any time:
 *
 *   manual      the four panes: every wave, step, skill file and window by hand (the default)
 *   expert      mode-expert.js: the whole document generated, then corrected sentence by sentence
 *   apprentice  mode-apprentice.js: one step at a time, each explained, wave after wave
 *
 * The mode is kept in this browser, and `?mode=expert` in the address opens one.
 */

import { S, render } from './core.js';
import { readJson, writeJson } from './local.js';
import { addStrings } from './i18n.js';

addStrings({
  modeTitle: '怎么做这篇文档：手动（四栏，什么都能动）、专家（整篇生成，逐句改正）、学徒（一步一步，每步有讲解）',
  modeManual: '手动', modeExpert: '专家', modeApprentice: '学徒',
}, {
  modeTitle: 'How to work on this document: manual (four panes, everything by hand), expert (the whole document generated, corrected sentence by sentence), apprentice (one step at a time, each explained)',
  modeManual: 'Manual', modeExpert: 'Expert', modeApprentice: 'Apprentice',
});

const MODES = ['manual', 'expert', 'apprentice'];
const KEY = 'skillparse_mode';

export function setMode(mode) {
  S.mode = MODES.includes(mode) ? mode : 'manual';
  writeJson(KEY, S.mode);
  document.body.dataset.mode = S.mode;
  document.querySelectorAll('#mode-switch button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === S.mode)));
  render();
}

/** The mode asked for in the address, else the one used last; the switch in the toolbar. */
export function setupModes() {
  document.querySelectorAll('#mode-switch button').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
  setMode(new URLSearchParams(location.search).get('mode') || readJson(KEY, 'manual'));
}

/** Whether a key press is the page's to act on: not typed into a field, no dialog open, nothing running. */
export function freeKey(e) {
  if (e.defaultPrevented || e.isComposing || e.ctrlKey || e.altKey || e.metaKey) return false;
  if (!S.desc || !document.getElementById('modal').hidden) return false;
  const el = e.target instanceof Element ? e.target : null;
  return !el?.closest('input, textarea, select, button, a, summary, [contenteditable]:not([contenteditable="false"])');
}
