/**
 * Expert mode: the whole document is generated at once (one button), then corrected sentence by
 * sentence.
 *
 *   left    the sentences, each with whether it has a graph and whether it has been looked at
 *   middle  one sentence: its tool calls (closed), its UMR text (graph, then document-level
 *           annotation as the file has them), its drawing (closed), its document-level relations
 *           written with the words they are about (not variables), and "next sentence"
 *   right   a chat: say what is wrong, with this sentence or all over the document (user_panel
 *           global_change is given the whole document and which sentence is on screen); each
 *           change proposed says its sentence, is shown in color on that sentence, picked, and
 *           applied
 *
 * Nothing here is about steps: they are made and kept underneath (wave 0 loads each sentence
 * into the sentence and document waves), and the manual mode shows them. Keys: Enter applies the
 * proposal on screen, else goes to the next sentence; Shift+Enter goes back.
 */

import { h, clear, toast } from './ui.js';
import { S, SENTENCE_WAVE, onRender, render, selectWave, selectItem, sentenceGraph, generateDocument, regenerateSentence,
  runPanel, applyPanel, panelKey, afterChange, stop } from './core.js';
import { py } from './py.js';
import { graphPanel } from './pane-work.js';
import { changeLine } from './pane-ai.js';
import { currentChoice, route } from './models.js';
import { openSettings, exportAs } from './dialogs.js';
import { readJson, writeJson } from './local.js';
import { addStrings, t, getLang } from './i18n.js';
import { freeKey } from './modes.js';

addStrings({
  fxGraphHelp: '点概念、属性的值或关系的标签就能改（回车保存；属性清空 = 删掉）；点框的其他地方，把它填进右边的对话框。',
  fxProgress: '已看 {done} / {n} 句', fxSentence: '第 {n} 句', fxNoGraph: '这一句还没有图。',
  fxGenerating: '正在写第 {a}–{b} 句（共 {n} 句）', fxDoneOf: '已完成 {done}/{n} 句', fxElapsed: '已用 {t}', fxLeftMin: '大约还要 {n} 分钟', fxLeftSec: '大约还要 {n} 秒',
  fxAlmost: '比平时慢，快好了…', fxLooked: '查了 {n} 次资料', fxWhileWaiting: '前几句先出来：写好的句子左边会亮起来，可以先点进去改。估计的时间按这个浏览器里上次的速度算。', fxGenerateAll: '▶ 生成整篇',
  fxStartHelp: '这篇文档 {n} 句，还没有标注。点一下，「{model}」一次写出整篇的图、对齐和文档级标注，然后一句一句改。', fxGenerateFrom: '从这一句起继续生成', fxGenerateOne: '只生成这一句',
  fxNeedKey: '整篇生成要用「{model}」，还没有能用的 key。', fxOpenSettings: '去设置里填 key',
  fxRegen: '↻ 重新生成这句', fxRegenHint: '可以写一句提示（可不写）', fxNext: '确认，下一句', fxPrev: '上一句', fxAllDone: '每一句都看过了，可以导出。',
  fxUmr: 'UMR 文本', fxGraph: '图（点开看）', fxDoc: '文档级关系', fxDocNone: '这一句还没有文档级关系。', fxFromEvent: '来自事件的 modstr（在图里改）',
  fxAddRel: '＋ 加一条关系', fxAdd: '加上', fxDelete: '删掉', fxOtherSent: '句{n}', fxPick: '（选一个）',
  fxGroup: { temporal: '时间', modal: '情态', coref: '共指' },
  fxConst: { author: '作者', 'document-creation-time': '文档创建时间', root: 'root', 'null-conceiver': '无 conceiver' },
  fxTools: '工具调用（{n}）', fxToolsNone: '这一句没有工具调用。', fxSimulated: '模拟',
  fxChat: '改图', fxChatHelp: '可以说这一句，也可以说全文', fxAsked: '看着第 {n} 句时说的',
  fxSay: '说哪里不对（回车发送）：可以只说这一句，也可以说全文里要统一改的，比如「共和党都标成 political-party」。点图里的节点可以把它填进来。',
  fxThinking: '在想…', fxNoChanges: '没有要改的。', fxApply: '应用 {n} 处', fxApplyDoc: '应用 {n} 处（{k} 句）', fxDiscard: '放弃',
  fxApplied: '已应用 {ok}/{n} 处。', fxDiscarded: '已放弃。', fxCannot: '做不了：{why}', fxJump: '去第 {n} 句看',
  fxExport: '导出 .umr',
}, {
  fxGraphHelp: "Click a concept, an attribute's value or a relation's label to change it (Enter keeps it; an attribute left empty goes); click elsewhere on a box to name it in the chat.",
  fxProgress: '{done} of {n} sentences checked', fxSentence: 'Sentence {n}', fxNoGraph: 'This sentence has no graph yet.',
  fxGenerating: 'Writing sentences {a}–{b} (of {n})', fxDoneOf: '{done} of {n} done', fxElapsed: '{t} so far', fxLeftMin: 'about {n} min left', fxLeftSec: 'about {n} s left',
  fxAlmost: 'slower than usual, nearly there …', fxLooked: '{n} look-ups', fxWhileWaiting: 'The first sentences come first: a sentence lights up on the left when it is written, and can be corrected at once. The estimate goes by the speed last measured in this browser.', fxGenerateAll: '▶ Generate the document',
  fxStartHelp: 'This document has {n} sentences and no annotation yet. One click, and “{model}” writes the whole document (graphs, alignment, document-level annotation); then you correct it sentence by sentence.', fxGenerateFrom: 'Go on generating from this sentence', fxGenerateOne: 'Generate this sentence only',
  fxNeedKey: 'The document is generated with “{model}”, and no key reaches it yet.', fxOpenSettings: 'Add a key in Settings',
  fxRegen: '↻ Generate this sentence again', fxRegenHint: 'A hint, if you like', fxNext: 'Right, next sentence', fxPrev: 'Previous', fxAllDone: 'Every sentence has been checked: ready to export.',
  fxUmr: 'UMR text', fxGraph: 'Drawing (open to see)', fxDoc: 'Document-level relations', fxDocNone: 'This sentence has no document-level relations yet.', fxFromEvent: "from the event's modstr (change it in the graph)",
  fxAddRel: '+ Add a relation', fxAdd: 'Add', fxDelete: 'Delete', fxOtherSent: 'snt {n}', fxPick: '(pick one)',
  fxGroup: { temporal: 'temporal', modal: 'modal', coref: 'coref' },
  fxConst: { author: 'author', 'document-creation-time': 'document creation time', root: 'root', 'null-conceiver': 'null conceiver' },
  fxTools: 'Tool calls ({n})', fxToolsNone: 'No tool calls for this sentence.', fxSimulated: 'simulated',
  fxChat: 'Change the graph', fxChatHelp: 'about this sentence, or the whole document', fxAsked: 'said while looking at sentence {n}',
  fxSay: 'Say what is wrong (Enter sends): about this sentence only, or something to change all over the document, e.g. “every Republican Party is a political-party”. Click a node of the drawing to name it here.',
  fxThinking: 'Thinking …', fxNoChanges: 'Nothing to change.', fxApply: 'Apply {n}', fxApplyDoc: 'Apply {n} (in {k} sentences)', fxDiscard: 'Discard',
  fxApplied: '{ok} of {n} applied.', fxDiscarded: 'Discarded.', fxCannot: 'Cannot: {why}', fxJump: 'Look at sentence {n}',
  fxExport: 'Export .umr',
});

