/**
 * Middle pane. Top: the sentence's graph as it stands (drawn, with the selected step's part
 * marked; click a box to go to the step that made it), and the selected step: its output (with
 * its own graph fragment drawn), input, Jev's questions and answers, prompt, and the sentence's
 * .umr text. The output is shown as Penman (relations and content) and as JSON; the JSON can be
 * edited: the edit is saved as the human result of the step and everything under it is redone
 * from it. A finished step waits for the person: it is correct (confirm), or it is re-run with a
 * hint written after its input, or its output is edited directly; only then can the item's next
 * step run. Bottom: the item's steps as a tree; click to select, ▶ to run the next one.
 *
 * Keys (not while typing or in a dialog): Enter confirms the step waiting and runs the next one
 * (or runs the first / next step); Tab opens "re-run with a hint" for it. In the hint box, Enter
 * re-runs with the hint (Shift+Enter: a new line), Esc closes it.
 */

import { h, clear, pretty, toast, diffView } from './ui.js';
import { S, SENTENCE_WAVE, onRender, render, selectNode, selectWave, selectItem, runNode, runNext, resetNode, saveOutput, startItem, sentenceGraph, confirmNode, confirmAndNext } from './core.js';
import { py } from './py.js';
import { outputPenman, docNodes } from './penman-view.js';
import { drawGraph, fragmentGraph } from './graph-view.js';
import { lineDiff, hunks, stable } from './diff.js';
import { renderMarkdown } from './md.js';
import { t } from './i18n.js';

const LABEL = { graph: 'tabGraph', output: 'tabOutput', input: 'tabInput', jev: 'tabJev', prompt: 'tabPrompt', tools: 'tabTools', umr: 'tabUmr' };

function tabsFor(d) {
  const out = ['graph'];
  if (d) {
    out.push('output', 'input');
    if (d.kind === 'jev') out.push('jev');
    if (d.kind === 'agent') out.push('prompt');
    if (d.kind === 'agent' || d.tool_specs?.length || d.tool_calls?.length) out.push('tools');
  }
  out.push('umr');
  return out;
}

const kbd = (key) => h('kbd', { text: key });

const hintLabel = () => (S.skillset?.endsWith('zh') ? 'human提示：' : 'Human hint: ');

/**
 * What a document step's relations can point at, "3:0.0/s3x" against the words and concept it
 * stands for: this sentence first, then the earlier ones. Open while the output is edited by hand.
 */
function docLegend(input, open) {
  const nodes = docNodes(input);
  if (!nodes.length) return null;
  const cur = nodes.filter((n) => n.current);
  const earlier = nodes.filter((n) => !n.current).sort((a, b) => b.sentence - a.sentence);
  const rows = (list) => list.map((n) => h('tr', {}, h('td', {}, h('code', { text: n.ref })), h('td', { text: n.label })));
  return h('details', { class: 'doc-legend', open },
    h('summary', { text: t('docNodes', { n: cur.length, m: earlier.length }) }),
    h('table', { class: 'legend' }, h('tbody', {}, rows(cur),
      earlier.length ? h('tr', {}, h('td', { colspan: 2, class: 'note', text: t('docEarlier') })) : null, rows(earlier))));
}

/** An empty output in the step's emit shape, to fill in by hand when the step has none. */
function skeleton(emit = {}) {
  return Object.fromEntries(Object.entries(emit).map(([k, ty]) => [k,
    Array.isArray(ty) ? ty[0] : String(ty).startsWith('list') ? [] : ty === 'dict' ? {} : ty === 'str' ? '' : 0]));
}

/**
 * What the person does with a finished step: it is correct (confirm), or re-run it with a hint
 * written after its input, or write the output directly. A rule has no model to give a hint to.
 */
