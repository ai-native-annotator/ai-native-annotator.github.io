/**
 * Apprentice mode: one step at a time, each explained, wave after wave.
 *
 * Nothing is generated ahead. The sentence wave is done first (each sentence cut into pieces, each
 * piece given its fragment of the graph), then the document wave (modal, temporal, coreference).
 * One step is on screen: its piece of the sentence, what the step decides, what the skill
 * says about it, what it looked up, and what it answered; the person says it is right, corrects
 * it by hand, or has it done again with a hint, and only then comes the next step. Under it, the
 * sentence's graph as it stands, with what this step wrote marked.
 *
 * It drives the same actions as the manual mode (run the next step, confirm, write an output,
 * re-run with a hint) on the same steps. Keys: Enter does the main button; Tab opens the hint.
 */

import { h, clear, toast } from './ui.js';
import { S, SENTENCE_WAVE, onRender, render, selectWave, selectItem, selectNode, sentenceGraph, runNext, runNode,
  confirmAndNext, saveOutput } from './core.js';
import { py } from './py.js';
import { graphPanel } from './pane-work.js';
import { relationsBlock } from './mode-expert.js';
import { outputPenman } from './penman-view.js';
import { renderMarkdown } from './md.js';
import { jsonText } from './diff.js';
import { exportAs } from './dialogs.js';
import { addStrings, t, getLang } from './i18n.js';
import { freeKey } from './modes.js';

const DOCUMENT_WAVE = 'document';