/** The labels a relation of each group usually has (any other can still be kept as it is). */
const LABELS = {
  temporal: ['before', 'after', 'overlap', 'contained', 'depends-on'],
  modal: ['full-affirmative', 'partial-affirmative', 'neutral-affirmative', 'neutral-negative', 'partial-negative', 'full-negative', 'unspecified'],
  coref: ['same-entity', 'same-event', 'subset-of'],
};
const GROUPS = ['temporal', 'modal', 'coref'];
const CONSTANTS = ['author', 'document-creation-time', 'root', 'null-conceiver'];
/** The chat's skill (registry user_panel): it is given the whole document, and which sentence is on screen. */
const CHANGE = 'global_change';

const ui = {
  doc: '',                // the document this state is about
  log: [],                // the chat: {who: 'me' | 'ai' | 'note', text, item, proposal}
  proposal: null,         // the one being decided: {name, item, summary, changes, picked, results, tools}
  thinking: false,
  graph: null,            // {key, g}: the shown sentence's graph
  previewed: '',          // what the preview on screen was made from
  tools: null,            // {key, calls}: the shown sentence's tool calls, once asked for
  nodes: null,            // {key, list}: the nodes a new relation may name
  drawn: '',
  open: { umr: true, graph: false },     // which folding parts of the sentence are open
};

const docKey = () => `${S.skillset}|${S.doc}`;
const total = () => S.desc?.doc?.sents?.length || 0;
const hasGraph = (i) => (S.items[i]?.status || 'new') !== 'new';

function reviewed() {
  return new Set(readJson('skillparse_reviewed')[docKey()] || []);
}

function markReviewed(i) {
  const all = readJson('skillparse_reviewed');
  all[docKey()] = [...new Set([...(all[docKey()] || []), i])];
  writeJson('skillparse_reviewed', all);
}