function reviewCard(d) {
  const busy = S.running > 0;
  const model = d.kind === 'jev' || d.kind === 'agent';
  const unconfirmed = d.status === 'ok' && !d.confirmed;
  // a finished output can be changed locally by a hint (bridge.revise); a model step can also be
  // parsed again with the hint (its skill, as before)
  const local = d.status === 'ok';
  let hintBox = null;
  if (S.hinting && (model || local)) {
    const area = h('textarea', { rows: 3, class: 'hint-area', placeholder: t('hintPlaceholder') });
    area.value = d.hint || '';
    area.addEventListener('keydown', (e) => {
      // an IME composing Chinese commits with Enter: that Enter is not ours
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        (hintBox.querySelector('.hint-go') || hintBox.querySelector('.hint-local')).click();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        S.hinting = false;
        render();
      }
    });
    hintBox = h('div', { class: 'hint-box' },
      model ? h('div', { class: 'note', text: t(d.kind === 'jev' ? 'hintWhereJev' : 'hintWhere', { label: hintLabel() }) }) : null,
      local ? h('div', { class: 'note', text: t('localNote') }) : null,
      area,
      h('div', { class: 'row' },
        model ? h('button', { class: 'btn primary hint-go', disabled: busy, text: t('hintGo'), 'aria-keyshortcuts': 'Enter', onclick: () => {
          const v = area.value.trim();
          if (!v) { area.focus(); return; }
          S.hinting = false;
          runNode(d.id, { hint: v });
        } }, kbd('Enter')) : null,
        local ? h('button', { class: `btn${model ? '' : ' primary'} hint-local`, disabled: busy, text: t('localGo'), onclick: () => {
          const v = area.value.trim();
          if (!v) { area.focus(); return; }
          S.hinting = false;
          runNode(d.id, { hint: v, revise: true });
        } }) : null,
        d.hint ? h('button', { class: 'btn', disabled: busy, text: t('hintClear'), onclick: () => { S.hinting = false; runNode(d.id, { hint: '' }); } }) : null,
        h('button', { class: 'btn', text: t('cancel'), onclick: () => { S.hinting = false; render(); } })));
  }
  return h('div', { class: `card review-card${unconfirmed ? ' confirm-card' : ''}` },
    unconfirmed ? h('div', { class: 'note', text: t('awaitHelp') }) : d.status === 'error' ? h('div', { class: 'note warn', text: t('errorHelp') }) : null,
    h('div', { class: 'row' },
      unconfirmed ? [
        h('button', { class: 'btn primary', text: t('confirmNext'), disabled: busy, 'aria-keyshortcuts': 'Enter', onclick: () => confirmAndNext(d.id) }, kbd('Enter')),
        h('button', { class: 'btn', text: t('confirm'), disabled: busy, onclick: () => confirmNode(d.id) }),
      ] : d.confirmed && !d.human ? h('span', { class: 'ok-tag', text: `✓ ${t('confirmedTag')}` }) : null,
      model || local ? h('button', { class: 'btn hint-btn', 'aria-pressed': String(S.hinting), disabled: busy, text: t('hintRerun'), 'aria-keyshortcuts': 'Tab',
        onclick: () => { S.hinting = !S.hinting; S.editing = false; render(); focusHint(); } }, kbd('Tab')) : null,
      h('button', { class: 'btn edit-btn', disabled: busy, text: t('editDirect'), onclick: () => { S.editing = true; S.hinting = false; render(); } }),
      h('button', { class: 'btn ghost', disabled: busy, text: t('rerun'), onclick: () => runNode(d.id) })),
    hintBox,
    d.hint && !hintBox ? h('div', { class: 'note hint-now', text: `${t('hintNow')} ${hintLabel()}${d.hint}` }) : null);
}

const liveKey = (id) => `${S.wave}|${S.item}|${id}`;

/** A model answering this step: who, how long so far. */
function liveCard(live) {
  const what = live.kind === 'jev' ? t('liveJev', { round: live.round, n: live.questions }) : t('liveLlm', { model: live.model });
  return h('div', { class: 'card live-card', role: 'status' },
    h('div', { class: 'row' }, h('span', { class: 'spinner' }), h('strong', { text: what }),
      h('span', { class: 'grow' }), h('span', { class: 'note live-elapsed', dataset: { since: live.since }, text: elapsed(live.since) })),
    h('div', { class: 'live-bar' }, h('span')),
    live.retry ? h('div', { class: 'note warn', text: t('retried') }) : null);
}

