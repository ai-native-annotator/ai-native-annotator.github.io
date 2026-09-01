/**
 * The pass pipeline: how a chained format shows its work.
 *
 * A tree would be a lie here. Each pass rewrites the whole graph, so there is
 * no containment to draw — what the annotator needs to see is the SEQUENCE and,
 * for each step, what it changed. So: a vertical pipeline, one row per pass,
 * each row carrying a +added / −removed count, and selecting a row shows the
 * diff of the whole graph across that step.
 *
 * The rule the layout encodes is that a pass only makes sense against the one
 * before it. Passes below the frontier are greyed and unclickable, because
 * running pass 5 before pass 4 would feed it a graph that pass 4 was going to
 * change — the result would be neither wrong nor meaningful, which is worse.
 */

import { el, mount } from '../core/dom.js';
import { state, set } from '../core/state.js';
import { runPass, nextPassIndex, graphDiff } from '../core/chain.js';
import { record } from '../core/reflection.js';
import { logError, describeError } from '../core/log.js';
import { toast } from './toast.js';
import { t } from '../core/i18n.js';

export function renderChain(container, format) {
  const sentence = state.doc?.sentences?.[state.selectedSentence];
  container.innerHTML = '';
  if (!sentence) return;

  const passes = sentence.passes || [];
  const frontier = nextPassIndex(sentence, format);
  const defs = format.skills || [];

  const list = el('div', { class: 'chain' });
  defs.forEach((def, i) => {
    const done = Boolean(passes[i]);
    const isNext = i === frontier;
    const blocked = !done && !isNext;
    const rec = passes[i];
    const diff = done ? graphDiff(rec.before, rec.graph) : null;
    const busy = state.running.has(`pass:${i}`);
    const selected = state.selectedPass === i;

    const row = el('div', {
      class: `chain-row${done ? ' done' : ''}${isNext ? ' next' : ''}${blocked ? ' blocked' : ''}`
        + `${selected ? ' selected' : ''}${busy ? ' running' : ''}`,
      onclick: () => { if (done) set({ selectedPass: i, selectedNode: null }, 'selectedNode', 'tree'); },
      title: blocked ? t('chain.blocked') : (def.describes || def.label),
    },
      el('span', { class: 'chain-step' }, String(i + 1)),
      el('span', { class: 'skill-chip', style: `--c:${format.skillColor?.(def.id) || '#888'}` }, def.id),
      el('span', { class: 'chain-label' }, def.label),
      done && diff
        ? el('span', { class: 'chain-diff' },
            diff.added.length ? el('span', { class: 'diff-add' }, `+${diff.added.length}`) : null,
            diff.removed.length ? el('span', { class: 'diff-del' }, `−${diff.removed.length}`) : null,
            (!diff.added.length && !diff.removed.length)
              ? el('span', { class: 'muted sm' }, t('chain.noChange')) : null)
        : null,
      rec?.warning ? el('span', { class: 'cov-flag', title: rec.warning }, '⚠') : null,
      isNext
        ? el('button', {
            class: 'btn xs', disabled: busy ? '' : undefined,
            onclick: (e) => { e.stopPropagation(); runOne(format, i); },
          }, busy ? t('tree.running') : t('chain.run'))
        : null,
      done
        ? el('button', {
            class: 'node-act', title: t('chain.rerunFrom'),
            onclick: (e) => { e.stopPropagation(); rerunFrom(format, i); },
          }, '↻')
        : null);

    list.append(row);
    if (i < defs.length - 1) list.append(el('div', { class: `chain-link${done ? ' done' : ''}` }));
  });

  container.append(list);
  if (frontier === -1) {
    container.append(el('div', { class: 'chain-foot done' }, t('chain.finished')));
  } else {
    container.append(el('div', { class: 'chain-foot' }, t('chain.hint')));
  }
}

async function runOne(format, i) {
  const key = `pass:${i}`;
  state.running.add(key);
  set({}, 'tree');
  try {
    await runPass(state.doc, state.selectedSentence, i, format);
    set({ selectedPass: i }, 'tree', 'artifact', 'selectedNode');
  } catch (err) {
    logError('chain', t('chain.failed', { pass: format.skills[i]?.id, err: describeError(err) }), err);
    toast(t('chain.failed', { pass: format.skills[i]?.id, err: describeError(err) }), true);
  } finally {
    state.running.delete(key);
    set({}, 'tree');
  }
}

/**
 * Re-run from a pass onward. Everything after it is dropped first, because
 * those passes read a graph this one is about to change — leaving them would
 * show later steps whose "before" no longer exists anywhere.
 */
async function rerunFrom(format, i) {
  const sentence = state.doc.sentences[state.selectedSentence];
  const def = format.skills[i];
  record({
    skill: def.id, file: def.file, kind: 'rerun',
    sentenceIndex: state.selectedSentence, path: null, span: sentence.text,
    before: sentence.passes?.[i]?.graph ?? null, after: null,
    detail: t('chain.rerunDetail', { pass: def.id }),
  });
  sentence.passes = (sentence.passes || []).slice(0, i);
  sentence.graph = i === 0 ? '' : (sentence.passes[i - 1]?.graph || '');
  set({ selectedPass: null }, 'tree', 'artifact');
  await runOne(format, i);
}

/* ------------------------------------------------------- the pass detail */

/** What the assistant pane shows when a pass (rather than a node) is selected. */
export function renderPassDetail(container, format) {
  const sentence = state.doc?.sentences?.[state.selectedSentence];
  const i = state.selectedPass;
  const rec = sentence?.passes?.[i];
  if (!rec) return false;

  const def = (format.skills || [])[i];
  const diff = graphDiff(rec.before, rec.graph);
  container.innerHTML = '';
  mount(container,
    el('div', { class: 'assist-head' },
      el('span', { class: 'skill-chip lg', style: `--c:${format.skillColor?.(rec.pass) || '#888'}` }, rec.pass),
      el('span', { class: 'skill-label' }, rec.label),
      el('span', { class: `src-badge ${rec.source || 'replay'}` }, rec.source || 'replay')),
    def?.describes ? el('div', { class: 'skill-desc' }, def.describes) : null,
    def?.file ? el('div', { class: 'skill-file' }, t('assist.skillFile', { file: def.file })) : null,
    rec.warning ? el('div', { class: 'edit-status err' }, rec.warning) : null,

    section(t('chain.changes', { n: rec.changes.length }),
      rec.changes.length
        ? el('ul', { class: 'change-list' }, ...rec.changes.map((c) => el('li', {}, c)))
        : el('div', { class: 'empty sm' }, t('chain.noChangeLong'))),

    rec.note ? section(t('assist.rationale'), el('div', { class: 'rationale model' }, rec.note)) : null,

    section(t('chain.diff'), diffBlock(diff)),
    section(t('assist.input'), el('pre', { class: 'code sm collapsed-input' }, rec.input || '—')),
  );
  return true;
}

function section(title, body) {
  return el('div', { class: 'assist-section' }, el('div', { class: 'assist-title' }, title), body);
}

function diffBlock(diff) {
  if (!diff.added.length && !diff.removed.length) {
    return el('div', { class: 'empty sm' }, t('chain.noChangeLong'));
  }
  const pre = el('pre', { class: 'code diff-block' });
  for (const line of diff.removed) pre.append(el('div', { class: 'diff-del-line' }, `− ${line}`));
  for (const line of diff.added) pre.append(el('div', { class: 'diff-add-line' }, `+ ${line}`));
  return pre;
}
