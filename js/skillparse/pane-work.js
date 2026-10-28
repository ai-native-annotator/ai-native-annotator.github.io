/**
 * Middle pane. Top: the sentence's graph as it stands (drawn, with the selected step's part
 * marked; click a box to go to the step that made it), and the selected step: its output (with
 * its own graph fragment drawn), input, Jev's questions and answers, prompt, and the sentence's
 * .umr text. The output can be edited: the edit is saved as the human result of the step and
 * everything under it is redone from it. Bottom: the item's steps as a tree; click to select,
 * ▶ to run.
 */

import { h, clear, pretty, toast, diffView } from './ui.js';
import { S, onRender, render, selectNode, selectWave, selectItem, runNode, runItem, resetNode, saveOutput, startItem, sentenceGraph } from './core.js';
import { drawGraph, fragmentGraph } from './graph-view.js';
import { lineDiff, hunks, stable } from './diff.js';
import { t } from './i18n.js';

const LABEL = { graph: 'tabGraph', output: 'tabOutput', input: 'tabInput', jev: 'tabJev', prompt: 'tabPrompt', tools: 'tabTools', umr: 'tabUmr' };

function tabsFor(d) {
  const out = ['graph'];
  if (d) {
    out.push('output', 'input');
    if (d.kind === 'jev') out.push('jev');
    if (d.kind === 'agent') out.push('prompt', 'tools');
  }
  out.push('umr');
  return out;
}

function outputTab(d) {
  if (d.status === 'pending' && !d.waiting) {
    return h('div', {}, h('div', { class: 'empty', text: '—' }),
      h('button', { class: 'btn primary', text: t('run'), disabled: S.running > 0, onclick: () => runNode(d.id) }));
  }
  const text = d.output ? stable(d.output) : '';
  if (S.editing) {
    const area = h('textarea', { rows: 22, spellcheck: 'false' });
    area.value = text;
    const err = h('div', { class: 'err' });
    return h('div', { style: 'display:grid;gap:6px' }, area,
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', text: t('saveCorrection'), onclick: async () => {
          let value;
          try { value = JSON.parse(area.value); } catch (e) { err.textContent = t('badJson', { e: e.message }); return; }
          const r = await saveOutput(value);
          if (r?.status === 'error') toast(`${t('error')}: ${r.error}`);
          else toast(t('saved'));
        } }),
        h('button', { class: 'btn', text: t('cancel'), onclick: () => { S.editing = false; render(); } }), err));
  }
  const parts = [];
  if (d.error) parts.push(h('div', { class: 'card err' }, h('strong', { text: `${t('error')}: ` }), d.error, d.trace ? h('details', {}, h('summary', { text: 'trace' }), h('pre', { text: d.trace })) : null));
  if (d.problems?.length) parts.push(h('div', { class: 'card warn' }, h('strong', { text: `${t('retried')}: ` }), d.problems.join('; ')));
  if (d.human) {
    parts.push(h('div', { class: 'row' }, h('span', { class: 'human-tag', text: t('humanTag') }),
      h('span', { class: 'note', text: t('human') })));
  }
  const frag = fragmentGraph(d.output);
  if (frag) {
    parts.push(h('div', { class: 'note', text: t('fragment') }),
      h('div', { class: 'graph-wrap' }, drawGraph(frag.graph, { dashed: frag.dashed })));
  }
  parts.push(h('pre', { class: 'block', text: text || '—' }));
  if (d.human && d.machine_output) {
    parts.push(h('details', {}, h('summary', { text: t('machine') }), diffView(hunks(lineDiff(stable(d.machine_output), text), 2))));
  }
  if (d.children?.length) parts.push(h('div', { class: 'note', text: `${t('children')}: ${d.children.join(', ')}` }));
  if (d.dropped?.length) parts.push(h('details', {}, h('summary', { text: `${t('dropped')} (${d.dropped.length})` }), h('pre', { text: pretty(d.dropped) })));
  parts.push(h('div', { class: 'row' },
    d.output ? h('button', { class: 'btn', text: t('edit'), onclick: () => { S.editing = true; render(); } }) : null,
    h('button', { class: 'btn', text: t('rerun'), disabled: S.running > 0, onclick: () => runNode(d.id) })));
  return h('div', { style: 'display:grid;gap:6px' }, parts);
}

