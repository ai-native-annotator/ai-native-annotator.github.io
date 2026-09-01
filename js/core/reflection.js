/**
 * The reflection journal: every problem a human found, recorded but NOT acted on.
 *
 * Until now an accepted proposal amended the skill instantly. That is the wrong
 * shape for annotation work, and this module exists to change it:
 *
 *   - One correction is an anecdote. A rule written from a single case tends to
 *     overfit it, and the skill file accretes narrow patches that quietly fight
 *     each other. What justifies a rule is a *pattern* across several cases.
 *   - A rule that takes effect the instant it is written is never reviewed. By
 *     the time anyone looks, it is already in the prompts and its effects are
 *     mixed into everything downstream.
 *
 * So: every intervention — a hand edit, a re-run, a swapped skill, an objection
 * raised in the chat — becomes an *issue* against the skill it concerns. Issues
 * accumulate. Nothing reaches the skill file.
 *
 * A human then reviews the batch for one skill: keep the issues that are real,
 * dismiss the ones that were the annotator's own mistake. Only reviewed, kept
 * issues are handed to reflection, which reads them together and writes ONE
 * amendment covering the pattern — which is then applied through core/skills.js
 * and takes effect on the next call.
 *
 * The journal is the durable record, so it is also the audit trail: what was
 * wrong, when, on which span, and what was eventually done about it. It is
 * exported with the document (io/sources.js) and can be committed to the repo.
 */

import { state, set } from './state.js';
import { logInfo, logWarn } from './log.js';
import { t } from './i18n.js';

const STORE_KEY = 'annotator_reflection_journal';

/** kind: what the human did. All of them are evidence about the same skill. */
export const KINDS = ['edit', 'rerun', 'swap', 'objection'];

let journal = load();          // array of issues, newest last

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch { return []; }
}

function persist() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(journal));
  } catch (err) {
    // A full quota must not silently drop the record of a human's work.
    logWarn('reflect', t('reflect.persistFailed', { err: err?.message || String(err) }));
  }
}

let seq = 0;
const nextId = () => `r${Date.now().toString(36)}${(seq++).toString(36)}`;

/**
 * Record a problem. Returns the issue.
 *
 * `skill` and `file` say which skill's instructions are on trial; everything
 * else is the evidence. Nothing here touches the skill file — that is the
 * entire point.
 */
export function record({ skill, file, kind, sentenceIndex, path, span, before, after, reason, detail }) {
  const issue = {
    id: nextId(),
    ts: new Date().toISOString(),
    skill: skill || '(unknown)',
    file: file || '',
    kind: KINDS.includes(kind) ? kind : 'objection',
    sentenceIndex: sentenceIndex ?? null,
    path: Array.isArray(path) ? path.join('.') : (path ?? null),
    span: span || '',
    before: before === undefined ? null : before,
    after: after === undefined ? null : after,
    reason: reason || '',
    detail: detail || '',
    status: 'open',            // open -> kept | dismissed ; kept -> reflected
  };
  journal.push(issue);
  persist();
  logInfo('reflect', t('reflect.recorded', { kind: issue.kind, skill: issue.skill, span: shorten(issue.span) }));
  set({}, 'reflection');
  return issue;
}

const shorten = (s, n = 30) => (String(s ?? '').length > n ? String(s).slice(0, n) + '…' : String(s ?? ''));

/* ------------------------------------------------------------------ query */

export function allIssues() { return journal.slice(); }
export function issuesFor(skill) { return journal.filter((i) => i.skill === skill); }
export function openFor(skill) { return journal.filter((i) => i.skill === skill && i.status === 'open'); }
export function keptFor(skill) { return journal.filter((i) => i.skill === skill && i.status === 'kept'); }

/** How many issues are waiting on each skill — drives the badges in the UI. */
export function pendingCounts() {
  const out = {};
  for (const i of journal) {
    if (i.status === 'open' || i.status === 'kept') out[i.skill] = (out[i.skill] || 0) + 1;
  }
  return out;
}

/** Ready to reflect = at least one issue reviewed and kept. */
export function readyToReflect(skill) { return keptFor(skill).length > 0; }

/* ------------------------------------------------------------------ review */

export function setStatus(id, status) {
  const issue = journal.find((i) => i.id === id);
  if (!issue) return null;
  issue.status = status;
  persist();
  set({}, 'reflection');
  return issue;
}

