/**
 * "How should this format read a file?" — asked, answered, and kept.
 *
 * Three ways in, deliberately, because the answer is easy for some corpora and
 * not for others: pick a reader that ships with the app, describe your files in
 * a sentence and let the model draft one, or write it yourself. Whichever you
 * use, the result is the same editable JavaScript, saved against this format
 * alone — the reader a UMR treebank needs is not the reader a sentiment corpus
 * needs, and neither should overwrite the other.
 *
 * Nothing is adopted untested. The dry-run button runs the reader on a sample
 * you paste and shows the sentences it produced, because a parser that returns
 * the wrong thing quietly is worse than one that throws.
 */

import { el, mount } from '../core/dom.js';
import { state, set } from '../core/state.js';
import { t } from '../core/i18n.js';
import { getFormat } from '../core/registry.js';
import {
  BUILTIN,
  builtinSource,
  getImporter,
  setImporter,
  clearImporter,
  tryImporter,
  importerPrompt,
  cleanGeneratedCode,
} from '../core/importers.js';
import { callProvider, PROVIDERS } from '../core/providers.js';
import { logError, describeError } from '../core/log.js';
import { toast } from './toast.js';

export async function openImporterPanel(formatId = state.formatId) {
  const overlay = el('div', {
    class: 'overlay',
    onclick: (e) => {
      if (e.target === overlay) close();
    },
  });
  const close = () => overlay.remove();
  const body = el('div', { class: 'modal-body importer-body' });
  const format = getFormat(formatId);
  overlay.append(
    el(
      'div',
      { class: 'modal wide' },
      el(
        'div',
        { class: 'modal-head' },
        el('h3', {}, t('imp.title', { format: format?.label || formatId })),
        el('button', { class: 'btn sm ghost', onclick: close }, t('common.close')),
      ),
      body,
    ),
  );
  document.body.append(overlay);
  await render(body, formatId);
}

