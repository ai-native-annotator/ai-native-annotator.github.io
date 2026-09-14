/**
 * AI annotation assistant pane.
 *
 * Shows the selected skill call end to end — which skill ran, what it was
 * given, what it produced, and why — and lets a human override the output.
 * The override is the entry point for the rationale-clash loop: a human edit
 * without a stated reason is just a patch, but an edit *plus* a rationale is
 * evidence that the skill's instructions are wrong, which the chat pane turns
 * into a skill-update proposal.
 */

import { state, set, editKey } from '../core/state.js';
import { el, jsonHtml, fmtMs, mount } from '../core/dom.js';
import { toast } from './toast.js';
import { t } from '../core/i18n.js';
import {
  applyEdit, revertEdit, isEdited, outputToPenman, penmanToOutput, applyChildRoles,
} from '../core/edits.js';
import { getOverride, clearOverride } from '../core/skills.js';
import { record } from '../core/reflection.js';
import { renderPassDetail } from './chain.js';

/**
 * Saving re-renders this whole pane, which throws away the status element the
 * save just wrote to — so the confirmation vanished the instant it was set and
 * the annotator got no in-pane feedback that the commit landed. Park it here
 * so the rebuilt editor can show it, and drop it as soon as the annotator
 * moves to a different node.
 */
let lastStatus = null;   // {key, text, cls}

export function renderAssistant(container, format) {
  // In a chained format the unit of inspection is a pass, not a node.
  if (format.chain && state.selectedPass !== null && state.selectedPass !== undefined) {
    if (renderPassDetail(container, format)) return;
  }
  const sel = state.selectedNode;
  container.innerHTML = '';

  if (!sel) {
    container.append(el('div', { class: 'empty' },
      t('assist.empty')));
    return;
  }

  const { node, path } = sel;
  if (!node || node.pending) { container.append(el('div', { class: 'empty' }, t('assist.noResult'))); return; }
  const def = (format.skills || []).find((s) => s.id === node.skill);
  // node.output IS the edit once one is accepted (core/edits.js writes through),
  // so there is no "shown vs stored" split left to fall out of sync.
  const edited = isEdited(state.selectedSentence, path);
  const shown = node.output;

  mount(container,
    el('div', { class: 'assist-head' },
      el('span', { class: 'skill-chip lg', style: `--c:${format.skillColor?.(node.skill) || '#888'}` },
         node.skill),
      def ? el('span', { class: 'skill-label' }, def.label) : null,
      el('span', { class: `src-badge ${node.source || 'replay'}` }, sourceText(node)),
    ),
    def?.describes ? el('div', { class: 'skill-desc' }, def.describes) : null,
    def?.file ? el('div', { class: 'skill-file' }, t('assist.skillFile', { file: def.file })) : null,
    amendmentBox(def),

    section(t('assist.span'), el('div', { class: 'span-box' }, node.span || '—')),
    section(t('assist.input'), el('pre', { class: 'code sm' }, node.input || '—')),
    section(t('assist.output') + (edited ? t('assist.outputEdited') : ''),
      el('pre', { class: `code${edited ? ' edited' : ''}`, html: jsonHtml(shown) })),
    node.rationale
      ? section(t('assist.rationale'),
          el('div', { class: 'rationale model' }, node.rationale))
      : null,
    editor(path, node, def),
  );
}

/**
 * A skill's live local amendment, shown on the skill it changes.
 *
 * Accepting an amendment in the chat already puts it in the very next prompt,
 * but nothing on screen said so — the annotator had to take it on trust. This
 * is the receipt: the exact text now being appended to that skill's
 * instructions, on the pane where its effect will show up, revertible in place.
 */
function amendmentBox(def) {
  // def.file already carries the `skills/` prefix (see formats/umr.js), and it
  // is the exact string chat.js hands addAmendment and pipeline.js fetches, so
  // this must use it verbatim — prefixing again would look right and match
  // nothing, which is how the replay index broke.
  const text = def?.file ? getOverride(def.file, def.skillId) : '';
  if (!text) return null;
  return el('div', { class: 'amendment' },
    el('div', { class: 'amendment-head' },
      el('span', { class: 'amendment-badge' }, t('skills.liveBadge')),
      el('button', {
        class: 'btn sm ghost',
        onclick: async () => {
          await clearOverride(def.file, def.skillId);
          toast(t('skills.revertedToast'));
        },
      }, t('assist.revert'))),
    el('pre', { class: 'amendment-text' }, text),
    el('div', { class: 'hint' }, t('skills.liveHint')));
}

function sourceText(node) {
  if (node.source === 'live') return `live${node.model ? ' · ' + node.model : ''}${node.latencyMs ? ' · ' + fmtMs(node.latencyMs) : ''}`;
  if (node.source === 'rule') return t('assist.srcRule');
  return 'replay';
}