async function go(i) {
  if (i < 0 || i >= total()) return;
  await selectItem(i);
}

async function next() {
  markReviewed(S.item);
  if (S.item + 1 < total()) await go(S.item + 1);
  else { toast(t('fxAllDone'), 5000); render(); }
}

// ------------------------------------------------------------------ generating

async function generate(from) {
  const r = await generateDocument(from);
  if (r?.error) toast(r.error, 8000);
  const first = [...Array(total()).keys()].find((i) => hasGraph(i) && !reviewed().has(i));
  await go(hasGraph(S.item) ? S.item : first ?? 0);
}

async function regenerate(hint) {
  const error = await regenerateSentence(S.item, hint);
  if (error) toast(error, 8000);
}

// ------------------------------------------------------------------ the chat: proposals

/** The sentence (0-based) a change of a whole-document proposal is about. */
function sentenceOf(c) {
  const said = Number(c.sentence);
  if (Number.isInteger(said) && said >= 1) return said - 1;
  const m = /"s(\d+)[A-Za-z]/.exec(JSON.stringify(c));
  return m ? Number(m[1]) - 1 : -1;
}

/** The sentence a change is about: the one it says, else the one that was on screen when it was asked for. */
const whereOf = (p, k) => { const at = sentenceOf(p.changes[k]); return at >= 0 && at < total() ? at : p.item; };
const pickedAt = (p, i) => p.changes.map((_, k) => k).filter((k) => p.picked[k] && whereOf(p, k) === i);

/** The picked changes of the shown sentence, tried on its graph and drawn in color (nothing is changed). */
async function preview() {
  const p = ui.proposal;
  const i = S.item;
  const idx = p ? pickedAt(p, i) : [];
  const made = `${docKey()}|${i}|${S.graphStamp}|${p ? p.id : ''}|${idx.join(',')}`;
  if (made === ui.previewed) return;
  ui.previewed = made;
  if (!idx.length) {
    if (S.preview?.key === panelKey(i)) { S.preview = null; render(); }
    return;
  }
  try {
    const pv = await py('preview_changes', { i, name: p.name, changes: idx.map((k) => p.changes[k]) });
    if (ui.previewed !== made) return;
    pv.applied.forEach((a, n) => p.results.set(idx[n], a));
    S.preview = { key: panelKey(i), lines: pv.lines, graph: pv.graph, n: idx.length, stamp: Date.now() };
  } catch (err) {
    idx.forEach((k) => p.results.set(k, { ok: false, why: err.message }));
    if (S.preview?.key === panelKey(i)) S.preview = null;
  }
  render();
}

async function send(text) {
  const item = S.item;
  if (ui.proposal) discard();
  ui.log.push({ who: 'me', text, item });
  ui.thinking = true;
  render();
  try {
    const r = await runPanel(CHANGE, item, text);
    const changes = Array.isArray(r?.output?.changes) ? r.output.changes : [];
    const p = { id: Date.now(), name: CHANGE, item, summary: r?.output?.summary || '', changes,
      picked: changes.map(() => true), results: new Map(), tools: r?.tool_calls || [] };
    ui.log.push({ who: 'ai', proposal: p });
    ui.proposal = changes.length ? p : null;
  } catch (err) {
    ui.log.push({ who: 'note', text: `${t('error')}: ${err.message}` });
  }
  ui.thinking = false;
  render();
}

function discard() {
  if (!ui.proposal) return;
  ui.proposal.closed = t('fxDiscarded');
  ui.proposal = null;
  if (S.preview) S.preview = null;
  render();
}

async function apply() {
  const p = ui.proposal;
  if (!p || S.running) return;
  const where = [...new Set(p.changes.map((_, k) => (p.picked[k] ? whereOf(p, k) : -1)).filter((i) => i >= 0))].sort((a, b) => a - b);
  let ok = 0;
  let n = 0;
  const problems = [];
  ui.proposal = null;
  for (const i of where) {
    const idx = pickedAt(p, i);
    n += idx.length;
    try {
      const r = await applyPanel(p.name, i, idx.map((k) => p.changes[k]));
      r.applied.forEach((a, m) => p.results.set(idx[m], a));
      ok += r.applied.filter((a) => a.ok).length;
      problems.push(...r.problems);
    } catch (err) {
      idx.forEach((k) => p.results.set(k, { ok: false, why: err.message }));
      problems.push(err.message);
    }
  }
  p.closed = `${t('fxApplied', { ok, n })}${problems.length ? ` ${problems.slice(0, 3).join(t('listSep'))}` : ''}`;
  S.preview = null;
  render();
}

