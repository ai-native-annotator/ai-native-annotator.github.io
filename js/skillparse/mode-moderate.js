/**
 * Moderate mode: several annotators' pull requests for the same file (github.js), compared and
 * made into one version, which is merged into the base branch.
 *
 *   setup   the repository, branch and file; the open pull requests that annotate it; start
 *   left    the sentences: agreed by all (taken as they are), decided, still open
 *   middle  how much the annotators agree (Smatch over the paired nodes, bridge/iaa.py); for the
 *           sentence on screen two annotations side by side, the lines that differ marked, the
 *           list of differences, what a model says about each (user_panel compare_annotations),
 *           and what the merged version has for it: one annotator's, or that changed by hand
 *           in the expert mode
 *
 * The merged version is a document of this page like any other (its sentences are put in through
 * wave 0, as generated ones are), so everything the other modes do works on it. What was fetched
 * and decided is kept in this browser (localStorage), by the document's name.
 */

import { h, clear, toast, openModal, closeModal } from './ui.js';
import { S, SENTENCE_WAVE, onRender, render, selectWave, selectItem, sentenceGraph, runPanel, afterChange, assembled, status } from './core.js';
import { py } from './py.js';
import { lineDiff } from './diff.js';
import { importDocument, openImported } from './dialogs.js';
import { annotationPulls, fileText, docSource, umrPath, mergeModerated } from './github.js';
import { needToken, sourceFields } from './github-ui.js';
import { readJson, writeJson } from './local.js';
import { setMode } from './modes.js';
import { addStrings, t, getLang } from './i18n.js';