const elapsed = (since) => t('elapsed', { s: Math.max(0, Math.round((Date.now() - since) / 1000)) });
// the seconds on every live card tick on their own, without a redraw
setInterval(() => document.querySelectorAll('.live-elapsed').forEach((el) => { el.textContent = elapsed(Number(el.dataset.since)); }), 1000);

function outputTab(d) {
  const live = S.live.get(liveKey(d.id));
  if (live) return liveCard(live);
  if (d.status === 'pending' && !d.waiting) {
    const wait = S.episode?.awaiting || [];
    return h('div', {}, h('div', { class: 'empty', text: wait.length ? t('confirmFirst', { list: wait.join(', ') }) : '—' }),
      h('button', { class: 'btn primary', text: t('run'), disabled: S.running > 0 || wait.length > 0, onclick: () => runNode(d.id) }));
  }
  const text = d.output ? stable(d.output) : '';
  if (S.editing) {
    const area = h('textarea', { rows: 22, spellcheck: 'false' });
    area.value = text || stable(skeleton(d.emit));
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
        h('button', { class: 'btn', text: t('cancel'), onclick: () => { S.editing = false; render(); } }), err),
      Array.isArray(d.input?.sentences) ? docLegend(d.input, true) : null);
  }
  const parts = [];
  if (d.status === 'ok' || d.status === 'error') parts.push(reviewCard(d));
  if (d.error) parts.push(h('div', { class: 'card err' }, h('strong', { text: `${t('error')}: ` }), d.error, d.trace ? h('details', {}, h('summary', { text: 'trace' }), h('pre', { text: d.trace })) : null));
  if (d.problems?.length) parts.push(h('div', { class: 'card warn' }, h('strong', { text: `${t('retried')}: ` }), d.problems.join('; ')));
  if (d.model && d.status !== 'pending') parts.push(h('div', { class: 'note', text: t('madeBy', { model: d.model }) }));
  if (d.revise_error) parts.push(h('div', { class: 'card warn', text: t('reviseFailed', { e: d.revise_error }) }));
  if (d.applied) {
    parts.push(h('div', { class: 'card' }, h('strong', { text: t('convertApplied', { steps: d.applied.steps }) }),
      d.applied.problems?.length ? h('ul', {}, d.applied.problems.map((x) => h('li', { text: x }))) : null));
  }
  if (d.loaded) {
    const gen = d.origin === 'generated';
    parts.push(h('div', { class: 'row' }, h('span', { class: `human-tag loaded${gen ? ' generated' : ''}`, text: t(gen ? 'generatedTag' : 'loadedTag') }),
      h('span', { class: 'note', text: t(gen ? 'generatedNote' : 'loadedNote') })));
  } else if (d.human) {
    parts.push(h('div', { class: 'row' }, h('span', { class: 'human-tag', text: t('humanTag') }),
      h('span', { class: 'note', text: t('human') })));
  }
  const pm = outputPenman(d.skill, d.output, d.input);
  if (pm) parts.push(h('div', { class: 'note', text: t('penmanTitle') }), h('pre', { class: 'block penman', text: pm }));
  if (Array.isArray(d.input?.sentences)) parts.push(docLegend(d.input, false));
  const frag = fragmentGraph(d.output);
  if (frag) {
    parts.push(h('details', {}, h('summary', { text: t('fragment') }),
      h('div', { class: 'graph-wrap' }, drawGraph(frag.graph, { dashed: frag.dashed }))));
  }
  parts.push(h('details', { open: !pm }, h('summary', { text: t('jsonTitle') }), h('pre', { class: 'block', text: text || '—' })));
  if (d.human && d.machine_output) {
    parts.push(h('details', {}, h('summary', { text: t('machine') }), diffView(hunks(lineDiff(stable(d.machine_output), text), 2))));
  }
  if (d.children?.length) parts.push(h('div', { class: 'note', text: `${t('children')}: ${d.children.join(', ')}` }));
  if (d.dropped?.length) parts.push(h('details', {}, h('summary', { text: `${t('dropped')} (${d.dropped.length})` }), h('pre', { text: pretty(d.dropped) })));
  return h('div', { style: 'display:grid;gap:6px' }, parts);
}

