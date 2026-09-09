/**
 * The expandable annotation tree — shared by every format.
 *
 * One resolved node = one skill call. A *pending* row is a slot the user can
 * click to run the next skill — that click is the entire point of this
 * rewrite: it is what lets someone import a blank UMR file and annotate it
 * skill by skill instead of only ever replaying a pre-baked trace.
 *
 * UMR nesting lives directly in `sentence.tree` (pending markers interleaved
 * with resolved nodes, however deep). Flat formats (sentiment, generated
 * ones) keep `sentence.tree` flat and compute their pending slots on the fly
 * via `format.pendingSlots(sentence)` — both shapes render through the same
 * row component.
 */

import { state, set, pathKey, currentSentence } from '../core/state.js';
import { el } from '../core/dom.js';
import { runPendingAt, getAt, rerunAt, kindOfNode, SWAPPABLE_KINDS } from '../core/pipeline.js';
import { isEdited } from '../core/edits.js';
import { record } from '../core/reflection.js';
import { logInfo, logError, describeError } from '../core/log.js';
import { stepCoverage } from '../core/coverage.js';
import { toast } from './toast.js';
import { t } from '../core/i18n.js';

const KIND_LABEL = (kind) => t(`kind.${kind}`);

export function renderTree(container, format) {
  const sentence = currentSentence();
  container.innerHTML = '';
  if (!sentence) { container.append(el('div', { class: 'empty' }, t('common.notLoaded'))); return; }

  const nodes = format.flat
    ? [...(sentence.tree || []), ...(format.pendingSlots?.(sentence) || [])]
    : (sentence.tree || []);

  if (!nodes.length) {
    container.append(el('div', { class: 'empty' }, t('tree.empty')));
    return;
  }
  const list = el('div', { class: 'tree' });
  nodes.forEach((node, i) => list.append(nodeEl(node, [i], format)));
  container.append(list);
}

function nodeEl(node, path, format) {
  if (node.pending) return pendingRow(node, path, format);

  const key = pathKey(path);
  const hasKids = (node.children || []).length > 0;
  const isOpen = !state.collapsed.has(key); // default open; collapse is opt-in
  const isSel = state.selectedNode && pathKey(state.selectedNode.path) === key;
  const { title, detail } = format.nodeSummary?.(node) || { title: node.span, detail: '' };
  const edited = isEdited(state.selectedSentence, path);

  const row = el('div', {
    class: `node-row${isSel ? ' selected' : ''}${node.source ? ` src-${node.source}` : ''}`,
    onclick: (e) => { e.stopPropagation(); set({ selectedNode: { path, node } }, 'selectedNode'); },
  },
    el('span', {
      class: `twisty${hasKids ? '' : ' leaf'}`,
      onclick: (e) => {
        e.stopPropagation();
        if (!hasKids) return;
        if (isOpen) state.collapsed.add(key); else state.collapsed.delete(key);
        set({}, 'tree');
      },
    }, hasKids ? (isOpen ? '▾' : '▸') : '·'),
    el('span', { class: 'skill-chip', style: `--c:${format.skillColor?.(node.skill) || '#888'}` }, node.skill),
    // The role is the edge this node hangs off its parent by — `:condition`,
    // `:ARG0`. A pending row has always shown it; a *resolved* one did not, so
    // the moment a slot was filled the tree stopped saying what the artifact
    // plainly said on the right, and a `:condition` clause read as an
    // unexplained second child. Same chip, same place, resolved or not.
    node.role ? el('span', { class: 'role-chip' }, node.role) : null,
    el('span', { class: 'node-title' }, truncate(title, 46)),
    detail ? el('span', { class: 'node-detail' }, truncate(detail, 34)) : null,
    node.source ? el('span', { class: `src-dot ${node.source}`, title: sourceLabel(node) }) : null,
    coverageFlag(node),
    edited ? el('span', { class: 'edited-flag', title: t('tree.edited') }, '✎') : null,
    nodeActions(node, path, format),
  );

  const wrap = el('div', { class: 'node' }, row);
  if (hasKids && isOpen) {
    const kids = el('div', { class: 'children' });
    node.children.forEach((c, i) => kids.append(nodeEl(c, [...path, i], format)));
    wrap.append(kids);
  }
  return wrap;
}

/**
 * Per-node actions: run it again, or run it as a different kind of thing.
 *
 * Re-run exists because a skill's instructions change — after an amendment the
 * old answer is stale, and re-running is how you see what the new instructions
 * actually do to a case you already know.
 *
 * Swap exists because the pipeline decides what each span IS (a clause, a noun
 * phrase, a named entity) before anything analyses it, and when that first
 * guess is wrong every result under it is wrong for the same reason. Editing
 * the output by hand would paper over it; re-running as the right kind fixes
 * the actual mistake.
 *
 * Both are interventions, so both are filed against the skill — not applied to
 * it. See core/reflection.js.
 */