addStrings({
  modeModerate: '审定',
  moSetupTitle: '审定：把几位标注者的 pull request 合成一个版本',
  moSetupDesc: '每位标注者用「GitHub ▾ → 提交我的标注」为同一个文件各开一个 pull request。这里把它们取下来逐句比较：一致的句子直接采用，不一致的由你决定用谁的，或者自己改；最后把定下来的版本合并进主分支。',
  moFind: '找这个文件的标注', moNone: '这个文件现在没有打开的标注 pull request。', moStart: '开始审定（{n} 份）', moNeedTwo: '至少要两份标注才能比较。',
  moFetching: '正在取 #{n}（{login}）…', moComparing: '正在比较…', moTaking: '一致的句子直接采用：{k}/{n}', moNoFile: '#{n} 里没有 {path}',
  moProgress: '已定 {done}/{n} 句', moMerge: '合并进 {base}…', moAgreement: '一致性（{n} 句）', moPair: '比较', moGraphF: '句级图 Smatch F', moDocF: '文档级关系 F', moSame: '完全一致的句子',
  moSentence: '第 {n} 句', moAllSame: '几份标注完全一致，已直接采用。', moDiffer: '这一句的 Smatch F：{f}（文档级 {d}）',
  moUse: '用这一份', moUsed: '✓ 现在用的是这一份', moOpenPr: 'pull request #{n}', moDocLevel: '文档级标注',
  moDifferences: '差别（{n} 处）', moNoDifferences: '按三元组比，这两份没有差别。', moOnlyA: '只有 {a} 有', moNothing: '（没有）',
  moKind: { node: '节点', concept: '概念', attribute: '属性', alignment: '对齐', role: '关系标签', relation: '关系', top: '根', document: '文档级关系', 'document-label': '文档级关系的标签', unreadable: '读不了' },
  moAsk: '让模型讲讲这些差别', moAskAll: '让模型把有差别的 {n} 句都过一遍', moAsking: '模型正在看第 {n} 句…', moModel: '模型的看法', moPrefer: { A: '倾向 {a}', B: '倾向 {b}', either: '两种都可以', neither: '两边都不对' },
  moResult: '合并版本里这一句', moFrom: '取自 {who}', moEdited: '取自 {who}，之后手动改过', moUndecided: '还没定：选一份，或者选一份之后再改。', moEdit: '✎ 自己改（到专家模式改这一句）', moBack: '改完回到「审定」。',
  moPrev: '上一句', moNext: '下一句没定的', moDropped: '有 {n} 条跨句的文档级关系对不上另一句现在用的标注，没有带过来：{list}',
  moMergeTitle: '合并进 {base}', moMergeDesc: '定下来的版本会写到一个新分支 adjudicate/…，开一个 pull request（写明比较了哪几份、一致性、每句取自谁），然后合并进 {base}。',
  moMergeLeft: '还有 {n} 句没定（第 {list} 句）：这些句子在合并版本里是空的。', moCloseOthers: '合并后关闭各位标注者的 pull request（留一条说明）', moMergeGo: '合并', moMergeTitleLabel: 'pull request 的标题',
  moMerged: '已合并：pull request #{n}', moNotMerged: '已开 pull request #{n}，但没能合并（{e}）：请在 GitHub 上合并。', moLeave: '换一个文件',
}, {
  modeModerate: 'Moderate',
  moSetupTitle: 'Moderate: several annotators\' pull requests made into one version',
  moSetupDesc: 'Each annotator opens a pull request for the same file with “GitHub ▾ → Submit my annotation”. Here they are fetched and compared sentence by sentence: sentences everybody agrees on are taken as they are; for the others you decide whose to use, or change it yourself; then the version you decided on is merged into the base branch.',
  moFind: 'Find the annotations of this file', moNone: 'No open pull request annotates this file.', moStart: 'Start moderating ({n} annotations)', moNeedTwo: 'Comparing takes at least two annotations.',
  moFetching: 'Fetching #{n} ({login}) …', moComparing: 'Comparing …', moTaking: 'Sentences everybody agrees on are taken: {k}/{n}', moNoFile: '#{n} has no {path}',
  moProgress: '{done} of {n} sentences decided', moMerge: 'Merge into {base}…', moAgreement: 'Agreement ({n} sentences)', moPair: 'Compared', moGraphF: 'Sentence graphs, Smatch F', moDocF: 'Document-level relations, F', moSame: 'Identical sentences',
  moSentence: 'Sentence {n}', moAllSame: 'The annotations are identical; taken as it is.', moDiffer: 'Smatch F of this sentence: {f} (document level {d})',
  moUse: 'Use this one', moUsed: '✓ This is the one in use', moOpenPr: 'pull request #{n}', moDocLevel: 'Document level',
  moDifferences: 'Differences ({n})', moNoDifferences: 'Compared triple by triple, the two do not differ.', moOnlyA: 'only {a} has it', moNothing: '(nothing)',
  moKind: { node: 'node', concept: 'concept', attribute: 'attribute', alignment: 'alignment', role: 'role', relation: 'relation', top: 'top', document: 'document-level relation', 'document-label': 'document-level label', unreadable: 'cannot be read' },
  moAsk: 'Have a model explain these differences', moAskAll: 'Have a model go through all {n} sentences that differ', moAsking: 'The model is reading sentence {n} …', moModel: 'What the model says', moPrefer: { A: 'prefers {a}', B: 'prefers {b}', either: 'either is fine', neither: 'neither is right' },
  moResult: 'This sentence in the merged version', moFrom: 'taken from {who}', moEdited: 'taken from {who}, then changed by hand', moUndecided: 'Not decided yet: use one of the two, or use one and then change it.', moEdit: '✎ Change it myself (this sentence, in the expert mode)', moBack: 'Come back to Moderate when done.',
  moPrev: 'Previous', moNext: 'Next undecided', moDropped: '{n} document-level relations across sentences did not fit the annotation now used for the other sentence and were left out: {list}',
  moMergeTitle: 'Merge into {base}', moMergeDesc: 'The version decided on is written to a new branch adjudicate/…, a pull request is opened (saying which annotations were compared, how much they agree, and whose each sentence is), and it is merged into {base}.',
  moMergeLeft: '{n} sentences are not decided (sentence {list}): they are empty in the merged version.', moCloseOthers: 'Close the annotators\' pull requests after merging (with a note)', moMergeGo: 'Merge', moMergeTitleLabel: 'Title of the pull request',
  moMerged: 'Merged: pull request #{n}', moNotMerged: 'Pull request #{n} is open but could not be merged ({e}): merge it on GitHub.', moLeave: 'Another file',
});