function proposalView(p) {
  const live = p === ui.proposal;
  const n = p.picked.filter(Boolean).length;
  const sentences = new Set(p.changes.map((_, k) => (p.picked[k] ? whereOf(p, k) : -1)).filter((i) => i >= 0)).size;
  return h('div', { class: 'fx-proposal' },
    h('div', { text: p.summary || (p.changes.length ? '' : t('fxNoChanges')) }),
    p.changes.length ? h('div', { class: 'change-list' }, p.changes.map((c, k) => {
      const at = whereOf(p, k);
      const res = p.results.get(k);
      const box = h('input', { type: 'checkbox', checked: p.picked[k], disabled: !live });
      box.addEventListener('change', () => { p.picked[k] = box.checked; ui.previewed = ''; render(); });
      // a change of a whole-document proposal is looked at in its own sentence
      const jump = at >= 0
        ? h('button', { class: `btn sm link fx-jump${at === S.item ? ' here' : ''}`, title: t('fxJump', { n: at + 1 }), text: t('fxOtherSent', { n: at + 1 }), onclick: () => go(at) }) : null;
      return h('div', { class: `change-item${res && !res.ok ? ' failed' : ''}${at === S.item ? ' here' : ''}` },
        h('label', {}, box, jump, h('span', { class: 'change-op', text: changeLine(c) })),
        c.reason ? h('div', { class: 'note', text: c.reason }) : null,
        res && !res.ok ? h('div', { class: 'err', text: t('fxCannot', { why: res.why }) }) : null);
    })) : null,
    p.tools.length ? h('details', {}, h('summary', { class: 'note', text: t('fxTools', { n: p.tools.length }) }),
      p.tools.map((c) => h('div', { class: 'note mono', text: `${c.tool}(${JSON.stringify(c.args)})` }))) : null,
    live ? h('div', { class: 'row' },
      h('button', { class: 'btn primary fx-apply', disabled: !n || S.running > 0,
        text: sentences > 1 ? t('fxApplyDoc', { n, k: sentences }) : t('fxApply', { n }), onclick: apply }, h('kbd', { text: 'Enter' })),
      h('button', { class: 'btn fx-discard', text: t('fxDiscard'), onclick: discard })) : null,
    p.closed ? h('div', { class: 'note fx-closed', text: p.closed }) : null);
}

function drawChat(el) {
  const log = el.querySelector('.fx-log');
  const tag = (e) => t('fxAsked', { n: e.item + 1 });
  clear(log, ui.log.map((e) => (e.who === 'me' ? h('div', { class: 'fx-turn me' }, h('span', { class: 'fx-tag', text: tag(e) }), h('div', { text: e.text }))
    : e.who === 'ai' ? h('div', { class: 'fx-turn ai' }, proposalView(e.proposal))
      : h('div', { class: 'fx-turn note err', text: e.text }))),
  ui.thinking ? h('div', { class: 'loading' }, h('span', { class: 'spinner' }), t('fxThinking')) : null);
  log.scrollTop = log.scrollHeight;
  const area = el.querySelector('textarea');
  area.placeholder = t('fxSay');
  area.disabled = ui.thinking;
}

function chatSkeleton() {
  const area = h('textarea', { rows: 3, class: 'fx-say' });
  area.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229 || e.key !== 'Enter' || e.shiftKey) return;
    e.preventDefault();
    const text = area.value.trim();
    if (!text || ui.thinking || S.running > 0) return;
    area.value = '';
    send(text);
  });
  return h('aside', { class: 'fx-chat' },
    h('div', { class: 'fx-chat-head' }, h('strong', { text: t('fxChat') }), h('span', { class: 'note', text: t('fxChatHelp') })),
    h('div', { class: 'fx-log' }), area);
}

// ------------------------------------------------------------------ the sentence

/** One end of a document-level relation as a person reads it: its words, and its sentence when it is another. */
function endChip(v, text, here) {
  const m = /^s(\d+)[A-Za-z]/.exec(v);
  if (!m) return h('span', { class: 'fx-end const', text: t(`fxConst.${v}`) === `fxConst.${v}` ? v : t(`fxConst.${v}`) });
  const n = Number(m[1]);
  return h('span', { class: 'fx-end', title: v }, `「${text}」`, n !== here ? h('sub', { text: t('fxOtherSent', { n }) }) : null);
}

async function relationChanged(fn) {
  try {
    await fn();
    await afterChange();
  } catch (err) {
    toast(err.message, 6000);
  }
}

