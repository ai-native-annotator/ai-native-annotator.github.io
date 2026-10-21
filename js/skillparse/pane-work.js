/**
 * Middle pane. Top: what the selected step produced, and everything that went into it
 * (input, Jev's questions and answers, the prompt, tool calls), plus the whole sentence's
 * assembled graph. The output can be edited: the edit is saved as the human result of the
 * step and everything under it is redone from it. Bottom: the item's steps as a tree; click
 * to select, ▶ to run.
 */

import { h, clear, pretty, toast, diffView } from './ui.js';
import { S, onRender, render, selectNode, runNode, runItem, resetNode, saveOutput, startItem, assembled } from './core.js';
import { lineDiff, hunks, stable } from './diff.js';
import { t } from './i18n.js';

const TABS = ['output', 'input', 'jev', 'prompt', 'tools', 'graph'];
const LABEL = { output: 'tabOutput', input: 'tabInput', jev: 'tabJev', prompt: 'tabPrompt', tools: 'tabTools', graph: 'tabGraph' };

function tabsFor(d) {
  if (!d) return ['graph'];
  const out = ['output', 'input'];
  if (d.kind === 'jev') out.push('jev');
  if (d.kind === 'agent' || d.kind === 'rewrite' || d.kind === 'check') out.push('prompt');
  if (d.tool_calls?.length) out.push('tools');
  out.push('graph');
  return out;
}

function outputText(d) {
  const o = d.output;
  if (!o) return '';
  if (S.desc.engine === 'harness') return 'annotation' in o ? o.annotation : stable(o.findings);
  return stable(o);
}

function parseEdited(d, text) {
  if (S.desc.engine === 'harness') {
    if (d.kind === 'check') return { findings: JSON.parse(text) };
    return { annotation: text };
  }
  return JSON.parse(text);
}

function outputTab(d) {
  if (d.status === 'pending' && !d.waiting) {
    return h('div', {}, h('div', { class: 'empty', text: '—' }),
      h('button', { class: 'btn primary', text: t('run'), disabled: S.running > 0, onclick: () => runNode(d.id) }));
  }
  const text = outputText(d);
  if (S.editing) {
    const area = h('textarea', { rows: 22, spellcheck: 'false' });
    area.value = text;
    const err = h('div', { class: 'err' });
    return h('div', { style: 'display:grid;gap:6px' }, area,
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', text: t('saveCorrection'), onclick: async () => {
          let value;
          try { value = parseEdited(d, area.value); } catch (e) { err.textContent = t('badJson', { e: e.message }); return; }
          const r = await saveOutput(value);
          if (r?.status === 'error') toast(`${t('error')}: ${r.error}`);
          else toast(t('saved'));
        } }),
        h('button', { class: 'btn', text: t('cancel'), onclick: () => { S.editing = false; render(); } }), err));
  }
  const parts = [];
  if (d.error) parts.push(h('div', { class: 'card err' }, h('strong', { text: `${t('error')}: ` }), d.error, d.trace ? h('details', {}, h('summary', { text: 'trace' }), h('pre', { text: d.trace })) : null));
  if (d.problems?.length) parts.push(h('div', { class: 'card warn' }, h('strong', { text: `${t('problems')}: ` }), d.problems.join('; ')));
  if (d.human) {
    parts.push(h('div', { class: 'row' }, h('span', { class: 'human-tag', text: t('humanTag') }),
      h('span', { class: 'note', text: t('human') })));
  }
  parts.push(h('pre', { class: 'block', text: text || '—' }));
  if (d.human && d.machine_output) {
    const machine = S.desc.engine === 'harness' ? (d.machine_output.annotation ?? stable(d.machine_output.findings)) : stable(d.machine_output);
    parts.push(h('details', {}, h('summary', { text: t('machine') }), diffView(hunks(lineDiff(machine, text), 2))));
  }
  if (d.children?.length) parts.push(h('div', { class: 'note', text: `${t('children')}: ${d.children.join(', ')}` }));
  if (d.dropped?.length) parts.push(h('details', {}, h('summary', { text: `${t('dropped')} (${d.dropped.length})` }), h('pre', { text: pretty(d.dropped) })));
  parts.push(h('div', { class: 'row' },
    d.output ? h('button', { class: 'btn', text: t('edit'), onclick: () => { S.editing = true; render(); } }) : null,
    h('button', { class: 'btn', text: t('rerun'), disabled: S.running > 0, onclick: () => runNode(d.id) })));
  return h('div', { style: 'display:grid;gap:6px' }, parts);
}