function inputTab(d) {
  return h('pre', { class: 'block', text: pretty(d.input) });
}

function answerLine(q, a) {
  if (!a) return h('span', { class: 'note', text: '…' });
  const who = a.by ? h('span', { class: `badge by-${a.by}`, text: a.by === 'jev' ? 'Jev' : a.by === 'haiku' ? 'Haiku' : t('humanTag') }) : null;
  if ('noul' in a) return h('span', {}, h('span', { class: 'bar', style: `width:${Math.round(a.noul * 60)}px` }), `yes ${Number(a.noul).toFixed(2)} `, who);
  if (a.probabilities) {
    const top = Object.entries(a.probabilities).sort((x, y) => y[1] - x[1]).slice(0, 3).filter(([, p], k) => p >= 0.01 || k === 0);
    return h('span', {}, top.map(([o, p]) => h('span', { style: 'margin-right:10px' }, h('span', { class: 'bar', style: `width:${Math.round(p * 60)}px` }), `${o} ${Number(p).toFixed(2)}`)), who);
  }
  return h('span', { text: JSON.stringify(a) });
}

function jevTab(d) {
  if (!d.rounds?.length) return h('div', { class: 'empty', text: t('noRounds') });
  return h('div', {}, d.rounds.map((r, k) => h('details', { open: k === d.rounds.length - 1 },
    h('summary', { text: `${t('round', { n: k + 1 })} · ${t('questions', { n: Object.keys(r.questions || {}).length })}` }),
    h('details', {}, h('summary', { text: 'state' }), h('pre', { class: 'block', text: pretty(r.state) })),
    Object.entries(r.questions || {}).map(([id, q]) => h('div', { class: 'qa' },
      h('div', { class: 'q' }, h('code', { text: id }), ` (${q.type}) `,
        typeof q.instructions === 'string' ? q.instructions.slice(0, 300) : Object.entries(q.instructions || {}).map(([a, b]) => `${a}: ${b}`).join(' · ').slice(0, 300)),
      q.type === 'choice' ? h('details', {}, h('summary', { text: `${Object.keys(q.criteria || {}).length} options` }),
        h('ul', {}, Object.entries(q.criteria || {}).map(([o, desc]) => h('li', {}, h('code', { text: o }), desc ? ` — ${String(desc).slice(0, 200)}` : '')))) : null,
      h('div', { class: 'a' }, answerLine(q, r.answers?.[id])))))));
}

function promptTab(d) {
  const p = d.prompt;
  if (!p) return h('div', { class: 'empty', text: t('noPrompt') });
  return h('div', { style: 'display:grid;gap:6px' },
    h('details', {}, h('summary', { text: 'system' }), h('pre', { class: 'block', text: p.system })),
    h('details', {}, h('summary', { text: 'instructions (skill.md)' }), h('pre', { class: 'block', text: p.instructions })),
    h('details', { open: true }, h('summary', { text: 'input' }), h('pre', { class: 'block', text: p.input })));
}

function toolsTab(d) {
  const calls = d.tool_calls || [];
  if (!calls.length) return h('div', { class: 'empty', text: t('noTools') });
  return h('div', {}, calls.map((c) => h('div', { class: 'qa' },
    h('div', { class: 'q mono', text: `${c.tool}(${JSON.stringify(c.args)})` }),
    h('details', {}, h('summary', { text: `${String(c.result).length} chars` }), h('pre', { class: 'block', text: c.result })))));
}

/** Go to the step that made a variable of the sentence graph (it is a node of the sentence wave). */
async function goToMaker(g, v) {
  const n = g.nodes.find((x) => x.var === v);
  if (!n?.node) return;
  const sentenceWave = S.desc.waves[0].name;
  const item = S.item;
  if (S.wave !== sentenceWave) {
    await selectWave(sentenceWave);
    await selectItem(item);
  }
  S.tab = 'graph';
  await selectNode(n.node);
}