/** The sentence's document-level relations, by group, each end as words; with `edit`, they can be changed. */
export function relationsBlock(g, { edit = false } = {}) {
  const i = g.index - 1;
  const rows = GROUPS.concat([...new Set(g.doc.map((r) => r.group))].filter((x) => !GROUPS.includes(x))).map((group) => {
    const rs = g.doc.filter((r) => r.group === group);
    if (!rs.length) return null;
    return h('div', { class: 'fx-rel-group' },
      h('div', { class: 'fx-rel-name', text: t(`fxGroup.${group}`) === `fxGroup.${group}` ? group : t(`fxGroup.${group}`) }),
      h('div', {}, rs.map((r) => {
        const own = edit && r.origin;
        const label = own ? h('select', { class: 'fx-rel-label' },
          [...new Set([...(LABELS[group] || []), r.rel])].map((x) => h('option', { value: x, text: x, selected: x === r.rel }))) : h('span', { class: 'fx-rel-label', text: r.rel });
        if (own) label.addEventListener('change', () => relationChanged(() => py('change_doc_relation', { i, origin: r.origin, relation: label.value })));
        return h('div', { class: 'fx-rel' }, endChip(r.a, r.a_text, g.index), label, endChip(r.b, r.b_text, g.index),
          own ? h('button', { class: 'btn sm ghost fx-rel-del', title: t('fxDelete'), text: '✕',
            onclick: () => relationChanged(() => py('change_doc_relation', { i, origin: r.origin })) })
            : edit ? h('span', { class: 'note', text: t('fxFromEvent') }) : null);
      })));
  }).filter(Boolean);
  return h('div', { class: 'fx-rels' }, rows.length ? rows : h('div', { class: 'note', text: t('fxDocNone') }), edit ? addRelation(i) : null);
}

function addRelation(i) {
  const box = h('div', { class: 'fx-rel-form' });
  const details = h('details', { class: 'fx-rel-add' }, h('summary', { text: t('fxAddRel') }), box);
  details.addEventListener('toggle', async () => {
    if (!details.open || box.childNodes.length) return;
    const key = `${docKey()}|${i}|${S.graphStamp}`;
    if (ui.nodes?.key !== key) ui.nodes = { key, list: await py('doc_nodes', { i }).catch(() => []) };
    const ends = () => h('select', {}, h('option', { value: '', text: t('fxPick') }),
      CONSTANTS.map((c) => h('option', { value: c, text: t(`fxConst.${c}`) })),
      ui.nodes.list.map((n) => h('option', { value: n.var, text: `「${n.text}」${n.sentence !== i + 1 ? ` ${t('fxOtherSent', { n: n.sentence })}` : ''}` })));
    const group = h('select', {}, GROUPS.map((x) => h('option', { value: x, text: t(`fxGroup.${x}`) })));
    const label = h('select', {});
    const fill = () => label.replaceChildren(...LABELS[group.value].map((x) => h('option', { value: x, text: x })));
    group.addEventListener('change', fill);
    fill();
    const a = ends();
    const b = ends();
    clear(box, group, a, label, b, h('button', { class: 'btn sm primary', text: t('fxAdd'), onclick: () => {
      if (!a.value || !b.value) return;
      relationChanged(() => py('add_doc_relation', { i, group: group.value, source: a.value, relation: label.value, target: b.value }));
    } }));
  });
  return details;
}

/** The sentence's tool calls, closed; a call's answer is fetched when it is opened. */
function toolsBlock(i) {
  const list = h('div', { class: 'fx-tools-list' });
  const details = h('details', { class: 'fx-tools' }, h('summary', { text: t('fxTools', { n: ui.tools?.key === `${docKey()}|${i}|${S.graphStamp}` ? ui.tools.calls.length : '…' }) }), list);
  details.addEventListener('toggle', async () => {
    if (!details.open || list.childNodes.length) return;
    const key = `${docKey()}|${i}|${S.graphStamp}`;
    if (ui.tools?.key !== key) ui.tools = { key, calls: await py('sentence_tools', { i }).catch(() => []) };
    details.querySelector('summary').textContent = t('fxTools', { n: ui.tools.calls.length });
    clear(list, ui.tools.calls.length ? ui.tools.calls.map((c) => {
      const out = h('pre', { class: 'block' });
      const one = h('details', {}, h('summary', { class: 'mono' }, `${c.skill} · ${c.tool}(${JSON.stringify(c.args)})`,
        c.simulated ? h('span', { class: 'badge', text: t('fxSimulated') }) : null), out);
      one.addEventListener('toggle', async () => {
        if (one.open && !out.textContent) out.textContent = String(await py('tool_result', { i, nid: c.step, k: c.k }).catch((e) => e.message)).slice(0, 20000);
      });
      return one;
    }) : h('div', { class: 'note', text: t('fxToolsNone') }));
  });
  return details;
}