const KEEP = 'skillparse_moderation';
const COMPARE = 'compare_annotations';
const ui = { doc: '', summary: null, opening: null, pulls: null, src: null, busy: '', err: '', detail: null, drawn: '', switching: false, asking: null,
  starting: false, other: false, fields: null };

const session = (id = S.doc) => readJson(KEEP)[id] || null;
function keep(s, id = S.doc) {
  const all = readJson(KEEP);
  if (s) all[id] = s; else delete all[id];
  writeJson(KEEP, all);
}
function update(fn) {
  const s = session();
  if (!s) return null;
  fn(s);
  keep(s);
  return s;
}

const pct = (x) => (x * 100).toFixed(1);
const total = () => S.desc?.doc?.sents?.length || 0;
const hash = (text) => { let n = 0; for (let k = 0; k < text.length; k++) n = (n * 31 + text.charCodeAt(k)) | 0; return n; };
const resultText = (g) => `${g?.penman || ''}\n${g?.document || ''}`;
const pairOf = (s) => (s.pair && s.pair.every((x) => s.annotators.some((a) => a.name === x)) ? s.pair : [s.annotators[0].name, s.annotators[1].name]);
/** The pair as the comparison has it (the annotator listed first is A). */
function ordered(s) {
  const names = s.annotators.map((a) => a.name);
  const [x, y] = pairOf(s);
  return names.indexOf(x) <= names.indexOf(y) ? [x, y] : [y, x];
}
const chosen = (s) => Object.fromEntries(Object.entries(s.taken).map(([k, v]) => [k, v.from]));
const edited = (s) => Object.entries(s.taken).filter(([, v]) => v.edited).map(([k]) => Number(k));

// ------------------------------------------------------------------ setup

async function find(fields) {
  ui.err = '';
  ui.busy = t('moComparing');
  render();
  try {
    ui.src = await fields.read();
    ui.pulls = (await annotationPulls(ui.src)).map((p) => ({ ...p, picked: true }));
  } catch (e) { ui.err = e.message; ui.pulls = null; }
  ui.busy = '';
  ui.drawn = '';
  render();
}

async function start() {
  const src = ui.src;
  const picked = ui.pulls.filter((p) => p.picked);
  ui.err = '';
  ui.starting = true;
  try {
    const path = umrPath(src.path);
    const annotators = [];
    for (const p of picked) {
      ui.busy = t('moFetching', { n: p.number, login: p.login });
      render();
      const text = await fileText(p.repo, path, p.sha);
      if (text === null) throw new Error(t('moNoFile', { n: p.number, path }));
      const name = annotators.some((a) => a.name === p.login) ? `${p.login}#${p.number}` : p.login;
      annotators.push({ name, number: p.number, url: p.url, sha: p.sha, text });
    }
    ui.busy = t('moComparing');
    render();
    // the comparison first: annotations that are not of the same document stop here
    const summary = await py('iaa_open', { annotations: annotators.map((a) => ({ name: a.name, text: a.text })) });
    const name = `${path.split('/').pop().replace(/\.umr$/i, '')}.moderated`;
    const res = await importDocument({ name, text: annotators[0].text, fmt: 'umr' });
    docSource(res.id, src);
    keep({ src, annotators, taken: {}, remarks: {}, pair: null, merged: null }, res.id);
    await openImported(res);
    Object.assign(ui, { summary, doc: S.doc, detail: null, other: false });
    const same = await takeAgreed(summary);
    const s = session();
    const firstOpen = summary.sentences.findIndex((x, i) => !s.taken[i]);
    ui.busy = '';
    ui.pulls = null;
    if (firstOpen > 0) await selectItem(firstOpen);
    status(t('moProgress', { done: same.length, n: summary.count }));
  } catch (e) {
    ui.err = e.message;
    ui.busy = '';
  }
  ui.starting = false;
  ui.drawn = '';
  render();
}