export const keep = (id) => setStatus(id, 'kept');
export const dismiss = (id) => setStatus(id, 'dismissed');

/** Mark the kept issues as having been folded into an amendment. */
export function markReflected(skill, amendment) {
  const now = new Date().toISOString();
  let n = 0;
  for (const i of journal) {
    if (i.skill === skill && i.status === 'kept') {
      i.status = 'reflected';
      i.reflectedAt = now;
      i.amendment = amendment;
      n++;
    }
  }
  persist();
  set({}, 'reflection');
  logInfo('reflect', t('reflect.reflected', { n, skill }));
  return n;
}

export function clearAll() {
  journal = [];
  persist();
  set({}, 'reflection');
  logInfo('reflect', 'reflection journal cleared');
}

/* -------------------------------------------------------------- reflection */

/**
 * Turn a batch of kept issues into ONE amendment.
 *
 * Deliberately built from the whole batch rather than issue by issue: the
 * point of waiting is to see the pattern, and a prompt that shows five related
 * corrections can state the rule behind them, where five separate prompts can
 * only restate five special cases.
 */
export function reflectionPrompt(skill, issues, lang) {
  const zh = lang !== 'en';
  const head = zh
    ? ['你是标注规范的维护者。下面是标注者在使用技能「' + skill + '」时记录的若干问题。',
       '请把它们放在一起看，找出**共同的模式**，然后写出一条可以直接加进技能说明文件的修订条款。',
       '要求：先用一句话说明这些问题的共性，再给出规则条款（用 > 引用块）。',
       '规则要能泛化到同类情况，而不是逐条复述这些例子。如果这些问题其实没有共性，就说明这一点，并只写你有把握的那一条。',
       '中文回答。'].join('\n')
    : ['You maintain annotation guidelines. Below are problems an annotator recorded while using the skill "' + skill + '".',
       'Read them together, find the PATTERN they share, and write one amendment that can be pasted into the skill file.',
       'First state in one sentence what these cases have in common, then give the rule as a > blockquote.',
       'The rule must generalise to similar cases rather than restating these examples one by one.',
       'If they genuinely share no pattern, say so and write only the one rule you are confident in.',
       'Answer in English.'].join('\n');

  const body = issues.map((i, n) => [
    `### ${n + 1}. ${i.kind} — ${i.span || '(whole sentence)'}`,
    i.reason ? `annotator's reason: ${i.reason}` : '',
    i.before !== null ? `before: ${trunc(JSON.stringify(i.before))}` : '',
    i.after !== null ? `after: ${trunc(JSON.stringify(i.after))}` : '',
    i.detail ? `detail: ${i.detail}` : '',
  ].filter(Boolean).join('\n')).join('\n\n');

  return `${head}\n\n---\n\n${body}`;
}

const trunc = (s, n = 240) => (String(s ?? '').length > n ? String(s).slice(0, n) + '…' : String(s ?? ''));

/**
 * Offline fallback when there is no key: still a batch summary, not a per-case
 * patch, so the shape of the output is the same either way.
 */
export function localReflection(skill, issues, lang) {
  const zh = lang !== 'en';
  const reasons = issues.map((i) => i.reason).filter(Boolean);
  const spans = issues.map((i) => i.span).filter(Boolean).slice(0, 4);
  const kinds = [...new Set(issues.map((i) => i.kind))].join(' / ');
  if (zh) {
    return [
      `**${skill} 的 ${issues.length} 条问题（${kinds}）**`, '',
      `涉及片段：${spans.join('、') || '（整句）'}`, '',
      '标注者给出的理由：',
      ...reasons.map((r) => `- ${r}`),
      '',
      '建议加入技能文件的条款：',
      `> ${reasons[0] || '（未填写理由，请补充后再反思）'}`,
      '',
      '_（本条由本地模板汇总生成；切换到 live 模式可让模型从这批问题里归纳出更概括的规则。）_',
    ].join('\n');
  }
  return [
    `**${issues.length} issue(s) on ${skill} (${kinds})**`, '',
    `Spans: ${spans.join(', ') || '(whole sentence)'}`, '',
    'Reasons the annotator gave:',
    ...reasons.map((r) => `- ${r}`),
    '',
    'Proposed addition to the skill file:',
    `> ${reasons[0] || '(no reason recorded — add one before reflecting)'}`,
    '',
    '_(Summarised from a local template; switch to live mode to have the model generalise across the batch.)_',
  ].join('\n');
}
