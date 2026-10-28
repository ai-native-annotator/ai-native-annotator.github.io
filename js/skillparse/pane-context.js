/**
 * Left pane: the registry's waves, the selected wave's for_each items (one episode each; pick
 * one and the other panes show it), and its context windows. A window is `range: [start, stop)` relative to the current item;
 * the presets set how many items before it the skills see (one sentence, five before, ...).
 */

import { h, clear, pretty } from './ui.js';
import { S, onRender, selectWave, selectItem, setWindow, waveDesc, runNextAll, startItem } from './core.js';
import { t } from './i18n.js';

const root = () => document.getElementById('context');

function exprText(e) {
  if (e && typeof e === 'object' && e.window) return `window ${e.window} [${e.range[0]}, ${e.range[1]})${e.pick ? ` pick ${e.pick}` : ''}`;
  return String(e);
}

function windowCard(wave, win) {
  const cur = win.override || win.range;
  const stop = win.range[1];             // keep the registry's stop: whether the item itself is included
  const before = -Math.min(0, cur[0]);
  const presets = stop >= 1
    ? [[t('thisOnly'), [0, 1]], [t('prevN', { n: 1 }), [-1, 1]], [t('prevN', { n: 3 }), [-3, 1]], [t('prevN', { n: 5 }), [-5, 1]], [t('prevN', { n: 10 }), [-10, 1]]]
    : [[t('thisOnly'), [0, 0]], [t('prevN', { n: 1 }), [-1, 0]], [t('prevN', { n: 3 }), [-3, 0]], [t('prevN', { n: 5 }), [-5, 0]], [t('prevN', { n: 10 }), [-10, 0]]];
  const num = h('input', { type: 'number', min: 0, max: 50, value: before, style: 'width:4.5em', 'aria-label': t('prevN', { n: 'N' }) });
  num.addEventListener('change', () => setWindow(win.var, [-Math.max(0, Number(num.value) || 0), cur[1]]));
  const inc = h('input', { type: 'checkbox', checked: cur[1] >= 1 });
  inc.addEventListener('change', () => setWindow(win.var, [cur[0], inc.checked ? 1 : 0]));
  return h('div', { class: 'win' },
    h('div', { class: 'row' }, h('strong', { text: t('windowTitle', { var: win.var }) }), h('span', { class: 'note', text: `(${win.where})` })),
    h('div', { class: 'note', text: t('windowSrc', { src: win.source, a: cur[0], b: cur[1] }) }),
    h('div', { class: 'row' }, h('label', { class: 'row' }, h('span', { text: t('winBefore') }), num, h('span', { text: t('winAfter') })),
      h('label', { class: 'row' }, inc, h('span', { text: t('withCurrent') }))),
    h('div', { class: 'presets' },
      presets.map(([label, rng]) => h('button', {
        class: 'chip', 'aria-pressed': String(cur[0] === rng[0] && cur[1] === rng[1]), text: label,
        onclick: () => setWindow(win.var, rng),
      })),
      h('button', { class: 'chip', 'aria-pressed': String(!win.override), text: t('default'), onclick: () => setWindow(win.var, null) })),
    win.override ? h('div', { class: 'note warn', text: t('restartNote') }) : null);
}

function contextView(ep) {
  if (!ep?.started) return h('div', { class: 'note', text: t('notStarted') });
  const ctx = ep.context || {};
  return h('dl', { class: 'kv' }, Object.entries(ctx).map(([k, v]) => [
    h('dt', { text: k }),
    h('dd', {}, typeof v === 'string' && v.length < 200 ? v
      : h('details', {}, h('summary', { text: Array.isArray(v) ? `[${v.length}]` : typeof v }), h('pre', { class: 'ctx-val', text: pretty(v) }))),
  ]));
}

function draw() {
  const el = root();
  if (!S.desc) { clear(el); return; }
  const wave = waveDesc();
  const tabs = h('div', { class: 'waves', role: 'tablist' }, S.desc.waves.map((w, k) => h('button', {
    class: 'wave-tab', role: 'tab', 'aria-selected': String(w.name === S.wave),
    text: `${t('wave', { n: k + 1 })} · ${w.name}`, onclick: () => selectWave(w.name),
  })));
  const spec = h('div', { class: 'card' },
    h('dl', { class: 'kv' },
      h('dt', { text: t('start') }), h('dd', { text: wave.start }),
      h('dt', { text: t('forEach') }), h('dd', { text: Object.entries(wave.for_each).map(([k, v]) => `${k} ← ${v}`).join('\n') || '(one episode)' }),
      h('dt', { text: t('parallel') }), h('dd', { text: String(wave.parallel) })),
    h('details', {}, h('summary', { text: t('contextVars') }),
      h('dl', { class: 'kv' }, Object.entries(wave.context).map(([k, v]) => [h('dt', { text: k }), h('dd', { text: exprText(v) })]))),
    h('details', {}, h('summary', { text: t('inputVars') }),
      h('dl', { class: 'kv' }, Object.entries(wave.input).map(([k, v]) => [h('dt', { text: k }), h('dd', { text: exprText(v) })]))),
    wave.windows.map((w) => windowCard(wave, w)));

  const list = h('ul', { class: 'items', role: 'listbox', 'aria-label': t('items', { n: S.items.length }) }, S.items.map((it) => {
    const st = it.status.replace('+stale', '');
    const live = [...S.live.keys()].some((k) => k.startsWith(`${S.wave}|${it.index}|`));
    return h('li', { role: 'option', 'aria-selected': String(it.index === S.item), onclick: () => selectItem(it.index) },
      h('span', { class: `dot ${live ? 'live' : st}${it.status.includes('stale') ? ' stale' : ''}`, title: live ? t('liveLlmShort') : it.status }),
      h('span', { class: 'n', text: it.index + 1 }), h('span', { class: 'lbl', text: it.label }));
  }));
  const ep = S.episode;
  const needs = ep?.needs?.length ? h('div', { class: 'card' },
    h('div', { class: 'warn', text: t('needs', { list: ep.needs.map(([w, i]) => `${w} #${i + 1}`).join(', ') }) }),
    h('div', { class: 'row' },
      h('button', { class: 'btn sm primary', text: `${t('goNeeds')}: ${ep.needs[0][0]} #${ep.needs[0][1] + 1}`,
        onclick: async () => { await selectWave(ep.needs[0][0]); await selectItem(ep.needs[0][1]); } }),
      h('button', { class: 'btn sm', text: t('restart'), onclick: () => startItem() }))) : null;

  clear(el, tabs, spec,
    h('div', { class: 'row', style: 'margin:6px 0' },
      h('strong', { class: 'grow', text: t('items', { n: S.items.length }) }),
      h('button', { class: 'btn sm', disabled: S.running > 0, text: t('nextAll'), title: t('nextAllTitle'),
        onclick: () => runNextAll() })),
    list,
    needs,
    h('div', { class: 'card', style: 'margin-top:8px' }, h('h4', { text: `${t('episodeCtx')} · #${S.item + 1}` }), contextView(ep)));
}

onRender(draw);
