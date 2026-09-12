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
import { fingerprint } from '../domain/_value.js';
import {
  consumeFeedback,
  createFeedbackEvent,
  makeSkillId,
  reviewFeedback,
} from '../domain/feedback.js';
import { inferSkillId } from './skills.js';

const STORE_KEY = 'annotator_reflection_journal';

/** kind: what the human did. All of them are evidence about the same skill. */
export const KINDS = ['edit', 'rerun', 'swap', 'objection'];

let seq = 0;
const nextId = () => `r${Date.now().toString(36)}${(seq++).toString(36)}`;

let journal = load();          // immutable FeedbackEvents, newest last

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
    return Array.isArray(raw) ? raw.map(migrateIssue).filter(Boolean) : [];
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

/**
 * Record a problem. Returns the issue.
 *
 * `skill` and `file` say which skill's instructions are on trial; everything
 * else is the evidence. Nothing here touches the skill file — that is the
 * entire point.
 */
export function record({
  skill,
  skillId,
  file,
  kind,
  sentenceIndex,
  path,
  span,
  before,
  after,
  reason,
  detail,
  callId,
  revisionId,
  formatId,
  documentId,
  sourceHash,
  sentenceId,
}) {
  const id = nextId();
  const action = KINDS.includes(kind) ? kind : 'objection';
  const localSkillId = skill || '(unknown)';
  const stableSkillId = skillId || inferSkillId(file || '')
    || makeSkillId(safeSegment(formatId || state.formatId || 'legacy'), safeSegment(localSkillId));
  const doc = state.doc || {};
  const sentence = doc.sentences?.[sentenceIndex ?? state.selectedSentence] || {};
  const event = createFeedbackEvent({
    id,
    skillId: stableSkillId,
    revisionId: revisionId || 'rev:unversioned',
    callId: callId || `call:manual:${id}`,
    type: typeFor(action),
    document: {
      id: documentId || doc.id || 'unknown-document',
      sourceHash: sourceHash || doc.sourceHash || `doc:${fingerprint({ id: doc.id || '', provenance: doc.provenance || '' })}`,
      sentenceId: sentenceId || sentence.id || `sentence:${sentenceIndex ?? state.selectedSentence ?? 'unknown'}`,
      span: span || '',
      context: sentence.text || '',
    },
    originalOutput: before === undefined ? null : before,
    humanOutput: after === undefined ? null : after,
    rationale: reason || '',
    createdAt: new Date().toISOString(),
    evidence: {
      localSkillId,
      skillFile: file || '',
      formatId: formatId || state.formatId || '',
      sentenceIndex: sentenceIndex ?? null,
      path: Array.isArray(path) ? path.join('.') : (path ?? null),
      action,
      detail: detail || '',
    },
  });
  journal.push(event);
  persist();
  const issue = issueView(event);
  logInfo('reflect', t('reflect.recorded', { kind: issue.kind, skill: issue.skill, span: shorten(issue.span) }));
  set({}, 'reflection');
  return issue;
}

const shorten = (s, n = 30) => (String(s ?? '').length > n ? String(s).slice(0, n) + '…' : String(s ?? ''));

/* ------------------------------------------------------------------ query */

export function allIssues() { return journal.map(issueView); }
export function issuesFor(skill) { return journal.filter((i) => matchesSkill(i, skill)).map(issueView); }
export function openFor(skill) { return journal.filter((i) => matchesSkill(i, skill) && i.status === 'open').map(issueView); }
export function keptFor(skill) { return journal.filter((i) => matchesSkill(i, skill) && i.status === 'kept').map(issueView); }

/** Immutable domain events for the application-layer candidate gate. */
export function keptEvidenceFor(skill) {
  return structuredClone(journal.filter((event) => matchesSkill(event, skill) && event.status === 'kept'));
}

export function exportReflectionJournal({ documentId = '', sourceHash = '' } = {}) {
  const selected = journal.filter((event) => {
    if (sourceHash) return event.document.sourceHash === sourceHash;
    if (documentId) return event.document.id === documentId;
    return true;
  });
  return structuredClone(selected);
}

/** How many issues are waiting on each skill — drives the badges in the UI. */
export function pendingCounts() {
  const out = {};
  for (const i of journal) {
    if (i.status === 'open' || i.status === 'kept') {
      out[i.skillId] = (out[i.skillId] || 0) + 1;
    }
  }
  return out;
}