async function render(body, formatId) {
  body.innerHTML = '';
  const current = getImporter(formatId);
  const code = el('textarea', { class: 'edit-box code-box', spellcheck: 'false', rows: 18 });
  code.value = current?.source || (await builtinSource(BUILTIN[0].file));

  const status = el('span', { class: 'edit-status' });
  const preview = el('div', { class: 'importer-preview' });
  let verifiedDraft = null;

  const draftSnapshot = () => ({ source: code.value, sample: sample.value.trim() });
  const invalidateDryRun = () => {
    verifiedDraft = null;
  };
  const isCurrentDraftVerified = () => {
    const now = draftSnapshot();
    return verifiedDraft?.source === now.source && verifiedDraft?.sample === now.sample;
  };

  /* ---- start from a reader that already exists ---- */
  const picker = el(
    'div',
    { class: 'importer-row' },
    el('span', { class: 'settings-label' }, t('imp.startFrom')),
    ...BUILTIN.map((b) =>
      el(
        'button',
        {
          class: 'btn sm ghost',
          onclick: async () => {
            code.value = await builtinSource(b.file);
            invalidateDryRun();
            status.textContent = t('imp.loaded', { name: b.label });
          },
        },
        b.label,
      ),
    ),
  );

  /* ---- or describe the files and have one drafted ---- */
  const describe = el('textarea', {
    class: 'edit-box',
    rows: 2,
    placeholder: t('imp.describeHint'),
  });
  const sample = el('textarea', {
    class: 'edit-box',
    rows: 4,
    spellcheck: 'false',
    placeholder: t('imp.sampleHint'),
  });
  const draftBtn = el(
    'button',
    {
      class: 'btn sm',
      'data-importer-action': 'draft',
      onclick: () => draft(),
    },
    t('imp.draft'),
  );

  async function draft() {
    const provider = state.provider;
    const key = (state.apiKeys[provider] || '').trim();
    if (!key) {
      status.textContent = t('app.needKey');
      status.className = 'edit-status err';
      return;
    }
    status.textContent = t('imp.drafting');
    status.className = 'edit-status';
    try {
      const text = await callProvider(provider, {
        apiKey: key,
        model: state.models[provider] || PROVIDERS[provider]?.defaultModel,
        prompt: importerPrompt(describe.value, sample.value),
      });
      code.value = cleanGeneratedCode(text);
      invalidateDryRun();
      status.textContent = t('imp.drafted');
      status.className = 'edit-status ok';
    } catch (err) {
      logError('importers', describeError(err), err);
      status.textContent = describeError(err);
      status.className = 'edit-status err';
    }
  }

  /* ---- try it before adopting it ---- */
  async function dryRun() {
    preview.innerHTML = '';
    invalidateDryRun();
    const text = sample.value.trim();
    if (!text) {
      status.textContent = t('imp.needSample');
      status.className = 'edit-status err';
      return;
    }
    status.textContent = t('imp.running');
    status.className = 'edit-status';
    try {
      const doc = await tryImporter(code.value, text, 'sample.txt');
      verifiedDraft = draftSnapshot();
      status.textContent = t('imp.ranOk', { n: doc.sentences.length });
      status.className = 'edit-status ok';
      mount(
        preview,
        el(
          'div',
          { class: 'hint' },
          t('imp.previewTitle', { n: doc.sentences.length, lang: doc.language }),
        ),
        ...doc.sentences
          .slice(0, 6)
          .map((s) =>
            el(
              'div',
              { class: 'importer-sent' },
              el('span', { class: 'tok-idx' }, String(s.index)),
              el('span', { class: 'importer-sent-text' }, s.text),
              el(
                'span',
                { class: 'muted sm' },
                t('imp.tokenCount', { n: (s.tokens || []).length }),
              ),
            ),
          ),
        doc.sentences.length > 6
          ? el('div', { class: 'muted sm' }, t('imp.andMore', { n: doc.sentences.length - 6 }))
          : null,
      );
    } catch (err) {
      status.textContent = describeError(err);
      status.className = 'edit-status err';
    }
  }

  code.addEventListener('input', invalidateDryRun);
  sample.addEventListener('input', invalidateDryRun);

  mount(
    body,
    el('div', { class: 'hint' }, t('imp.hint')),
    picker,
    el('div', { class: 'assist-title' }, t('imp.describeTitle')),
    describe,
    el('div', { class: 'assist-title' }, t('imp.sampleTitle')),
    sample,
    el(
      'div',
      { class: 'importer-row' },
      draftBtn,
      el(
        'button',
        {
          class: 'btn sm ghost',
          'data-importer-action': 'dry-run',
          onclick: dryRun,
        },
        t('imp.dryRun'),
      ),
    ),
    el('div', { class: 'assist-title' }, t('imp.codeTitle')),
    code,
    preview,
    el(
      'div',
      { class: 'modal-actions' },
      el(
        'button',
        {
          class: 'btn sm',
          'data-importer-action': 'save',
          onclick: async () => {
            // Verification belongs to this exact source + sample pair. Editing
            // either after a successful run invalidates it and requires another
            // dry-run; an empty sample can never count as verification.
            if (!isCurrentDraftVerified()) {
              status.textContent = t('imp.refusedSave', { err: t('imp.needDryRun') });
              status.className = 'edit-status err';
              return;
            }
            setImporter(formatId, code.value);
            toast(t('imp.savedToast', { format: formatId }));
            set({}, 'importers');
            await render(body, formatId);
          },
        },
        t('imp.save'),
      ),
      current
        ? el(
            'button',
            {
              class: 'btn sm ghost',
              onclick: async () => {
                clearImporter(formatId);
                toast(t('imp.clearedToast'));
                await render(body, formatId);
              },
            },
            t('imp.revert'),
          )
        : null,
      status,
    ),
    current
      ? el(
          'div',
          { class: 'hint' },
          t('imp.inUse', { when: new Date(current.updatedAt).toLocaleString() }),
        )
      : el('div', { class: 'hint' }, t('imp.usingBuiltin')),
  );
}