let fit = true;

function graphPanel(g) {
  const tokens = h('div', { class: 'tokens' }, g.tokens.map((w, k) => h('span', { class: 'tok', 'data-k': k + 1 }, w, h('sub', { text: k + 1 }))));
  const onHover = (v) => {
    tokens.querySelectorAll('.tok.on').forEach((x) => x.classList.remove('on'));
    const n = v && g.nodes.find((x) => x.var === v);
    if (!n || !n.align || n.align === '0-0') return;
    const [lo, hi] = n.align.split('-').map(Number);
    for (let k = lo; k <= hi; k++) tokens.querySelector(`[data-k="${k}"]`)?.classList.add('on');
  };
  const sentenceWave = S.desc.waves[0].name;
  const mine = new Set(S.wave === sentenceWave && S.node ? g.nodes.filter((n) => n.node === S.node).map((n) => n.var) : []);
  const parts = [h('div', { class: 'graph-tools' },
    h('strong', { text: t('graphOf', { n: g.index }) }),
    h('span', { class: 'note', text: t('graphHelp') }),
    h('span', { class: 'grow' }),
    h('button', { class: 'btn sm ghost', text: fit ? '100%' : t('fit'), onclick: () => { fit = !fit; render(); } })),
  tokens];
  if (g.error) parts.push(h('div', { class: 'err', text: g.error }));
  if (!g.nodes.length) {
    parts.push(h('div', { class: 'empty', text: t('noGraph') }));
  } else {
    parts.push(h('div', { class: `graph-wrap${fit ? ' fit' : ''}` },
      drawGraph(g, { highlight: mine, onPick: (v) => goToMaker(g, v), onHover })));
  }
  if (g.doc.length) {
    const name = (x) => { const n = g.nodes.find((m) => m.var === x); return n ? `${x}/${n.concept}` : x; };
    parts.push(h('details', { open: S.wave !== sentenceWave },
      h('summary', { text: t('docRels', { n: g.doc.length }) }),
      h('div', {}, g.doc.map((r) => h('div', { class: 'doc-rel', text: `${r.group}: ${name(r.a)} :${r.rel} ${name(r.b)}` })))));
  }
  return h('div', { class: 'graph-panel' }, parts);
}

let shown = '';

async function graphTab(out, d) {
  const key = `${S.skillset}|${S.doc}|${S.wave}|${S.item}|${S.node}|${S.graphStamp}|${fit}`;
  if (shown === key && out.querySelector('.graph-panel')) return;
  if (!out.querySelector('.graph-panel')) clear(out, h('div', { class: 'loading' }, h('span', { class: 'spinner' }), '…'));
  try {
    const g = await sentenceGraph(S.item);
    if (S.tab !== 'graph') return;
    shown = key;
    clear(out, graphPanel(g));
  } catch (err) {
    clear(out, h('div', { class: 'err', text: err.message }));
  }
}

async function umrTab(out) {
  try {
    const g = await sentenceGraph(S.item);
    if (S.tab !== 'umr') return;
    const added = new Set(g.nodes.filter((n) => n.auto).map((n) => n.var));
    const lines = (g.text || '').split('\n').map((ln) => {
      const m = /^(\S+): \d+-\d+$/.exec(ln);
      return h('span', { class: m && added.has(m[1]) ? 'align-added' : '', style: 'display:block', text: ln || ' ' });
    });
    clear(out, h('div', { class: 'note', text: t('umrNote') }), h('pre', { class: 'block' }, lines));
  } catch (err) {
    clear(out, h('div', { class: 'err', text: err.message }));
  }
}