/** The step's input as the model gets it (Markdown, rendered), and the values as JSON. */
function inputTab(d) {
  if (!d.input_md) return h('pre', { class: 'block', text: pretty(d.input) });
  return h('div', { style: 'display:grid;gap:6px' },
    renderMarkdown(d.input_md, { lines: true }),
    h('details', {}, h('summary', { text: t('jsonTitle') }), h('pre', { class: 'block', text: pretty(d.input) })));
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
    h('details', {}, h('summary', { text: 'instructions (skill.md)' }),
      h('div', { class: 'block md-view' }, renderMarkdown(p.instructions)),
      h('details', {}, h('summary', { class: 'note', text: t('mdSource') }), h('pre', { class: 'block', text: p.instructions }))),
    h('details', { open: true }, h('summary', { text: 'input' }), h('pre', { class: 'block', text: p.input })));
}

function toolsTab(d) {
  const calls = d.tool_calls || [];
  return h('div', { style: 'display:grid;gap:6px' },
    calls.length ? calls.map((c) => h('div', { class: 'qa' },
      h('div', { class: 'q mono' }, `${c.tool}(${JSON.stringify(c.args)}) `,
        c.simulated ? h('span', { class: 'badge', text: t('toolSimulated') }) : null,
        c.manual ? h('span', { class: 'badge', text: t('toolByHand') }) : null),
      h('details', { open: !!c.manual }, h('summary', { text: `${String(c.result).length} chars` }), toolResult(c.result))))
      : h('div', { class: 'empty', text: t('noTools') }),
    d.tool_specs?.length ? toolForm(d) : null);
}

/** An argument's example value: the tool's parameters, as JSON to fill in. */
function exampleArgs(spec) {
  const lang = (S.skillset || '').split('-').pop();
  return Object.fromEntries(Object.entries(spec.parameters?.properties || {}).map(([k, p]) => [k,
    k === 'language' ? lang : p.type === 'array' ? [] : p.type === 'integer' || p.type === 'number' ? 3 : '']));
}

/** A person calls one of the step's tools with arguments of their own; the call is kept with the step's. */
function toolForm(d) {
  const specs = d.tool_specs;
  const pick = h('select', {}, specs.map((s) => h('option', { value: s.name, text: s.name })));
  const args = h('textarea', { rows: 3, class: 'tool-args', spellcheck: 'false' });
  const err = h('div', { class: 'err' });
  const fill = () => { args.value = JSON.stringify(exampleArgs(specs.find((s) => s.name === pick.value)), null, 0); };
  pick.addEventListener('change', fill);
  fill();
  return h('div', { class: 'card tool-form' },
    h('strong', { text: t('toolManual') }),
    h('div', { class: 'row' }, pick),
    h('label', { class: 'note', text: t('toolArgs') }), args,
    h('div', { class: 'row' }, h('button', { class: 'btn primary tool-call', text: t('toolCall'), onclick: async () => {
      let value;
      try { value = JSON.parse(args.value || '{}'); } catch (e) { err.textContent = t('badJson', { e: e.message }); return; }
      err.textContent = '';
      await py('tool', { w: S.wave, i: S.item, nid: d.id, name: pick.value, args: value, manual: true });
      S.detail = await py('node', { w: S.wave, i: S.item, nid: d.id });
      render();
    } }), err));
}

/** A tool's answer as the model got it: Markdown (propbank_lookup) rendered, JSON as it is. */
function toolResult(text) {
  const s = String(text ?? '');
  try {
    JSON.parse(s);
    return h('pre', { class: 'block', text: s });
  } catch {
    return renderMarkdown(s, { lines: true });
  }
}