function nodeActions(node, path, format) {
  if (node.skill === '(stop)') return null;      // decided in code, nothing to re-run
  const busy = state.running.size > 0;

  const rerun = el('button', {
    class: 'node-act', title: t('tree.rerunTitle'), disabled: busy ? '' : undefined,
    onclick: async (e) => {
      e.stopPropagation();
      record({
        skill: node.skill, file: skillFile(node, format), kind: 'rerun',
        sentenceIndex: state.selectedSentence, path, span: node.span,
        before: node.output, after: null, detail: t('tree.rerunDetail'),
      });
      await runNode(format, path, () => rerunAt(state.doc, state.selectedSentence, path));
    },
  }, '↻');

  const swap = el('select', {
    class: 'node-swap', title: t('tree.swapTitle'), disabled: busy ? '' : undefined,
    onclick: (e) => e.stopPropagation(),
    onchange: async (e) => {
      const asKind = e.target.value;
      e.stopPropagation();
      if (!asKind || asKind === kindOfNode(node)) return;
      record({
        skill: node.skill, file: skillFile(node, format), kind: 'swap',
        sentenceIndex: state.selectedSentence, path, span: node.span,
        before: kindOfNode(node), after: asKind,
        detail: t('tree.swapDetail', { from: kindOfNode(node), to: asKind }),
      });
      await runNode(format, path, () => rerunAt(state.doc, state.selectedSentence, path, { asKind }));
    },
  });
  const current = kindOfNode(node);
  swap.append(el('option', { value: '' }, t('tree.swapAs')));
  for (const k of SWAPPABLE_KINDS) {
    swap.append(el('option', { value: k, selected: k === current ? '' : undefined }, t(`kind.${k}`)));
  }

  return el('span', { class: 'node-acts', onclick: (e) => e.stopPropagation() }, rerun, swap);
}

const skillFile = (node, format) =>
  (format.skills || []).find((s) => s.id === node.skill)?.file || '';

/** Shared run wrapper: spinner, error surfacing, repaint. */
async function runNode(format, path, fn) {
  const runKey = pathKey(path);
  state.running.add(runKey);
  set({}, 'tree');
  try {
    await fn();
    set({}, 'tree', 'artifact', 'selectedNode');
  } catch (err) {
    logError('ui', t('tree.runFailedLog', { kind: 'rerun', err: describeError(err) }), err);
    toast(t('tree.runFailed', { err: describeError(err) }), true);
  } finally {
    state.running.delete(runKey);
    set({}, 'tree');
  }
  void format;
}

function pendingRow(marker, path, format) {
  const runKey = runKeyOf(marker, path);
  const running = state.running.has(runKey);
  // Only a "run the rest" sweep blocks the other rows. Two unresolved slots
  // are independent questions about different phrases — making the annotator
  // wait for one before asking the other turned a sentence into a queue of
  // round trips, and round trips are the whole cost.
  const blocked = state.sweeping && !running;
  const label = format.flat
    ? (format.skills?.find((s) => s.id === marker.kind)?.label || marker.kind)
    : KIND_LABEL(marker.kind);
  const skillHint = format.flat ? marker.kind : (kindToSkillHint(marker.kind));

  return el('div', { class: 'node' },
    el('div', {
      class: `node-row pending-row${running ? ' running' : ''}${blocked ? ' blocked' : ''}`,
      title: blocked ? t('tree.blocked') : t('tree.clickToRun', { skill: skillHint }),
      onclick: (e) => { e.stopPropagation(); if (!blocked) runPending(format, marker, path, runKey); },
    },
      el('span', { class: `run-glyph${running ? ' spin' : ''}` }, running ? '◐' : '▶'),
      el('span', { class: 'pending-kind' }, label),
      marker.role ? el('span', { class: 'role-chip' }, marker.role) : null,
      el('span', { class: 'pending-phrase' }, truncate(marker.phrase, 50)),
      el('span', { class: 'pending-cta' }, running ? t('tree.running') : t('tree.pending')),
    ));
}

/** ⚠ badge on any step whose own decomposition dropped content words from its span. */
function coverageFlag(node) {
  if (!(node.children || []).some((c) => c.pending || c.role)) return null;
  const cov = stepCoverage(node, state.doc?.language || 'en');
  if (!cov || !cov.lost.length) return null;
  return el('span', {
    class: 'cov-flag',
    title: t('cov.flagTitle', { lost: cov.lost.join(', ') }),
  }, '⚠');
}

function kindToSkillHint(kind) {
  if (kind === 'clause') return 'predicate + arguments';
  if (kind === 'np') return 'np_phrase';
  if (kind === 'special') return 'special_entity';
  if (kind === 'atomic') return t('tree.atomicHint');
  return t(`kind.${kind}`);
}

function sourceLabel(node) {
  if (node.source === 'live') return `live · ${node.model || ''}`.trim();
  if (node.source === 'replay') return t('tree.srcReplay');
  if (node.source === 'rule') return t('tree.srcRule');
  return node.source || '';
}

function runKeyOf(marker, path) {
  return path ? `p:${path.join('.')}` : `f:${marker.kind}`;
}