/** The roles a relation usually has, offered when its label is changed (any other can be typed). */
const ROLES = ['ARG0', 'ARG1', 'ARG2', 'ARG3', 'ARG4', 'ARG5', 'actor', 'undergoer', 'theme', 'experiencer', 'stimulus', 'recipient', 'affectee',
  'causer', 'instrument', 'goal', 'source', 'start', 'companion', 'material', 'mod', 'poss', 'part', 'quant', 'unit', 'name', 'temporal', 'place',
  'manner', 'purpose', 'cause', 'reason', 'condition', 'concession', 'duration', 'frequency', 'extent', 'degree', 'direction', 'path', 'medium',
  'topic', 'example', 'age', 'group', 'other-role', 'quote', 'op1', 'op2', 'op3', 'op4'];

/** A small box where something was clicked, to type its new value: Enter keeps it, Escape leaves it. */
function editAt(ev, value, options, save, { empty = false } = {}) {
  document.querySelector('.fx-pop')?.remove();
  const input = h('input', { type: 'text', class: 'fx-pop-input', value, list: options ? 'fx-pop-list' : undefined });
  const pop = h('div', { class: 'fx-pop', style: `left:${Math.max(8, ev.clientX - 60)}px;top:${ev.clientY + 10}px` }, input,
    options ? h('datalist', { id: 'fx-pop-list' }, options.map((o) => h('option', { value: o }))) : null);
  const close = () => pop.remove();
  input.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    e.stopPropagation();
    const next = input.value.trim().replace(/^:/, '');
    close();
    if ((next || empty) && next !== value) save(next);
  });
  input.addEventListener('blur', () => setTimeout(close, 150));
  document.body.append(pop);
  input.focus();
  input.select();
}

/** A change made by hand on the drawing goes the way the chat's changes go: applied, and the steps follow. */
async function changeGraph(i, changes) {
  if (S.running > 0) return;
  try {
    const r = await applyPanel(CHANGE, i, changes);
    const failed = r.applied.find((a) => !a.ok);
    if (failed || r.problems.length) toast(failed ? t('fxCannot', { why: failed.why }) : r.problems.join(t('listSep')), 7000);
  } catch (err) {
    toast(err.message, 7000);
  }
}

function editConcept(g, i, v, ev) {
  const n = g.nodes.find((x) => x.var === v);
  if (n) editAt(ev, n.concept, null, (concept) => changeGraph(i, [{ op: 'rename_node', var: v, concept }]));
}

/** The values an attribute usually has, offered when it is changed (any other can be typed). */
const VALUES = {
  aspect: ['habitual', 'generic', 'imperfective', 'state', 'reversible-state', 'irreversible-state', 'inherent-state', 'point-state', 'process',
    'atelic-process', 'perfective', 'activity', 'undirected-activity', 'directed-activity', 'iterative', 'endeavor', 'semelfactive',
    'undirected-endeavor', 'directed-endeavor', 'performance', 'incremental-accomplishment', 'nonincremental-accomplishment',
    'directed-achievement', 'reversible-directed-achievement', 'irreversible-directed-achievement', 'inceptive'],
  polarity: ['-'], 'refer-number': ['singular', 'plural', 'dual'], 'refer-person': ['1st', '2nd', '3rd'], mode: ['imperative', 'interrogative', 'expressive'],
};

/** An attribute's value changed; emptied, the attribute goes. */
function editAttr(i, a, ev) {
  editAt(ev, String(a.value), VALUES[a.role] || null,
    (value) => changeGraph(i, [{ op: 'set_attribute', var: a.var, attribute: a.role, value: value || null }]), { empty: true });
}

function editRole(i, e, ev) {
  editAt(ev, e.role, ROLES, (role) => changeGraph(i, [
    { op: 'delete_relation', source: e.src, role: e.role, target: e.tgt },
    { op: 'add_relation', source: e.src, role, target: e.tgt }]));
}

/** Clicking a node of the graph names it in the chat box. */
function nameInChat(g, v) {
  const n = g.nodes.find((x) => x.var === v);
  const area = document.querySelector('#focus .fx-say');
  if (!n || !area) return;
  area.value += `${area.value && !/\s$/.test(area.value) ? ' ' : ''}${v}（${n.words || n.concept}）`;
  area.focus();
}