/** What every annotator has the same is put into the merged version as it is. Returns those sentences. */
async function takeAgreed(summary) {
  const same = summary.sentences.map((x, i) => (x.same ? i : -1)).filter((i) => i >= 0);
  const s = session();
  const first = s.annotators[0].name;
  for (const [k, i] of same.entries()) {
    ui.busy = t('moTaking', { k: k + 1, n: same.length });
    status(ui.busy);
    const r = await py('iaa_take', { i, name: first, chosen: chosen(s) });
    if (!r.errors.length) s.taken[i] = { from: first, agreed: true };
  }
  keep(s);
  ui.busy = '';
  await afterChange();
  await stamp(same);
  return same;
}

/** The comparison made again after the page was loaded again; decisions whose work was not kept are dropped. */
async function reopenComparison(s) {
  const summary = await py('iaa_open', { annotations: s.annotators.map((a) => ({ name: a.name, text: a.text })) });
  const items = await py('items', { w: SENTENCE_WAVE });
  if (Object.keys(s.taken).length && items.every((x) => x.status === 'new')) {
    update((x) => { x.taken = {}; });
    await takeAgreed(summary);
  }
  ui.summary = summary;
}

/** What the merged version has for these sentences right now, remembered: a later change is the moderator's. */
async function stamp(list) {
  const marks = {};
  for (const i of list) marks[i] = hash(resultText(await sentenceGraph(i).catch(() => null)));
  update((s) => { for (const i of list) if (s.taken[i]) Object.assign(s.taken[i], { mark: marks[i], edited: false }); });
}

function setup(el) {
  const fields = ui.fields || (ui.fields = sourceFields(docSource(S.doc)));
  const picked = (ui.pulls || []).filter((p) => p.picked).length;
  clear(el, h('div', { class: 'md-setup card' },
    h('h3', { text: t('moSetupTitle') }), h('div', { class: 'note', text: t('moSetupDesc') }), needToken(),
    h('label', { class: 'gh-field' }, h('span', { text: t('ghRepo') }), fields.repo),
    h('label', { class: 'gh-field' }, h('span', { text: t('ghBranch') }), fields.branch),
    h('label', { class: 'gh-field' }, h('span', { text: t('ghPath') }), fields.path),
    h('div', {}, h('button', { class: 'btn md-find', text: t('moFind'), disabled: Boolean(ui.busy), onclick: () => find(fields) })),
    ui.pulls ? (ui.pulls.length ? h('ul', { class: 'md-pulls' }, ui.pulls.map((p) => h('li', {}, h('label', { class: 'row' },
      h('input', { type: 'checkbox', checked: p.picked, onchange: (e) => { p.picked = e.target.checked; ui.drawn = ''; render(); } }),
      h('strong', { text: p.login }), h('a', { href: p.url, target: '_blank', rel: 'noopener', text: `#${p.number}` }),
      h('span', { class: 'note', text: `${p.title} · ${String(p.updated || '').slice(0, 10)}` })))))
      : h('div', { class: 'warn', text: t('moNone') })) : null,
    ui.pulls?.length ? h('div', { class: 'row' },
      h('button', { class: 'btn primary md-start', text: t('moStart', { n: picked }), disabled: picked < 2 || Boolean(ui.busy), onclick: start }),
      picked < 2 ? h('span', { class: 'note', text: t('moNeedTwo') }) : null) : null,
    ui.busy ? h('div', { class: 'loading' }, h('span', { class: 'spinner' }), ui.busy) : null,
    ui.err ? h('div', { class: 'err', text: ui.err }) : null,
    ui.other && session() ? h('div', {}, h('button', { class: 'btn sm ghost', text: t('moPrev'), onclick: () => { ui.other = false; ui.drawn = ''; render(); } })) : null));
}

// ------------------------------------------------------------------ one sentence

async function take(i, name) {
  const s = session();
  ui.busy = name;
  render();
  try {
    const r = await py('iaa_take', { i, name, chosen: chosen(s), keep: edited(s).filter((k) => k !== i) });
    if (r.errors.length) throw new Error(r.errors.map((e) => `#${e.index} ${e.error}`).join('; '));
    update((x) => { x.taken[i] = { from: name }; });
    await afterChange();
    await stamp([i, ...r.again]);
    if (r.dropped.length) toast(t('moDropped', { n: r.dropped.length, list: r.dropped.slice(0, 3).join(' ') }), 9000);
  } catch (e) {
    toast(e.message, 9000);
  }
  ui.busy = '';
  ui.drawn = '';
  render();
}

