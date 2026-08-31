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

import { state, set, pathKey } from '../core/state.js';
import { el, jsonHtml, fmtMs } from '../core/dom.js';
import { toast } from './toast.js';
import { t } from '../core/i18n.js';

export function renderAssistant(container, format) {
  const sel = state.selectedNode;
  container.innerHTML = '';

  if (!sel) {
    container.append(el('div', { class: 'empty' },
      t('assist.empty')));
    return;
  }

  const { node, path } = sel;
  if (!node || node.pending) { container.append(el('div', { class: 'empty' }, t('assist.noResult'))); return; }
  const key = pathKey(path);
  const def = (format.skills || []).find((s) => s.id === node.skill);
  const edited = state.edits.get(key);
  const shown = edited ?? node.output;

  container.append(
    el('div', { class: 'assist-head' },
      el('span', { class: 'skill-chip lg', style: `--c:${format.skillColor?.(node.skill) || '#888'}` },
         node.skill),
      def ? el('span', { class: 'skill-label' }, def.label) : null,
      el('span', { class: `src-badge ${node.source || 'replay'}` }, sourceText(node)),
    ),
    def?.describes ? el('div', { class: 'skill-desc' }, def.describes) : null,
    def?.file ? el('div', { class: 'skill-file' }, t('assist.skillFile', { file: def.file })) : null,

    section(t('assist.span'), el('div', { class: 'span-box' }, node.span || '—')),
    section(t('assist.input'), el('pre', { class: 'code sm' }, node.input || '—')),
    section(t('assist.output') + (edited ? t('assist.outputEdited') : ''),
      el('pre', { class: `code${edited ? ' edited' : ''}`, html: jsonHtml(shown) })),
    node.rationale
      ? section(t('assist.rationale'),
          el('div', { class: 'rationale model' }, node.rationale))
      : null,
    editor(key, shown, node),
  );
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

function editor(key, shown, node) {
  const ta = el('textarea', {
    class: 'edit-box',
    spellcheck: 'false',
    rows: 6,
  }, JSON.stringify(shown, null, 2));

  const status = el('span', { class: 'edit-status' });

  const apply = () => {
    try {
      const parsed = JSON.parse(ta.value);
      state.edits.set(key, parsed);
      set({}, 'selectedNode', 'tree', 'artifact');
      toast(t('assist.saved'));
    } catch (err) {
      status.textContent = t('assist.jsonError') + err.message;
      status.className = 'edit-status err';
    }
  };

  const reset = () => {
    state.edits.delete(key);
    set({}, 'selectedNode', 'tree', 'artifact');
    toast(t('assist.reverted'));
  };

  return el('details', { class: 'editor', ...(state.edits.has(key) ? { open: '' } : {}) },
    el('summary', {}, t('assist.editSection')),
    el('div', { class: 'edit-hint' },
      t('assist.editHint')),
    ta,
    el('div', { class: 'edit-actions' },
      el('button', { class: 'btn sm', onclick: apply }, t('assist.saveEdit')),
      el('button', { class: 'btn sm ghost', onclick: reset }, t('assist.revert')),
      status),
  );
}