addStrings({
  apWave: { sentence: '① 句子图', document: '② 文档级' },
  apWaveHelp: { sentence: '把每一句切成一块一块，每块写出它在图里的那一部分。', document: '句子图做完之后，标每一句的情态、时间和共指关系。' },
  apSentence: '第 {i} 句 / {n}', apStep: '这一句的第 {k} 步', apPrev: '上一句', apNextSentence: '下一句',
  apStart: '开始这一句', apStartHelp: '这一句还没开始。第一步会看整句，决定它是什么。',
  apRunNext: '运行下一步', apWorking: '「{skill}」正在做这一步…',
  apDecides: '这一步在决定什么', apSkillText: '这个 skill 的完整说明', apAnswer: '它的回答', apAsked: 'Jev 被问了什么', apLooked: '它查了什么（{n}）',
  apHands: '它交给下一步的', apHandsNone: '没有交给下一步的：这一块到此为止。',
  apRight: '对，下一步', apEdit: '✎ 我来改', apHint: '💬 加提示重跑', apSave: '保存我的答案', apCancel: '取消', apHintGo: '带提示重跑',
  apHintPlaceholder: '告诉它哪里不对，比如：这里是并列，不是一个谓词', apBadJson: 'JSON 写得不对：{e}',
  apError: '这一步出错了：{e}', apErrorHelp: '加一句提示让它重做，或者自己写出答案。',
  apHuman: '这是你改过的答案。', apSoFar: '这一句的图，到这一步为止（蓝框是这一步写的）', apDocSoFar: '这一句的文档级关系，到这一步为止',
  apSentenceDone: '这一句的{wave}做完了。', apToDocument: '句子图都做完了，进入文档级', apAllDone: '全部做完了，可以导出。', apExport: '导出 .umr',
  apNeeds: '要先做完：{list}', apGo: '去那里',
  apHelp: {
    sent_type: '看这一块原文，决定它是哪一类：几个并列的分句（discourse）、一个谓词和它的参与者（predicate）、一个名词短语（np_phrase）、一个名字 / 日期 / 数量（special_entity），还是一个不用再拆的词（stop）。它只判断类型，下一步由对应的 skill 来写图。',
    discourse: '这一块是几个分句。决定分句之间是什么关系（并列、转折、因果…），并把每个分句切出来，各自交给下一步。',
    predicate: '这一块的中心是一个事件。查 PropBank 选定义项，写出事件节点、它的 aspect 和 modstr，把每个参与者留成占位（<node: …>），交给下一步去展开。',
    np_phrase: '这一块是一个名词短语。写出中心词的节点，把修饰语留成占位，交给下一步。',
    special_entity: '这一块是名字、日期、数量或序数。按 UMR 的固定结构整个写出来（比如 name 节点和它的 op），一般不再往下拆。',
    modal: '按规则（不调模型）从句子图里读出每个事件的情态：谁认为它成立、有多肯定。',
    temporal: '给这一句的每个事件和时间词找一个时间上的参照（文档时间，或这一句、前面句子里的事件），标出先后或重叠。',
    coref: '找出这一句里和前面提到过的是同一个东西（或同一件事）的地方，连到最近的那一次提及。',
    tokenizer: '按规则把句子切成 token。之后所有的 span 都按这些 token 数。',
  },
  apKind: { jev: 'Jev 回答封闭问题', agent: '模型按 skill 的说明回答', rule: '规则，不调模型' },
}, {
  apWave: { sentence: '① Sentence graph', document: '② Document level' },
  apWaveHelp: { sentence: 'Each sentence is cut into pieces, and each piece gets its part of the graph.', document: 'Once the sentence graphs are done: each sentence\'s modality, time and coreference.' },
  apSentence: 'Sentence {i} of {n}', apStep: 'Step {k} of this sentence', apPrev: 'Previous', apNextSentence: 'Next sentence',
  apStart: 'Start this sentence', apStartHelp: 'This sentence has not started. The first step looks at the whole sentence and decides what it is.',
  apRunNext: 'Run the next step', apWorking: '“{skill}” is doing this step …',
  apDecides: 'What this step decides', apSkillText: "The skill's full instructions", apAnswer: 'Its answer', apAsked: 'What Jev was asked', apLooked: 'What it looked up ({n})',
  apHands: 'What it hands on', apHandsNone: 'Nothing is handed on: this piece ends here.',
  apRight: 'Right, next step', apEdit: '✎ I will correct it', apHint: '💬 Again, with a hint', apSave: 'Save my answer', apCancel: 'Cancel', apHintGo: 'Run again with the hint',
  apHintPlaceholder: 'Say what is wrong, e.g.: these are two coordinated clauses, not one predicate', apBadJson: 'Not valid JSON: {e}',
  apError: 'This step failed: {e}', apErrorHelp: 'Give it a hint and run it again, or write the answer yourself.',
  apHuman: 'This is your corrected answer.', apSoFar: "The sentence's graph up to this step (blue: what this step wrote)", apDocSoFar: "The sentence's document-level relations up to this step",
  apSentenceDone: 'This sentence is done ({wave}).', apToDocument: 'All sentence graphs are done: on to the document level', apAllDone: 'Everything is done: ready to export.', apExport: 'Export .umr',
  apNeeds: 'First finish: {list}', apGo: 'Go there',
  apHelp: {
    sent_type: 'Looks at this piece and decides its kind: coordinated clauses (discourse), a predicate with its participants (predicate), a noun phrase (np_phrase), a name / date / quantity (special_entity), or one word that needs no cutting (stop). It only decides the kind; the skill of that kind writes the graph next.',
    discourse: 'This piece is several clauses. Decides how they are related (and, but, cause …) and cuts each clause out for the next step.',
    predicate: 'The centre of this piece is an event. Picks its PropBank sense, writes the event node with its aspect and modstr, and leaves each participant as a placeholder (<node: …>) for the next step.',
    np_phrase: 'This piece is a noun phrase. Writes its head, and leaves the modifiers as placeholders for the next step.',
    special_entity: 'This piece is a name, a date, a quantity or an ordinal. Written whole in UMR\'s fixed structure (a name node with its ops); usually nothing is left to cut.',
    modal: 'A rule (no model): reads each event\'s modality off the sentence graph: who holds it to be true, and how surely.',
    temporal: 'Gives each event and time expression of the sentence a reference in time (the document time, or an event of this or an earlier sentence): before, after, overlapping.',
    coref: 'Finds what in this sentence is the same thing (or event) as something mentioned before, and links it to the closest earlier mention.',
    tokenizer: 'A rule that cuts the sentence into tokens. Every span after this counts them.',
  },
  apKind: { jev: 'Jev answers closed questions', agent: 'a model follows the skill', rule: 'a rule, no model' },
});

const ui = { editing: false, hinting: false, node: '', drawn: '', graph: null, switching: false, skillText: new Map() };

const sents = () => S.desc?.doc?.sents || [];
const waiting = () => {
  const id = S.episode?.awaiting?.[0];
  return id ? S.episode.nodes.find((n) => n.id === id) || null : null;
};
const hasPending = () => !S.episode?.started || S.episode.nodes.some((n) => n.status === 'pending');
const itemDone = () => S.episode?.started && !S.episode.error && !waiting() && !hasPending();

async function goSentence(i) {
  if (i >= 0 && i < sents().length) await selectItem(i);
}

async function toWave(name, i = 0) {
  await selectWave(name);
  await selectItem(i);
}