const remarkKey = (i, a, b) => `${i}|${a}|${b}`;

async function ask(list) {
  const s = session();
  const [a, b] = ordered(s);
  for (const i of list) {
    if (S.cancel && i !== list[0]) break;
    ui.asking = i;
    ui.drawn = '';
    render();
    try {
      const r = await runPanel(COMPARE, i, '', { pair: [a, b] });
      update((x) => { x.remarks[remarkKey(i, a, b)] = { ...r.output, model: r.model }; });
    } catch (e) {
      toast(e.message, 9000);
      break;
    }
  }
  ui.asking = null;
  ui.drawn = '';
  render();
}

/** One annotator's text of the sentence, the lines the other does not have marked. */
function column(side, mine, d, s, i) {
  const who = s.annotators.find((x) => x.name === mine.name);
  const used = s.taken[i]?.from === mine.name && !s.taken[i]?.edited;
  const marked = (ops) => h('pre', { class: 'code md-text' }, ops.filter((x) => x.op === ' ' || x.op === (side === 'a' ? '-' : '+'))
    .map((x) => h('span', { class: x.op === ' ' ? 'md-line' : 'md-line md-diff', text: x.text || ' ' })));
  return h('section', { class: `md-col md-${side}${used ? ' used' : ''}` },
    h('header', { class: 'row' }, h('strong', { class: 'md-who', text: mine.name }),
      who ? h('a', { href: who.url, target: '_blank', rel: 'noopener', class: 'note', text: t('moOpenPr', { n: who.number }) }) : null,
      h('span', { class: 'spacer' }),
      h('button', { class: `btn sm md-use${used ? '' : ' primary'}`, disabled: used || Boolean(ui.busy) || S.running > 0, text: t(used ? 'moUsed' : 'moUse'), onclick: () => take(i, mine.name) })),
    marked(lineDiff(d.a.graph, d.b.graph)),
    h('div', { class: 'note', text: t('moDocLevel') }),
    marked(lineDiff(d.a.document, d.b.document)));
}

function differences(d, a, b) {
  if (!d.differences.length) return h('div', { class: 'note', text: t('moNoDifferences') });
  const cell = (x) => h('td', { class: x ? '' : 'note', text: x || t('moNothing') });
  return h('details', { class: 'md-differences', open: true }, h('summary', { text: t('moDifferences', { n: d.differences.length }) }),
    h('table', { class: 'legend md-table' }, h('thead', {}, h('tr', {}, h('th', {}), h('th', {}), h('th', { text: a }), h('th', { text: b }))),
      h('tbody', {}, d.differences.map((x) => h('tr', {}, h('td', { class: 'note', text: t(`moKind.${x.kind}`) }), h('td', { text: x.where }), cell(x.a), cell(x.b))))));
}

function remarks(s, i, a, b, differing) {
  const r = s.remarks[remarkKey(i, a, b)];
  const busy = ui.asking !== null;
  const buttons = h('div', { class: 'row' },
    h('button', { class: 'btn sm md-ask', disabled: busy || S.running > 0, text: t('moAsk'), onclick: () => ask([i]) }),
    differing.length > 1 ? h('button', { class: 'btn sm md-ask-all', disabled: busy || S.running > 0, text: t('moAskAll', { n: differing.length }), onclick: () => ask(differing) }) : null,
    busy ? h('span', { class: 'loading' }, h('span', { class: 'spinner sm' }), t('moAsking', { n: ui.asking + 1 })) : null);
  if (!r) return h('div', { class: 'md-remarks' }, buttons);
  return h('div', { class: 'md-remarks' }, h('h4', { class: 'fx-h', text: `${t('moModel')}${r.model ? ` · ${r.model}` : ''}` }),
    r.summary ? h('div', { class: 'md-summary', text: r.summary }) : null,
    h('ul', { class: 'md-remark-list' }, (r.differences || []).map((x) => h('li', {},
      h('div', {}, h('strong', { text: x.about || '' }), ' ',
        h('span', { class: `md-prefer md-prefer-${x.prefer}`, text: t(`moPrefer.${x.prefer}`, { a, b }) })),
      h('div', { class: 'md-ab' }, h('span', { text: `${a}: ${x.a || ''}` }), h('span', { text: `${b}: ${x.b || ''}` })),
      h('div', { class: 'note', text: x.why || '' })))),
    buttons);
}