/** Ready to reflect = at least one issue reviewed and kept. */
export function readyToReflect(skill) { return keptFor(skill).length > 0; }

/* ------------------------------------------------------------------ review */

export function setStatus(id, status) {
  const index = journal.findIndex((i) => i.id === id);
  if (index === -1) return null;
  journal[index] = reviewFeedback(journal[index], status);
  persist();
  set({}, 'reflection');
  return issueView(journal[index]);
}

export const keep = (id) => setStatus(id, 'kept');
export const dismiss = (id) => setStatus(id, 'dismissed');

/** Mark the kept issues as having been folded into an amendment. */
export function markReflected(skill, amendment, candidateId = '', feedbackIds = []) {
  const consumedBy = candidateId || `candidate:legacy:${fingerprint({ skill, amendment })}`;
  const selected = new Set(feedbackIds);
  let n = 0;
  journal = journal.map((event) => {
    const belongsToCandidate = selected.size === 0 || selected.has(event.id);
    if (belongsToCandidate && matchesSkill(event, skill) && event.status === 'kept') {
      n++;
      return consumeFeedback(event, consumedBy);
    }
    return event;
  });
  persist();
  set({}, 'reflection');
  logInfo('reflect', t('reflect.reflected', { n, skill }));
  return n;
}

function issueView(event) {
  return {
    ...event,
    ts: event.createdAt,
    skill: event.evidence.localSkillId,
    file: event.evidence.skillFile,
    kind: event.evidence.action,
    sentenceIndex: event.evidence.sentenceIndex,
    path: event.evidence.path,
    span: event.document.span,
    before: event.originalOutput,
    after: event.humanOutput,
    reason: event.rationale,
    detail: event.evidence.detail,
    status: event.status === 'consumed' ? 'reflected' : event.status,
  };
}

function matchesSkill(event, ref) {
  return String(ref).startsWith('skill://')
    ? event.skillId === ref
    : event.evidence.localSkillId === ref;
}

function typeFor(action) {
  return ({ edit: 'correction', rerun: 'rerun-result', swap: 'routing-error', objection: 'objection' })[action]
    || 'objection';
}

function safeSegment(value) {
  return String(value || 'unknown').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
}

function migrateIssue(issue) {
  if (!issue || typeof issue !== 'object') return null;
  if (issue.kind === 'feedback-event') {
    try { return createFeedbackEvent(issue); } catch { return null; }
  }
  const action = KINDS.includes(issue.kind) ? issue.kind : 'objection';
  const localSkillId = issue.skill || 'unknown';
  const stableSkillId = issue.skillId || inferSkillId(issue.file || '')
    || makeSkillId(safeSegment(issue.formatId || 'legacy'), safeSegment(localSkillId));
  try {
    return createFeedbackEvent({
      id: issue.id || nextId(),
      skillId: stableSkillId,
      revisionId: issue.revisionId || 'rev:legacy',
      callId: issue.callId || `call:legacy:${issue.id || fingerprint(issue)}`,
      type: typeFor(action),
      document: {
        id: issue.documentId || 'legacy-document',
        sourceHash: issue.sourceHash || `legacy:${fingerprint(issue)}`,
        sentenceId: issue.sentenceId || `sentence:${issue.sentenceIndex ?? 'unknown'}`,
        span: issue.span || '',
        context: '',
      },
      originalOutput: issue.before ?? null,
      humanOutput: issue.after ?? null,
      rationale: issue.reason || '',
      status: issue.status === 'reflected' ? 'consumed' : issue.status,
      consumedByCandidateId: issue.candidateId || (issue.status === 'reflected' ? 'candidate:legacy' : null),
      createdAt: issue.ts || new Date().toISOString(),
      evidence: {
        localSkillId,
        skillFile: issue.file || '',
        formatId: issue.formatId || '',
        sentenceIndex: issue.sentenceIndex ?? null,
        path: issue.path ?? null,
        action,
        detail: issue.detail || '',
      },
    });
  } catch {
    return null;
  }
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
export function reflectionPrompt(skill, issues, lang, currentInstructions = '') {
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

  const current = currentInstructions
    ? `## Current complete skill revision\n\n${currentInstructions}\n\n---\n\n`
    : '';
  return `${head}\n\n---\n\n${current}${body}`;
}

const trunc = (s, n = 2000) => (String(s ?? '').length > n ? String(s).slice(0, n) + '…' : String(s ?? ''));

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