function inputTab(d) {
  if (S.desc.engine === 'harness') {
    const b = d.before || {};
    return h('div', { style: 'display:grid;gap:6px' },
      b.blocked ? h('div', { class: 'warn', text: b.blocked }) : null,
      b.annotation ? h('details', { open: true }, h('summary', { text: `annotation (${b.from})` }), h('pre', { class: 'block', text: b.annotation })) : null,
      b.findings?.length ? h('details', { open: true }, h('summary', { text: `findings (${b.findings.length})` }), h('pre', { class: 'block', text: pretty(b.findings) })) : null,
      d.request ? h('details', {}, h('summary', { text: 'prompt input' }), h('pre', { class: 'block', text: d.request.input })) : null);
  }
  return h('pre', { class: 'block', text: pretty(d.input) });
}

function answerLine(q, a) {
  if (!a) return h('span', { class: 'note', text: '…' });
  if ('noul' in a) return h('span', {}, h('span', { class: 'bar', style: `width:${Math.round(a.noul * 60)}px` }), `yes ${Number(a.noul).toFixed(2)}`);
  if (a.probabilities) {
    const top = Object.entries(a.probabilities).sort((x, y) => y[1] - x[1]).slice(0, 3).filter(([, p], k) => p >= 0.01 || k === 0);
    return h('span', {}, top.map(([o, p]) => h('span', { style: 'margin-right:10px' }, h('span', { class: 'bar', style: `width:${Math.round(p * 60)}px` }), `${o} ${Number(p).toFixed(2)}`)));
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
  const p = d.prompt || d.request;
  if (!p) return h('div', { class: 'empty', text: t('noPrompt') });
  return h('div', { style: 'display:grid;gap:6px' },
    p.system ? h('details', {}, h('summary', { text: 'system' }), h('pre', { class: 'block', text: p.system })) : null,
    h('details', {}, h('summary', { text: 'instructions (skill)' }), h('pre', { class: 'block', text: p.instructions })),
    h('details', { open: true }, h('summary', { text: 'input' }), h('pre', { class: 'block', text: p.input })));
}

function toolsTab(d) {
  if (!d.tool_calls?.length) return h('div', { class: 'empty', text: t('noTools') });
  return h('div', {}, d.tool_calls.map((c) => h('div', { class: 'qa' },
    h('div', { class: 'q mono', text: `${c.tool}(${JSON.stringify(c.args)})` }), h('pre', { class: 'a', text: c.result }))));
}

async function graphTab(box) {
  clear(box, h('div', { class: 'loading' }, h('span', { class: 'spinner' }), '…'));
  try {
    const u = await assembled(true);
    const sent = u.sentences.find((s) => s.index === S.item + 1) || u.sentences[S.item];
    const added = new Set(u.added.filter((a) => a[0] === S.item + 1).map((a) => a[1]));
    const lines = (sent?.text || '').split('\n').map((ln) => {
      const m = /^(\S+): \d+-\d+$/.exec(ln);
      return h('span', { class: m && added.has(m[1]) ? 'align-added' : '', style: 'display:block', text: ln || ' ' });
    });
    clear(box, h('div', { class: 'note', text: t('graphNote') }), h('pre', { class: 'block' }, lines));
  } catch (err) {
    clear(box, h('div', { class: 'err', text: err.message }));
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
  if (S.tab === 'graph') {
    const box = h('div');
    clear(out, box);
    graphTab(box);
    return;
  }
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