function result(s, i, g) {
  const tk = s.taken[i];
  const label = !tk ? t('moUndecided') : t(tk.edited ? 'moEdited' : 'moFrom', { who: tk.from });
  return h('section', { class: 'md-result' }, h('h4', { class: 'fx-h', text: t('moResult') }),
    h('div', { class: tk ? 'md-decided' : 'warn', text: label }),
    tk && g?.penman ? h('details', { open: Boolean(tk.edited) }, h('summary', { text: 'UMR' }),
      h('pre', { class: 'code md-text', text: `${g.penman}\n\n${g.document || ''}` })) : null,
    tk ? h('div', { class: 'row' }, h('button', { class: 'btn sm md-edit', text: t('moEdit'), onclick: () => { toast(t('moBack')); setMode('expert'); } })) : null);
}

function agreement(s) {
  const names = s.annotators.map((a) => a.name);
  const [a, b] = ordered(s);
  const pickers = names.length > 2 ? h('div', { class: 'row md-pickers' }, h('span', { class: 'note', text: t('moPair') }),
    [a, b].map((cur, k) => h('select', { class: `md-pick-${k ? 'b' : 'a'}`, onchange: (e) => {
      update((x) => { const p = pairOf(x).slice(); p[k] = e.target.value; if (p[0] !== p[1]) x.pair = p; });
      ui.detail = null; ui.drawn = ''; render();
    } }, names.map((n) => h('option', { value: n, text: n, selected: n === cur }))))) : null;
  return h('details', { class: 'md-agreement', open: true }, h('summary', { text: t('moAgreement', { n: ui.summary.count }) }),
    h('table', { class: 'legend md-table' }, h('thead', {}, h('tr', {}, h('th', {}), h('th', { text: t('moGraphF') }), h('th', { text: t('moDocF') }), h('th', { text: t('moSame') }))),
      h('tbody', {}, ui.summary.pairs.map((p) => h('tr', { class: p.a === a && p.b === b ? 'on' : '' },
        h('td', { text: `${p.a} · ${p.b}` }), h('td', { text: pct(p.graph.f) }), h('td', { text: pct(p.document.f) }), h('td', { text: `${p.same}/${ui.summary.count}` }))))),
    pickers);
}

async function drawMain(el) {
  const s = session();
  const i = S.item;
  const [a, b] = ordered(s);
  const key = `${S.doc}|${i}|${a}|${b}|${S.graphStamp}`;
  if (ui.detail?.key !== key) {
    try {
      const [d, g] = await Promise.all([py('iaa_sentence', { i, a, b }), sentenceGraph(i).catch(() => null)]);
      if (S.item !== i || S.mode !== 'moderate') return;
      ui.detail = { key, d, g };
      // the merged version's sentence is not what was taken any more: the moderator changed it
      const tk = s.taken[i];
      if (tk && tk.mark !== undefined && !tk.edited && hash(resultText(g)) !== tk.mark) update((x) => { x.taken[i].edited = true; });
    } catch (e) {
      clear(el, h('div', { class: 'err', text: e.message }));
      return;
    }
  }
  const { d, g } = ui.detail;
  const now = session();
  const info = ui.summary.sentences[i];
  const differing = ui.summary.sentences.map((x, k) => (x.same ? -1 : k)).filter((k) => k >= 0);
  const nextOpen = () => { const k = differing.find((x) => x > i && !now.taken[x]) ?? differing.find((x) => !now.taken[x]); if (k !== undefined) selectItem(k); };
  clear(el, agreement(now),
    h('div', { class: 'fx-title' }, h('strong', { text: t('moSentence', { n: i + 1 }) }), h('span', { class: 'note', text: `/ ${total()}` })),
    h('div', { class: 'fx-sentence', text: S.desc.doc.sents[i]?.text || '' }),
    h('div', { class: info.same ? 'md-same' : 'note', text: info.same ? t('moAllSame') : t('moDiffer', { f: pct(d.scores.graph.f), d: pct(d.scores.document.f) }) }),
    h('div', { class: 'md-cols' }, column('a', d.a, d, now, i), column('b', d.b, d, now, i)),
    differences(d, a, b),
    d.differences.length ? remarks(now, i, a, b, differing) : null,
    result(now, i, g),
    h('div', { class: 'row md-nav' }, h('button', { class: 'btn', disabled: i === 0, text: t('moPrev'), onclick: () => selectItem(i - 1) }),
      h('button', { class: 'btn primary md-next', text: t('moNext'), disabled: !differing.some((x) => !now.taken[x]), onclick: nextOpen })));
}

