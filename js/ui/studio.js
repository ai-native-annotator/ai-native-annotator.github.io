/**
 * Format studio — describe an annotation format in words, get a working
 * renderer.
 *
 * Offline it derives the spec from keywords; in live mode the model fills in
 * the same declarative schema. Either way the result is a JSON spec you can
 * read, edit by hand, and commit — the renderer is built from the spec, so
 * the spec *is* the format definition.
 */

import { el, jsonHtml, download, labelledRow } from '../core/dom.js';
import { state } from '../core/state.js';
import { registerRuntimeFormat } from '../core/registry.js';
import { buildFormat, specFromDescription, specPrompt } from '../formats/declarative.js';
import { callProvider, PROVIDERS } from '../core/providers.js';
import { extractJson } from '../core/runner.js';
import { logInfo, logError, describeError } from '../core/log.js';
import { t } from '../core/i18n.js';

export function openStudio(onCreated) {
  const desc = el('textarea', {
    class: 'studio-desc', rows: 5,
    placeholder: t('studio.descPlaceholder'),
  });
  const idInput = el('input', { class: 'studio-id', placeholder: t('studio.idPlaceholder'), value: '' });
  const preview = el('pre', { class: 'code studio-preview' }, t('studio.notGenerated'));
  const status = el('span', { class: 'edit-status' });
  let spec = null;

  const generate = async () => {
    const text = desc.value.trim();
    const id = (idInput.value.trim() || 'custom').replace(/[^a-z0-9_-]/gi, '').toLowerCase();
    if (!text) { status.textContent = t('studio.needDesc'); status.className = 'edit-status err'; return; }
    status.textContent = t('studio.generating'); status.className = 'edit-status';
    try {
      if (state.runMode === 'live' && state.apiKeys[state.provider]) {
        logInfo('studio', t('studio.liveGen', { id }));
        const provider = state.provider;
        const text2 = await callProvider(provider, {
          apiKey: state.apiKeys[provider], model: state.models[provider] || PROVIDERS[provider]?.defaultModel,
          prompt: specPrompt(text, id),
        });
        spec = extractJson(text2);
        status.textContent = t('studio.liveDone');
      } else {
        spec = specFromDescription(text, id);
        status.textContent = t('studio.localDone');
      }
      spec.id = id;
      preview.innerHTML = jsonHtml(spec);
      status.className = 'edit-status ok';
    } catch (err) {
      logError('studio', t('studio.genFailedLog', { err: describeError(err) }), err);
      status.textContent = t('studio.genFailed', { err: err.message });
      status.className = 'edit-status err';
    }
  };

  const apply = () => {
    if (!spec) { status.textContent = t('studio.needSpec'); status.className = 'edit-status err'; return; }
    try {
      const edited = JSON.parse(preview.textContent);
      const format = registerRuntimeFormat(buildFormat(edited));
      close();
      onCreated?.(format);
    } catch (err) {
      status.textContent = t('studio.badSpec', { err: err.message });
      status.className = 'edit-status err';
    }
  };

  const overlay = el('div', { class: 'overlay', onclick: (e) => { if (e.target === overlay) close(); } },
    el('div', { class: 'modal' },
      el('div', { class: 'modal-head' },
        el('h3', {}, t('studio.title')),
        el('button', { class: 'btn sm ghost', onclick: () => close() }, t('common.close'))),
      el('div', { class: 'modal-body' },
        labelledRow(t('studio.formatId'), idInput, null, 'field', ''),
        labelledRow(t('studio.describe'), desc, null, 'field', ''),
        el('div', { class: 'modal-actions' },
          el('button', { class: 'btn', onclick: generate }, t('studio.generate')),
          el('button', { class: 'btn ghost', onclick: apply }, t('studio.apply')),
          el('button', {
            class: 'btn ghost sm',
            onclick: () => spec && download(`format-${spec.id}.json`, JSON.stringify(spec, null, 2)),
          }, t('studio.exportSpec')),
          status),
        el('div', { class: 'field' },
          // a contentEditable div is not a form control, so this stays a plain
          // caption rather than a <label> pointing at something unlabellable
          el('div', { class: 'field-caption' }, t('studio.specLabel')),
          el('div', { class: 'editable-wrap' }, Object.assign(preview, { contentEditable: 'true' }))),
        el('div', { class: 'hint' }, t('studio.hint')),
      )));

  const close = () => overlay.remove();
  document.body.append(overlay);
  desc.focus();
}