function drawTop() {
  const out = document.getElementById('output');
  const tabsEl = document.getElementById('out-tabs');
  const title = document.getElementById('node-title');
  if (!S.desc) { clear(out); clear(tabsEl); return; }
  const d = S.detail;
  title.textContent = d ? `#${S.item + 1} · ${d.id} · ${d.skill}` : `#${S.item + 1}`;
  const tabs = tabsFor(d);
  if (!tabs.includes(S.tab)) S.tab = tabs[0];
  clear(tabsEl, tabs.map((k) => h('button', { class: 'tab', role: 'tab', 'aria-selected': String(S.tab === k), text: t(LABEL[k]), onclick: () => { S.tab = k; S.editing = false; render(); } })));
  if (S.tab === 'graph') { delete out.dataset.editing; graphTab(out, d); return; }
  shown = '';
  if (S.tab === 'umr') { delete out.dataset.editing; umrTab(out); return; }
  if (!d) { clear(out, h('div', { class: 'empty', text: t('noNode') })); return; }
  // a redraw while someone is typing a correction must not throw the typing away
  const key = `${S.item}|${d.id}`;
  if (S.editing && S.tab === 'output' && out.dataset.editing === key) return;
  if (S.editing && S.tab === 'output') out.dataset.editing = key;
  else delete out.dataset.editing;
  const view = { output: outputTab, input: inputTab, jev: jevTab, prompt: promptTab, tools: toolsTab }[S.tab](d);
  clear(out, view);
}

const STATUS = { ok: '✓', error: '✕', pending: '○', skipped: '–', blocked: '!' };

function drawBottom() {
  const bar = document.getElementById('run-bar');
  const tree = document.getElementById('tree');
  if (!S.desc) { clear(bar); clear(tree); return; }
  const ep = S.episode;
  clear(bar,
    h('strong', { text: `#${S.item + 1}` }),
    !ep?.started ? h('button', { class: 'btn sm primary', disabled: S.running > 0, text: t('runEp'), onclick: () => runItem() }) : [
      h('button', { class: 'btn sm', disabled: S.running > 0, text: t('runNext'), onclick: () => runItem(S.item, { onlyNext: true }) }),
      h('button', { class: 'btn sm primary', disabled: S.running > 0, text: t('runAll'), onclick: () => runItem() }),
      h('button', { class: 'btn sm', disabled: S.running > 0, text: t('restart'), onclick: () => startItem() }),
    ],
    ep?.stale ? h('span', { class: 'note warn', text: t('stale') }) : null,
    ep?.error ? h('span', { class: 'note err', text: ep.error }) : null);
  if (!ep?.started) { clear(tree, h('div', { class: 'empty', text: t('notStarted') })); return; }
  clear(tree, h('ul', { class: 'tree' }, ep.nodes.map((n) => {
    const st = n.waiting ? 'running' : n.status;
    return h('li', { 'aria-selected': String(n.id === S.node), style: `padding-left:${6 + Math.min(n.depth, 14) * 14}px`, onclick: () => selectNode(n.id), title: n.error || '' },
      h('span', { class: `st ${st}`, text: n.waiting ? '◐' : STATUS[st] || '?' }),
      n.edge ? h('span', { class: 'edge', text: `:${n.edge}` }) : null,
      h('span', { class: 'sk', text: n.skill }),
      n.human ? h('span', { class: 'human-tag', text: t('humanTag') }) : null,
      n.text ? h('span', { class: 'txt', text: n.text }) : null,
      n.summary ? h('span', { class: 'sum', text: `→ ${n.summary}` }) : null,
      h('span', { class: 'grow' }),
      h('span', { class: 'id', text: n.id.length > 12 ? `…${n.id.slice(-10)}` : n.id }),
      n.status === 'pending' && !n.waiting ? h('button', { class: 'play', disabled: S.running > 0, text: '▶', title: t('run'), onclick: (e) => { e.stopPropagation(); selectNode(n.id).then(() => runNode(n.id)); } }) : null,
      n.status !== 'pending' ? h('button', { class: 'play', disabled: S.running > 0, text: '↺', title: t('rerun'), onclick: (e) => { e.stopPropagation(); resetNode(n.id); } }) : null);
  })));
}

onRender(() => { drawTop(); drawBottom(); });