function drawList(el) {
  const s = session();
  const [a, b] = ordered(s);
  const pair = ui.summary.pairs.find((p) => p.a === a && p.b === b);
  const done = Object.keys(s.taken).length;
  clear(el,
    h('div', { class: 'fx-progress' }, h('span', { text: t('moProgress', { done, n: total() }) }),
      h('button', { class: 'btn sm primary md-merge', text: t('moMerge', { base: s.src.base }), onclick: mergeDialog })),
    s.merged ? h('div', { class: 'md-merged' }, h('a', { href: s.merged.url, target: '_blank', rel: 'noopener', text: t('moMerged', { n: s.merged.number }) })) : null,
    h('ol', { class: 'fx-sentences' }, ui.summary.sentences.map((x, i) => {
      const tk = s.taken[i];
      return h('li', { 'aria-selected': String(i === S.item), class: tk ? (tk.agreed ? 'seen' : 'made') : 'new', onclick: () => selectItem(i) },
        h('span', { class: 'fx-dot', text: tk ? (tk.agreed ? '✓' : '●') : '○' }),
        h('span', { class: 'fx-num', text: i + 1 }), h('span', { class: 'fx-text', text: x.text }),
        x.same ? null : h('span', { class: 'md-f', title: t('moGraphF'), text: pct(pair?.sentences[i]?.f ?? 0) }),
        tk && !tk.agreed ? h('span', { class: 'md-by', text: tk.edited ? `${tk.from}✎` : tk.from }) : null);
    })),
    h('div', { class: 'md-leave' }, h('button', { class: 'btn sm ghost', text: t('moLeave'), onclick: () => { ui.other = true; ui.drawn = ''; render(); } })));
}

// ------------------------------------------------------------------ merging

/** What the merge's pull request says: what was compared, how much it agrees, whose each sentence is. */
function mergeBody(s) {
  const lines = [`Adjudicated UMR annotation of \`${umrPath(s.src.path)}\`, made with the SkillParse workbench (Moderate mode).`, '',
    '### Annotations compared', '', ...s.annotators.map((a) => `- ${a.name}: #${a.number} (${a.sha.slice(0, 7)})`), '',
    '### Agreement', '', '| Pair | Sentence graphs (Smatch F) | Document-level relations (F) | Identical sentences |', '|---|---|---|---|',
    ...ui.summary.pairs.map((p) => `| ${p.a} · ${p.b} | ${pct(p.graph.f)} | ${pct(p.document.f)} | ${p.same}/${ui.summary.count} |`), '',
    '### Decisions', ''];
  const by = {};
  let agreed = 0;
  for (let i = 0; i < ui.summary.count; i++) {
    const tk = s.taken[i];
    if (tk?.agreed) agreed++;
    else (by[!tk ? 'not decided' : tk.edited ? `${tk.from}, changed by the moderator` : tk.from] ||= []).push(i + 1);
  }
  lines.push(`- identical in all annotations: ${agreed} sentences`);
  for (const [who, list] of Object.entries(by)) lines.push(`- ${who}: sentence ${list.join(', ')}`);
  return lines.join('\n');
}