async function runPending(format, marker, path, runKey) {
  if (state.running.has(runKey)) return;
  state.running.add(runKey);
  set({}, 'tree');
  const sentence = currentSentence();
  try {
    if (format.flat) {
      logInfo('ui', t('tree.running.log', { kind: marker.kind, text: truncate(sentence.text, 30) }));
      const node = await format.runSkill(marker.kind, sentence, state.doc.language || 'en');
      sentence.tree.push(node);
      set({ selectedNode: { path: [sentence.tree.length - 1], node } }, 'tree', 'artifact', 'selectedNode');
    } else {
      logInfo('ui', t('tree.running.log', { kind: marker.kind, text: truncate(marker.phrase, 30) }));
      await runPendingAt(state.doc, state.selectedSentence, path);
      const node = getAt(sentence.tree, path);
      set({ selectedNode: { path, node } }, 'tree', 'artifact', 'selectedNode');
    }
  } catch (err) {
    logError('ui', t('tree.runFailedLog', { kind: marker.kind, err: describeError(err) }), err);
    toast(t('tree.runFailed', { err: describeError(err) }), true);
    set({}, 'tree');
  } finally {
    state.running.delete(runKey);
    set({}, 'tree');
  }
}

function truncate(s, n) {
  const str = String(s ?? '');
  return str.length > n ? str.slice(0, n) + '…' : str;
}

/** Reset collapse state (used when switching sentences so the shape is visible). */
export function expandAll() {
  state.collapsed.clear();
}

/* --------------------------------------------------------- run everything */

/**
 * How many calls may be in flight at once. The limit is not politeness — it is
 * that provider rate limits answer a burst with 429s, and a 429 costs more time
 * than the call it replaced.
 */
const MAX_IN_FLIGHT = 4;

/**
 * Resolve the whole sentence without clicking every row.
 *
 * Runs in waves: take every slot that is unresolved *right now*, run up to
 * MAX_IN_FLIGHT of them together, then look again — because resolving a slot is
 * what reveals the next ones. Sibling slots are independent questions about
 * different phrases, so a wave is genuinely parallel; the chain from a clause
 * down to its arguments is not, and falls out naturally as successive waves.
 *
 * A wave that resolves nothing stops the sweep. That is the honest terminator:
 * either everything is done, or something is failing and repeating it would
 * just spend the annotator's money on the same error.
 */
export async function runAllPending(format) {
  if (state.sweeping) return { waves: 0, ran: 0 };
  const sentence = currentSentence();
  if (!sentence) return { waves: 0, ran: 0 };

  state.sweeping = true;
  set({}, 'tree');
  let waves = 0, ran = 0;
  try {
    for (;;) {
      const slots = pendingPaths(sentence, format).slice(0, MAX_IN_FLIGHT);
      if (!slots.length) break;
      waves++;
      const before = countResolved(sentence.tree);
      const results = await Promise.allSettled(slots.map(({ marker, path }) =>
        runOneSweep(format, marker, path)));
      ran += results.filter((r) => r.status === 'fulfilled').length;
      set({}, 'tree', 'artifact');
      // No progress means the same wave would repeat forever. Say so once.
      if (countResolved(sentence.tree) === before) {
        const why = results.find((r) => r.status === 'rejected')?.reason;
        logError('ui', t('tree.sweepStalled', { err: why ? describeError(why) : '—' }), why);
        toast(t('tree.sweepStalled', { err: why ? describeError(why) : '—' }), true);
        break;
      }
      if (waves > 40) break;                 // a sentence this deep is a bug, not a sentence
    }
  } finally {
    state.sweeping = false;
    set({}, 'tree', 'artifact', 'selectedNode');
  }
  logInfo('ui', t('tree.sweepDone', { n: ran, waves }));
  return { waves, ran };
}

/** One slot inside a sweep: same path as a click, minus the repaint per step. */
async function runOneSweep(format, marker, path) {
  const runKey = runKeyOf(marker, path);
  state.running.add(runKey);
  try {
    if (format.flat) {
      const sentence = currentSentence();
      const node = await format.runSkill(marker.kind, sentence, state.doc.language || 'en');
      sentence.tree.push(node);
    } else {
      await runPendingAt(state.doc, state.selectedSentence, path);
    }
  } finally {
    state.running.delete(runKey);
  }
}

/** Every unresolved slot in the sentence, deepest first so paths stay valid. */
function pendingPaths(sentence, format) {
  if (format.flat) {
    return (format.pendingSlots?.(sentence) || []).map((marker) => ({ marker, path: null }));
  }
  const out = [];
  const walk = (nodes, prefix) => {
    (nodes || []).forEach((n, i) => {
      const path = [...prefix, i];
      if (n.pending) out.push({ marker: n, path });
      else walk(n.children, path);
    });
  };
  walk(sentence.tree, []);
  return out.reverse();
}

const countResolved = (nodes = []) =>
  nodes.reduce((n, x) => n + (x.pending ? 0 : 1 + countResolved(x.children)), 0);