/** What the main button does now (Enter does the same). */
function primary() {
  if (S.running > 0) return null;
  const first = waiting();
  if (ui.editing || ui.hinting) return null;
  if (first) return first.status === 'ok' ? { text: t('apRight'), run: () => confirmAndNext(first.id) } : null;
  if (S.episode?.error) return null;
  if (hasPending()) return { text: t(S.episode?.started ? 'apRunNext' : 'apStart'), run: () => runNext() };
  if (S.item + 1 < sents().length) return { text: t('apNextSentence'), run: () => goSentence(S.item + 1) };
  if (S.wave === SENTENCE_WAVE) return { text: t('apToDocument'), run: () => toWave(DOCUMENT_WAVE) };
  return { text: t('apExport'), run: () => exportAs('umr').catch((err) => toast(err.message)) };
}

// ------------------------------------------------------------------ one step

/** The sentence, with the step's piece marked. */
function pieceView(d) {
  const tokens = sents()[S.item]?.tokens || [];
  const span = Array.isArray(d?.input?.span) ? d.input.span : null;
  return h('div', { class: 'ap-sentence' }, tokens.map((w, k) => h('span', { class: `tok${span && k + 1 >= span[0] && k + 1 <= span[1] ? ' on' : ''}` }, w)));
}

function askedView(d) {
  const rounds = d.rounds || [];
  if (!rounds.length) return null;
  const line = (id, a) => {
    if (!a) return `${id}: …`;
    if (a.choice !== undefined) {
      const top = Object.entries(a.probabilities || {}).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([o, p]) => `${o} ${Math.round(p * 100)}%`);
      return `${id}: ${a.choice}${top.length ? `（${top.join(' · ')}）` : ''}`;
    }
    return 'noul' in a ? `${id}: ${Math.round(a.noul * 100)}%` : `${id}: ${JSON.stringify(a)}`;
  };
  return h('details', { class: 'ap-more' }, h('summary', { text: t('apAsked') }),
    rounds.map((r) => h('div', { class: 'note mono' }, Object.keys(r.questions || {}).map((id) => h('div', { text: line(id, r.answers?.[id]) })))));
}

function lookedView(d) {
  const calls = d.tool_calls || [];
  if (!calls.length) return null;
  return h('details', { class: 'ap-more' }, h('summary', { text: t('apLooked', { n: calls.length }) }),
    calls.map((c) => h('details', {}, h('summary', { class: 'mono', text: `${c.tool}(${JSON.stringify(c.args)})` }),
      h('div', { class: 'md-view' }, renderMarkdown(String(c.result).slice(0, 20000), { lines: true })))));
}

/** The skill's own text (its skill.md, or what its rule says it does), fetched when asked for. */
function skillView(d) {
  const box = h('div', { class: 'md-view' });
  const details = h('details', { class: 'ap-more' }, h('summary', { text: t('apSkillText') }), box);
  details.addEventListener('toggle', async () => {
    if (!details.open || box.childNodes.length) return;
    const path = (d.files || []).find((f) => f.endsWith('skill.md')) || (d.files || [])[0];
    if (!path) return;
    if (!ui.skillText.has(path)) ui.skillText.set(path, await py('read_file', { path }).catch((e) => e.message));
    clear(box, path.endsWith('.md') ? renderMarkdown(ui.skillText.get(path)) : h('pre', { class: 'block', text: ui.skillText.get(path) }));
  });
  return details;
}

function handsOn(d) {
  const kids = (S.episode?.nodes || []).filter((n) => n.parent === d.id);
  if (d.status !== 'ok') return null;
  return h('div', { class: 'ap-hands' }, h('div', { class: 'ap-label', text: t('apHands') }),
    kids.length ? h('ul', {}, kids.map((k) => h('li', {}, h('span', { class: 'sk', text: k.skill }), k.edge ? h('span', { class: 'edge', text: ` :${k.edge}` }) : null,
      k.text ? ` “${k.text}”` : ''))) : h('div', { class: 'note', text: t('apHandsNone') }));
}

function editBox(d) {
  const area = h('textarea', { rows: 12, class: 'code ap-edit' });
  area.value = jsonText(d.output ?? Object.fromEntries(Object.keys(d.emit || {}).map((k) => [k, ''])));
  const err = h('div', { class: 'err' });
  return h('div', { class: 'ap-box' }, area, err, h('div', { class: 'row' },
    h('button', { class: 'btn primary ap-save', text: t('apSave'), onclick: async () => {
      let value;
      try { value = JSON.parse(area.value); } catch (e) { err.textContent = t('apBadJson', { e: e.message }); return; }
      ui.editing = false;
      const r = await saveOutput(value).catch((e) => ({ status: 'error', error: e.message }));
      if (r?.status === 'error') toast(`${t('error')}: ${r.error}`, 7000);
    } }),
    h('button', { class: 'btn', text: t('apCancel'), onclick: () => { ui.editing = false; render(); } })));
}