function sentenceView(g, i) {
  const pv = S.preview?.key === panelKey(i) ? S.preview : null;
  const shown = pv ? pv.graph : g;
  // the sentence's UMR as the file has it: its graph (with a proposal's changes in color), then its
  // document-level annotation as written, variables and all (the same relations are below, in words)
  const lines = pv ? pv.lines.map((ln) => h('span', { style: 'display:block' }, ln.map((x) => (x.m ? h('span', { class: `mk-${x.m}`, text: x.t }) : x.t))))
    : [g.penman || ''];
  const text = h('pre', { class: `block${pv ? ' penman-preview' : ''}` }, lines, h('span', { class: 'fx-umr-doc', text: `\n\n${g.document || ''}` }));
  // what is open stays open from sentence to sentence (the drawing starts closed)
  const fold = (name, summary, body) => {
    const d = h('details', { class: `fx-${name}`, open: ui.open[name] }, h('summary', { text: summary }), body);
    d.addEventListener('toggle', () => { ui.open[name] = d.open; });
    return d;
  };
  const hint = h('input', { type: 'text', class: 'fx-hint', placeholder: t('fxRegenHint') });
  hint.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); regenerate(hint.value.trim()); } });
  return [
    toolsBlock(i),
    fold('umr', t('fxUmr'), text),
    // a concept, an attribute or a relation's label is changed where it is drawn (not while a proposal is shown on it)
    fold('graph', t('fxGraph'), graphPanel(shown, { onPick: (v) => nameInChat(g, v), docRelations: false, help: t('fxGraphHelp'),
      ...(pv ? {} : { onConcept: (v, ev) => editConcept(g, i, v, ev), onAttr: (a, ev) => editAttr(i, a, ev), onEdge: (e, ev) => editRole(i, e, ev) }) })),
    h('h3', { class: 'fx-h', text: t('fxDoc') }),
    relationsBlock(g, { edit: true }),
    h('div', { class: 'fx-actions' },
      h('button', { class: 'btn fx-regen', disabled: S.running > 0, text: t('fxRegen'), onclick: () => regenerate(hint.value.trim()) }), hint,
      h('span', { class: 'grow' }),
      h('button', { class: 'btn fx-prev', disabled: i === 0, text: t('fxPrev'), onclick: () => go(i - 1) }),
      h('button', { class: 'btn primary fx-next', disabled: S.running > 0, text: t('fxNext'), onclick: next }, h('kbd', { text: 'Enter' }))),
  ];
}

function emptyView(i) {
  const model = currentChoice('generate');
  const reach = model && route(model.id);
  const busy = S.running > 0;
  const none = !S.items.some((it) => it.status !== 'new');
  return h('div', { class: `fx-empty${none ? ' fx-start' : ''}` },
    h('div', { class: 'note', text: none ? t('fxStartHelp', { n: total(), model: model?.label || '' }) : t('fxNoGraph') }),
    reach ? h('div', { class: 'row' },
      h('button', { class: 'btn primary fx-generate', disabled: busy, text: t(none ? 'fxGenerateAll' : 'fxGenerateFrom'), onclick: () => generate(none ? 0 : i) }),
      !none ? h('button', { class: 'btn', disabled: busy, text: t('fxGenerateOne'), onclick: () => regenerate('') }) : null)
      : h('div', { class: 'row' }, h('span', { class: 'warn', text: t('fxNeedKey', { model: model?.label || '' }) }),
        h('button', { class: 'btn', text: t('fxOpenSettings'), onclick: openSettings })));
}

const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/**
 * How far the generation is, redrawn every second: a bar (the sentences done, and the answer
 * being written by the time it usually takes), the time so far, and about how long is left.
 */
function progressState() {
  const g = S.generating;
  const now = Date.now();
  const n = g.upto - g.from + 1;
  const spent = (now - g.since) / 1000;
  const expected = Math.max(1, n * g.rate);
  // the answer being written fills its share of the bar as its usual time passes, never quite to the end
  const part = Math.min(0.95, spent / expected);
  const left = Math.max(0, expected - spent) + (g.count - g.done - n) * g.rate;
  return { fraction: (g.done + n * part) / g.count, elapsed: (now - g.started) / 1000, left, late: spent > expected };
}

function progressText(p) {
  const g = S.generating;
  const about = p.left >= 90 ? t('fxLeftMin', { n: Math.round(p.left / 60) }) : t('fxLeftSec', { n: Math.max(5, Math.round(p.left / 5) * 5) });
  return [t('fxGenerating', { a: g.from + 1, b: g.upto + 1, n: g.total }),
    t('fxDoneOf', { done: g.done, n: g.count }), t('fxElapsed', { t: clock(p.elapsed) }),
    p.late && p.left < 1 ? t('fxAlmost') : about,
    g.tools ? t('fxLooked', { n: g.tools }) : ''].filter(Boolean).join(' · ');
}