function section(title, body) {
  return el('div', { class: 'assist-section' },
    el('div', { class: 'assist-title' }, title), body);
}

/**
 * The edit surface. Penman first, because that is the notation the annotator
 * actually works in; JSON is the escape hatch for anything Penman cannot say.
 *
 * Saving is a real commit: core/edits.js writes the corrected output onto the
 * node, so 「标注后文件」 shows the correction the instant this returns. The
 * editor is open by default — correcting the model is a normal part of the
 * job, not something to go hunting for behind a disclosure triangle.
 */
function editor(path, node, def) {
  const key = editKey(state.selectedSentence, path);
  if (lastStatus && lastStatus.key !== key) lastStatus = null;
  const status = el('span', { class: lastStatus?.cls || 'edit-status' }, lastStatus?.text || '');
  const ta = el('textarea', { class: 'edit-box', spellcheck: 'false', rows: 8 });
  const hint = el('div', { class: 'edit-hint', html: t('edits.penmanHint') });
  let mode = state.editMode === 'json' ? 'json' : 'penman';

  const fill = () => {
    ta.value = mode === 'penman'
      ? outputToPenman(node)
      : JSON.stringify(node.output, null, 2);
    hint.innerHTML = mode === 'penman' ? t('edits.penmanHint') : t('assist.editHint');
  };

  const tab = (id, label) => el('button', {
    class: `btn sm${mode === id ? '' : ' ghost'}`,
    onclick: () => {
      if (mode === id) return;
      mode = id;
      state.editMode = id;
      status.textContent = '';
      fill();
      for (const b of tabs.children) b.className = `btn sm${b.dataset.mode === mode ? '' : ' ghost'}`;
    },
  }, label);
  const tabs = el('div', { class: 'edit-tabs' });
  const pTab = tab('penman', t('edits.tabPenman')); pTab.dataset.mode = 'penman';
  const jTab = tab('json', t('edits.tabJson')); jTab.dataset.mode = 'json';
  tabs.append(pTab, jTab);

  const save = () => {
    let output, ignored = [], childRoles = null;
    if (mode === 'penman') {
      const res = penmanToOutput(ta.value, node);
      if (res.error) { status.textContent = res.error; status.className = 'edit-status err'; return; }
      ({ output, ignored, childRoles } = res);
    } else {
      try { output = JSON.parse(ta.value); } catch (err) {
        status.textContent = t('assist.jsonError') + err.message;
        status.className = 'edit-status err';
        return;
      }
    }
    const previous = node.originalOutput ?? node.output;
    // Roles first: applyEdit re-derives the pending rows from the saved output
    // and matches them to children by role, so the children have to be
    // wearing their new labels before it looks at them.
    if (childRoles) applyChildRoles(childRoles);
    applyEdit(state.selectedSentence, path, node, output);
    // The correction itself is evidence about the skill that produced it. It
    // is filed, not applied — see core/reflection.js.
    record({
      skill: node.skill, skillId: def?.skillId || node.skillId, file: def?.file, kind: 'edit',
      callId: node.callId || node.call?.id, revisionId: node.revisionId || node.call?.revisionId,
      sentenceIndex: state.selectedSentence, path, span: node.span,
      before: previous, after: output,
      reason: '', detail: t('reflect.fromEditor'),
    });
    if (ignored.length) {
      lastStatus = { key, text: `${t('edits.ignoredSome', { n: ignored.length })} ${ignored.join('; ')}`, cls: 'edit-status err' };
      toast(t('edits.ignoredSome', { n: ignored.length }), true);
    } else {
      lastStatus = { key, text: t('edits.savedShown'), cls: 'edit-status ok' };
      toast(t('assist.saved'));
    }
    // the repaint below rebuilds this editor, which is why lastStatus exists
    set({}, 'selectedNode', 'tree', 'artifact');
  };

  const reset = () => {
    revertEdit(state.selectedSentence, path, node);
    lastStatus = null;
    // 'artifact' repaints 标注后文件, 'tree' the ✎ flag, 'selectedNode' this pane
    set({}, 'selectedNode', 'tree', 'artifact');
    toast(t('assist.reverted'));
  };

  fill();
  return el('div', { class: 'editor open' },
    el('div', { class: 'assist-title' }, t('assist.editSection')),
    tabs,
    hint,
    ta,
    el('div', { class: 'edit-actions' },
      el('button', { class: 'btn sm', onclick: save }, t('assist.saveEdit')),
      el('button', { class: 'btn sm ghost', onclick: reset }, t('assist.revert')),
      status),
  );
}