function hintBox(d) {
  const area = h('textarea', { rows: 3, class: 'ap-hint', placeholder: t('apHintPlaceholder') });
  area.value = d.hint || '';
  const go = () => {
    const v = area.value.trim();
    if (!v) { area.focus(); return; }
    ui.hinting = false;
    runNode(d.id, { hint: v });
  };
  area.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go(); }
  });
  setTimeout(() => area.focus());
  return h('div', { class: 'ap-box' }, area, h('div', { class: 'row' },
    h('button', { class: 'btn primary ap-hint-go', text: t('apHintGo'), onclick: go }, h('kbd', { text: 'Enter' })),
    h('button', { class: 'btn', text: t('apCancel'), onclick: () => { ui.hinting = false; render(); } })));
}

function stepCard(d, main) {
  const help = t(`apHelp.${d.skill}`);
  const penman = d.status === 'ok' ? outputPenman(d.skill, d.output, d.input) : null;
  const k = (S.episode?.nodes || []).filter((n) => n.status !== 'pending').findIndex((n) => n.id === d.id) + 1;
  const model = d.kind !== 'rule';
  return h('div', { class: 'ap-card' },
    h('div', { class: 'ap-head' }, h('span', { class: `badge ${d.kind}`, text: d.skill }), h('span', { class: 'note', text: t(`apKind.${d.kind}`) }),
      h('span', { class: 'grow' }), h('span', { class: 'note', text: t('apStep', { k: k || 1 }) })),
    pieceView(d),
    h('div', { class: 'ap-label', text: t('apDecides') }),
    h('div', { class: 'ap-help', text: help === `apHelp.${d.skill}` ? d.skill : help }),
    skillView(d),
    d.status === 'error' ? h('div', { class: 'card err' }, t('apError', { e: d.error || '' }), h('div', { class: 'note', text: t('apErrorHelp') })) : null,
    d.status === 'ok' ? [
      h('div', { class: 'ap-label', text: t('apAnswer') }),
      d.human ? h('div', { class: 'note', text: t('apHuman') }) : null,
      h('pre', { class: 'block ap-answer', text: penman || jsonText(d.output) }),
      askedView(d), lookedView(d), handsOn(d),
    ] : null,
    ui.editing ? editBox(d) : ui.hinting ? hintBox(d) : h('div', { class: 'ap-actions' },
      model ? h('button', { class: 'btn ap-open-hint', disabled: S.running > 0, text: t('apHint'), onclick: () => { ui.hinting = true; render(); } }, h('kbd', { text: 'Tab' })) : null,
      h('button', { class: 'btn ap-open-edit', disabled: S.running > 0, text: t('apEdit'), onclick: () => { ui.editing = true; render(); } }),
      h('span', { class: 'grow' }),
      main ? h('button', { class: 'btn primary ap-main', text: main.text, onclick: main.run }, h('kbd', { text: 'Enter' })) : null));
}

function restCard(main) {
  const ep = S.episode;
  const wave = t(`apWave.${S.wave}`);
  let body;
  if (ep?.error) {
    const needs = ep.needs || [];
    body = [h('div', { class: 'warn', text: needs.length ? t('apNeeds', { list: needs.map(([w, k]) => `${t(`apWave.${w}`)} #${k + 1}`).join(', ') }) : ep.error }),
      needs.length ? h('button', { class: 'btn', text: t('apGo'), onclick: () => toWave(needs[0][0], needs[0][1]) }) : null];
  } else if (!ep?.started) body = h('div', { class: 'note', text: t('apStartHelp') });
  else if (itemDone()) {
    const last = S.item + 1 >= sents().length;
    body = h('div', { class: 'ok', text: last && S.wave === DOCUMENT_WAVE ? t('apAllDone') : t('apSentenceDone', { wave }) });
  }
  return h('div', { class: 'ap-card' }, pieceView(null), body,
    h('div', { class: 'ap-actions' }, h('span', { class: 'grow' }),
      main ? h('button', { class: 'btn primary ap-main', text: main.text, onclick: main.run }, h('kbd', { text: 'Enter' })) : null));
}

function workingCard() {
  const live = [...S.live.entries()].find(([k]) => k.startsWith(`${S.wave}|${S.item}|`));
  const node = live ? S.episode?.nodes.find((n) => `${S.wave}|${S.item}|${n.id}` === live[0]) : null;
  const skill = node?.skill || S.detail?.skill || '…';
  const help = t(`apHelp.${skill}`);
  return h('div', { class: 'ap-card' }, pieceView(S.detail?.id === node?.id ? S.detail : null),
    h('div', { class: 'loading' }, h('span', { class: 'spinner' }), t('apWorking', { skill })),
    h('div', { class: 'ap-help', text: help === `apHelp.${skill}` ? '' : help }));
}