/** Go to the step that made a variable of the sentence graph (it is a node of the sentence wave). */
async function goToMaker(g, v) {
  const n = g.nodes.find((x) => x.var === v);
  if (!n?.node) return;
  const sentenceWave = SENTENCE_WAVE;
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
  const sentenceWave = SENTENCE_WAVE;
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
    const byVar = new Map(g.nodes.map((n) => [n.var, n]));
    // a variable of this sentence's graph is a link to the step that made it (as a box of the graph)
    const linked = (ln) => ln.split(/(\bs\d+[A-Za-z]\w*\b)/).map((part) => {
      const n = byVar.get(part);
      if (!n) return part;
      return h('a', { class: 'umr-var', href: '#', title: `${n.concept}${n.words ? ` · ${n.words}` : ''}`,
        onclick: (e) => { e.preventDefault(); goToMaker(g, part); } }, part);
    });
    const lines = (g.text || '').split('\n').map((ln) => {
      const m = /^(\S+): \d+-\d+$/.exec(ln);
      return h('span', { class: m && added.has(m[1]) ? 'align-added' : '', style: 'display:block' }, ln ? linked(ln) : ' ');
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
  clear(tabsEl, tabs.map((k) => h('button', { class: 'tab', role: 'tab', 'aria-selected': String(S.tab === k), text: t(LABEL[k]), onclick: () => { S.tab = k; S.editing = false; S.hinting = false; render(); } })));
  if (S.tab === 'graph') { delete out.dataset.editing; graphTab(out, d); return; }
  shown = '';
  if (S.tab === 'umr') { delete out.dataset.editing; umrTab(out); return; }
  if (!d) { clear(out, h('div', { class: 'empty', text: t('noNode') })); return; }
  // a redraw while someone is typing a correction must not throw the typing away
  const key = `${S.item}|${d.id}`;
  const typing = (S.editing || S.hinting) && S.tab === 'output';
  if (typing && out.dataset.editing === key) return;
  if (typing) out.dataset.editing = key;
  else delete out.dataset.editing;
  const view = { output: outputTab, input: inputTab, jev: jevTab, prompt: promptTab, tools: toolsTab }[S.tab](d);
  clear(out, view);
}

const focusHint = () => document.querySelector('#output .hint-area')?.focus();

/** A finished step's other answers open in the output tab: re-run with a hint, or edit it. */
async function openFix(id, mode) {
  // the step shown already opens at once, so what is typed straight after Tab lands in the box
  if (S.node !== id || S.detail?.id !== id) await selectNode(id);
  S.tab = 'output';
  S.editing = mode === 'edit';
  S.hinting = mode === 'hint';
  render();
  if (mode === 'hint') focusHint();
}

/** The step the selected item waits on (finished or failed, not yet confirmed), or null. */
function waitingStep() {
  const ep = S.episode;
  const id = ep?.awaiting?.[0];
  return id ? ep.nodes.find((n) => n.id === id) || null : null;
}

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== 'Tab') return;
  if (e.defaultPrevented || e.isComposing || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
  if (!S.desc || S.running > 0 || !document.getElementById('modal').hidden) return;
  const el = e.target instanceof Element ? e.target : null;
  if (el?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
  const first = waitingStep();
  if (e.key === 'Tab') {
    if (!first || first.kind === 'rule') return;
    e.preventDefault();
    openFix(first.id, 'hint');
    return;
  }
  // Enter on a focused button, link or box does what that control does
  if (el?.closest('button, a, [role="button"], [tabindex]')) return;
  const ep = S.episode;
  if (first) {
    if (first.status !== 'ok') return;
    e.preventDefault();
    confirmAndNext(first.id);
  } else if (!ep?.started || ep.nodes.some((n) => n.status === 'pending')) {
    e.preventDefault();
    runNext();
  }
});

const STATUS = { ok: '✓', review: '◆', running: '◐', error: '✕', pending: '○', skipped: '–', blocked: '!' };

function drawBottom() {
  const bar = document.getElementById('run-bar');
  const tree = document.getElementById('tree');
  if (!S.desc) { clear(bar); clear(tree); return; }
  const ep = S.episode;
  const wait = ep?.awaiting || [];
  // the step to confirm is always at hand here, whichever tab is open above
  const first = wait.length ? ep.nodes.find((n) => n.id === wait[0]) : null;
  const busy = S.running > 0;
  const open = (id, mode) => () => openFix(id, mode);
  const fix = (n) => [
    n.kind !== 'rule' ? h('button', { class: 'btn sm hint-open', disabled: busy, text: t('hintRerun'), 'aria-keyshortcuts': 'Tab', onclick: open(n.id, 'hint') }, kbd('Tab')) : null,
    h('button', { class: 'btn sm edit-open', disabled: busy, text: t('editDirect'), onclick: open(n.id, 'edit') }),
  ];
  clear(bar,
    h('strong', { text: `#${S.item + 1}` }),
    !ep?.started ? h('button', { class: 'btn sm primary run-first', disabled: busy, text: t('runFirst'), onclick: () => runNext() })
      : first?.status === 'ok' ? [
        h('button', { class: 'btn sm primary confirm-next', disabled: busy, text: t('confirmNext'), 'aria-keyshortcuts': 'Enter', onclick: () => confirmAndNext(first.id) }, kbd('Enter')),
        h('button', { class: 'btn sm confirm-only', disabled: busy, text: t('confirm'), onclick: () => confirmNode(first.id) }),
        fix(first),
        h('span', { class: 'note', text: `${t('awaitTag')}: ${first.shown || first.id} ${first.skill}` }),
      ] : first ? [fix(first), h('span', { class: 'note err', text: `${first.id} ${first.skill}: ${t('errorHelp')}` })]
        : h('button', { class: 'btn sm primary run-next', disabled: busy || !ep.nodes.some((n) => n.status === 'pending'), text: t('runNext'), onclick: () => runNext() }),
    ep?.started ? h('button', { class: 'btn sm', disabled: busy, text: t('restart'), onclick: () => startItem() }) : null,
    ep?.stale ? h('span', { class: 'note warn', text: t('stale') }) : null,
    ep?.error ? h('span', { class: 'note err', text: ep.error }) : null);
  if (!ep?.started) { clear(tree, h('div', { class: 'empty', text: t('notStarted') })); return; }
  clear(tree, h('ul', { class: 'tree' }, ep.nodes.map((n) => {
    const live = S.live.get(liveKey(n.id));
    const st = live || n.waiting ? 'running' : n.status === 'ok' && !n.confirmed ? 'review' : n.status;
    return h('li', { class: live ? 'live' : undefined, 'aria-selected': String(n.id === S.node), title: live ? t(live.kind === 'jev' ? 'liveJevShort' : 'liveLlmShort') : n.error || '', style: `padding-left:${6 + Math.min(n.depth, 14) * 14}px`, onclick: () => selectNode(n.id) },
      st === 'running' ? h('span', { class: 'st running' }, h('span', { class: 'spinner sm' }))
        : h('span', { class: `st ${st}`, text: STATUS[st] || '?' }),
      n.edge ? h('span', { class: 'edge', text: `:${n.edge}` }) : null,
      h('span', { class: 'sk', text: n.skill }),
      n.loaded ? h('span', { class: `human-tag loaded${n.origin === 'generated' ? ' generated' : ''}`, text: t(n.origin === 'generated' ? 'generatedTag' : 'loadedTag') })
        : n.human ? h('span', { class: 'human-tag', text: t('humanTag') }) : null,
      st === 'review' ? h('span', { class: 'await-tag', text: t('awaitTag') }) : null,
      n.text ? h('span', { class: 'txt', text: n.text }) : null,
      n.summary ? h('span', { class: 'sum', text: `→ ${n.summary}` }) : null,
      h('span', { class: 'grow' }),
      h('span', { class: 'id', text: (n.shown || n.id).length > 12 ? `…${(n.shown || n.id).slice(-10)}` : (n.shown || n.id) }),
      st === 'review' ? h('button', { class: 'play confirm', disabled: S.running > 0, text: '✓', title: t('confirm'), onclick: (e) => { e.stopPropagation(); selectNode(n.id).then(() => confirmNode(n.id)); } }) : null,
      n.status === 'pending' && !n.waiting && !live && !wait.length ? h('button', { class: 'play', disabled: S.running > 0, text: '▶', title: t('run'), onclick: (e) => { e.stopPropagation(); selectNode(n.id).then(() => runNode(n.id)); } }) : null,
      n.status !== 'pending' ? h('button', { class: 'play', disabled: S.running > 0, text: '↺', title: t('rerun'), onclick: (e) => { e.stopPropagation(); resetNode(n.id); } }) : null);
  })));
}

onRender(() => { drawTop(); drawBottom(); });