function mergeDialog() {
  const s = session();
  const open = ui.summary.sentences.map((x, i) => i).filter((i) => !s.taken[i]);
  const title = h('input', { type: 'text', class: 'md-merge-title', value: `Adjudicated annotation of ${umrPath(s.src.path)}` });
  const close = h('input', { type: 'checkbox', checked: true, class: 'md-close-others' });
  const out = h('div', { class: 'gh-done' });
  const err = h('div', { class: 'err' });
  const go = h('button', { class: 'btn primary md-merge-go', text: t('moMergeGo') });
  go.addEventListener('click', async () => {
    go.disabled = true;
    err.textContent = '';
    try {
      S.umrStale = true;
      const u = await assembled(true);
      const r = await mergeModerated(s.src, u.text, { title: title.value.trim(), body: mergeBody(s), others: s.annotators.map((a) => a.number),
        closeOthers: close.checked, onStep: (k) => { out.textContent = t(`ghStep.${k}`); } });
      clear(out, h('strong', { text: r.merged ? t('moMerged', { n: r.number }) : t('moNotMerged', { n: r.number, e: r.problem }) }), ' ',
        h('a', { href: r.url, target: '_blank', rel: 'noopener', text: t('ghView') }));
      if (r.merged) { update((x) => { x.merged = { url: r.url, number: r.number }; }); ui.drawn = ''; render(); }
      if (r.merged && r.problem) err.textContent = r.problem;
    } catch (e) { err.textContent = e.message; out.textContent = ''; }
    go.disabled = false;
  });
  openModal(t('moMergeTitle', { base: s.src.base }), h('div', { style: 'display:grid;gap:8px' },
    h('div', { class: 'note', text: t('moMergeDesc', { base: s.src.base }) }),
    open.length ? h('div', { class: 'warn md-left', text: t('moMergeLeft', { n: open.length, list: open.slice(0, 12).map((i) => i + 1).join(', ') }) }) : null,
    h('label', { class: 'gh-field' }, h('span', { text: t('moMergeTitleLabel') }), title),
    h('label', { class: 'row' }, close, h('span', { text: t('moCloseOthers') })),
    err, h('div', { class: 'row' }, go, h('button', { class: 'btn', text: t('close'), onclick: closeModal })), out), { wide: false });
}

// ------------------------------------------------------------------ drawing

function draw() {
  const el = document.getElementById('focus');
  if (S.mode !== 'moderate' || !S.desc) return;
  const s = session();
  if (ui.doc !== S.doc && !ui.starting) Object.assign(ui, { doc: S.doc, summary: null, detail: null, drawn: '', other: false, fields: null, pulls: null, err: '' });
  if (!s || ui.other || ui.starting) {
    if (el.dataset.view !== 'moderate-setup') { el.dataset.view = 'moderate-setup'; ui.drawn = ''; }
    const sig = JSON.stringify([S.doc, ui.busy, ui.err, ui.pulls?.map((p) => p.picked), getLang()]);
    if (sig !== ui.drawn) { ui.drawn = sig; setup(el); }
    return;
  }
  if (S.wave !== SENTENCE_WAVE) {
    if (!ui.switching) { ui.switching = true; selectWave(SENTENCE_WAVE).finally(() => { ui.switching = false; }); }
    return;
  }
  if (!ui.summary) {            // the page was loaded again: the comparison is made again from what was fetched
    if (!ui.opening) {
      ui.opening = reopenComparison(s).catch((e) => { ui.err = e.message; keep(null); })
        .finally(() => { ui.opening = null; ui.drawn = ''; render(); });
    }
    clear(el, h('div', { class: 'loading' }, h('span', { class: 'spinner' }), t('moComparing')));
    el.dataset.view = '';
    return;
  }
  if (el.dataset.view !== 'moderate') {
    el.dataset.view = 'moderate';
    clear(el, h('nav', { class: 'fx-list md-list' }), h('div', { class: 'fx-main md-main' }));
    ui.drawn = '';
  }
  drawList(el.querySelector('.md-list'));
  const sig = JSON.stringify([S.doc, S.item, S.graphStamp, S.running > 0, ui.busy, ui.asking, pairOf(s), Object.keys(s.remarks).length, s.taken[S.item], getLang()]);
  if (sig !== ui.drawn || !el.querySelector('.md-main').childNodes.length) {
    ui.drawn = sig;
    drawMain(el.querySelector('.md-main'));
  }
}

onRender(draw);