// ------------------------------------------------------------------ the page

function header() {
  const waves = [SENTENCE_WAVE, DOCUMENT_WAVE].filter((w) => S.desc.waves.some((x) => x.name === w));
  return h('div', { class: 'ap-top' },
    h('div', { class: 'seg ap-waves' }, waves.map((w) => h('button', { 'aria-pressed': String(S.wave === w), text: t(`apWave.${w}`), onclick: () => toWave(w, S.item) }))),
    h('span', { class: 'note', text: t(`apWaveHelp.${S.wave}`) }),
    h('span', { class: 'grow' }),
    h('button', { class: 'btn sm', disabled: S.item === 0, text: t('apPrev'), onclick: () => goSentence(S.item - 1) }),
    h('strong', { text: t('apSentence', { i: S.item + 1, n: sents().length }) }),
    h('button', { class: 'btn sm', disabled: S.item + 1 >= sents().length, text: t('apNextSentence'), onclick: () => goSentence(S.item + 1) }));
}

async function drawGraph(el) {
  const key = `${S.skillset}|${S.doc}|${S.item}|${S.graphStamp}|${S.node}|${S.wave}`;
  if (ui.graph?.key !== key) {
    try {
      const g = await sentenceGraph(S.item);
      ui.graph = { key, g };
    } catch { return; }
    if (S.mode !== 'apprentice') return;
  }
  const g = ui.graph.g;
  if (!g.nodes.length) { clear(el); return; }
  clear(el, h('div', { class: 'ap-label', text: t(S.wave === DOCUMENT_WAVE ? 'apDocSoFar' : 'apSoFar') }),
    S.wave === DOCUMENT_WAVE ? relationsBlock(g) : null,
    graphPanel(g, { onPick: () => {}, docRelations: false, help: '' }));
}

function draw() {
  const el = document.getElementById('focus');
  if (S.mode !== 'apprentice' || !S.desc) return;
  if (S.wave !== SENTENCE_WAVE && S.wave !== DOCUMENT_WAVE) {      // nothing is generated ahead here
    if (!ui.switching) { ui.switching = true; selectWave(SENTENCE_WAVE).finally(() => { ui.switching = false; }); }
    return;
  }
  if (el.dataset.view !== 'apprentice') {
    el.dataset.view = 'apprentice';
    clear(el, h('div', { class: 'ap' }, h('div', { class: 'ap-header' }), h('div', { class: 'ap-step' }), h('div', { class: 'ap-graph' })));
    el.querySelector('.ap-graph').addEventListener('click', (e) => { if (e.target.closest('.graph-tools')) ui.drawn = ''; }, true);
    ui.drawn = '';
  }
  // the step waiting to be checked is the one on screen
  const first = waiting();
  if (first && S.node !== first.id && !S.running) { selectNode(first.id); return; }
  const d = S.detail && S.episode?.nodes.some((n) => n.id === S.detail.id) ? S.detail : null;
  if (ui.node !== `${S.wave}|${S.item}|${d?.id}`) Object.assign(ui, { node: `${S.wave}|${S.item}|${d?.id}`, editing: false, hinting: false });
  // drawn again only when something it shows changed, so that what is being typed stays
  const sig = JSON.stringify([S.skillset, S.doc, S.wave, S.item, d?.id, d?.status, d?.confirmed, d?.human, S.running > 0, [...S.live.keys()],
    S.graphStamp, S.episode?.error, S.episode?.nodes.length, ui.editing, ui.hinting, getLang()]);
  if (sig === ui.drawn) return;
  ui.drawn = sig;
  clear(el.querySelector('.ap-header'), header());
  const main = primary();
  clear(el.querySelector('.ap-step'), S.running > 0 ? workingCard() : first && d?.id === first.id ? stepCard(d, main) : restCard(main));
  drawGraph(el.querySelector('.ap-graph'));
}

onRender(draw);

document.addEventListener('keydown', (e) => {
  if (S.mode !== 'apprentice' || (e.key !== 'Enter' && e.key !== 'Tab') || e.shiftKey || !freeKey(e) || S.running > 0) return;
  if (e.key === 'Tab') {
    const first = waiting();
    if (!first || first.kind === 'rule' || ui.editing) return;
    e.preventDefault();
    ui.hinting = true;
    render();
    return;
  }
  const main = primary();
  if (!main) return;
  e.preventDefault();
  main.run();
});