function progressBanner() {
  const p = progressState();
  return h('div', { class: 'card fx-banner' },
    h('div', { class: 'fx-banner-row' }, h('span', { class: 'spinner' }), h('span', { class: 'fx-banner-text', text: progressText(p) }),
      h('span', { class: 'grow' }), h('button', { class: 'btn sm danger', text: t('stop'), onclick: stop })),
    h('div', { class: 'fx-bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(p.fraction * 100) },
      h('div', { class: 'fx-bar-fill', style: `width:${(p.fraction * 100).toFixed(1)}%` })),
    h('div', { class: 'note', text: t('fxWhileWaiting') }));
}

setInterval(() => {
  const el = S.generating && S.mode === 'expert' ? document.querySelector('#focus .fx-banner') : null;
  if (!el) return;
  const p = progressState();
  el.querySelector('.fx-banner-text').textContent = progressText(p);
  el.querySelector('.fx-bar-fill').style.width = `${(p.fraction * 100).toFixed(1)}%`;
  el.querySelector('.fx-bar').setAttribute('aria-valuenow', String(Math.round(p.fraction * 100)));
}, 1000);

function drawList(el) {
  const seen = reviewed();
  clear(el,
    h('div', { class: 'fx-progress' }, h('span', { text: t('fxProgress', { done: seen.size, n: total() }) }),
      h('button', { class: 'btn sm fx-export', text: t('fxExport'), onclick: () => exportAs('umr').catch((err) => toast(err.message)) })),
    h('ol', { class: 'fx-sentences' }, (S.desc?.doc?.sents || []).map((s, i) => {
      const writing = S.generating && i >= S.generating.from && i <= S.generating.upto && !hasGraph(i);
      return h('li', { 'aria-selected': String(i === S.item), class: seen.has(i) ? 'seen' : hasGraph(i) ? 'made' : 'new', onclick: () => go(i) },
        writing ? h('span', { class: 'spinner sm' }) : h('span', { class: 'fx-dot', text: seen.has(i) ? '✓' : hasGraph(i) ? '●' : '○' }),
        h('span', { class: 'fx-num', text: i + 1 }), h('span', { class: 'fx-text', text: s.text }));
    })));
}

async function drawMain(el) {
  const i = S.item;
  const head = [
    S.generating ? progressBanner() : null,
    h('div', { class: 'fx-title' }, h('strong', { text: t('fxSentence', { n: i + 1 }) }), h('span', { class: 'note', text: `/ ${total()}` })),
    h('div', { class: 'fx-sentence', text: S.desc.doc.sents[i]?.text || '' }),
  ];
  if (!hasGraph(i)) { clear(el, head, S.generating ? null : emptyView(i)); return; }
  const key = `${docKey()}|${i}|${S.graphStamp}`;
  if (ui.graph?.key !== key) {
    if (!el.querySelector('.graph-panel')) clear(el, head, h('div', { class: 'loading' }, h('span', { class: 'spinner' }), '…'));
    try {
      const g = await sentenceGraph(i);
      if (S.item !== i || S.mode !== 'expert') return;
      ui.graph = { key, g };
    } catch (err) {
      clear(el, head, h('div', { class: 'err', text: err.message }));
      return;
    }
  }
  clear(el, head, sentenceView(ui.graph.g, i));
}

function draw() {
  const el = document.getElementById('focus');
  if (S.mode !== 'expert' || !S.desc) return;
  if (S.wave !== SENTENCE_WAVE) {          // the sentences are the sentence wave's items
    if (!ui.switching) { ui.switching = true; selectWave(SENTENCE_WAVE).finally(() => { ui.switching = false; }); }
    return;
  }
  if (ui.doc !== docKey()) Object.assign(ui, { doc: docKey(), log: [], proposal: null, graph: null, tools: null, nodes: null, previewed: '', drawn: '' });
  if (el.dataset.view !== 'expert') {
    el.dataset.view = 'expert';
    clear(el, h('nav', { class: 'fx-list' }), h('div', { class: 'fx-main' }), chatSkeleton());
    // the graph's own buttons (fit to width) draw the middle again
    el.querySelector('.fx-main').addEventListener('click', (e) => { if (e.target.closest('.graph-tools')) ui.drawn = ''; }, true);
    ui.drawn = '';
  }
  drawList(el.querySelector('.fx-list'));
  drawChat(el.querySelector('.fx-chat'));
  // the middle is drawn again only when what it shows changed: an open list or a typed hint stays
  const sig = JSON.stringify([docKey(), S.item, S.graphStamp, S.preview?.stamp, S.running > 0, S.generating, hasGraph(S.item), getLang()]);
  if (sig !== ui.drawn || !el.querySelector('.fx-main').childNodes.length) {
    ui.drawn = sig;
    drawMain(el.querySelector('.fx-main'));
  }
  if (hasGraph(S.item)) preview();
}

onRender(draw);

document.addEventListener('keydown', (e) => {
  if (S.mode !== 'expert' || e.key !== 'Enter' || !freeKey(e) || S.running > 0) return;
  e.preventDefault();
  if (e.shiftKey) go(S.item - 1);
  else if (ui.proposal?.picked.some(Boolean)) apply();
  else if (hasGraph(S.item)) next();
});
