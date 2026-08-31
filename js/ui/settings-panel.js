/**
 * Settings drawer: every credential the app needs, stored only on this
 * machine (localStorage), with an explicit export/import to a JSON file the
 * user keeps in their own folder — a real local copy, not just "trust the
 * browser". Nothing here is ever sent anywhere except straight to the named
 * provider's API from the browser when you actually run a skill.
 */

import { el, $ } from '../core/dom.js';
import { state, set } from '../core/state.js';
import { PROVIDERS } from '../core/providers.js';
import { setApiKey, setModel, saveSecrets, exportSecretsFile, importSecretsFile } from '../core/settings.js';
import { toast } from './toast.js';
import { logInfo, describeError } from '../core/log.js';
import { t } from '../core/i18n.js';

export function openSettings() {
  const overlay = el('div', { class: 'overlay', onclick: (e) => { if (e.target === overlay) close(); } });
  const close = () => overlay.remove();

  const providerRows = Object.entries(PROVIDERS).map(([id, meta]) => providerRow(id, meta));

  const driveInput = el('input', {
    class: 'settings-input', placeholder: t('settings.drivePlaceholder'),
    value: localStorage.getItem('gdrive_client_id') || '',
  });
  const driveSave = el('button', { class: 'btn sm ghost', onclick: () => {
    saveSecrets({ driveClientId: driveInput.value.trim() });
    toast(t('settings.savedDrive'));
  } }, t('common.save'));

  const ghInput = el('input', {
    class: 'settings-input', type: 'password', placeholder: t('settings.tokenPlaceholder'),
    value: state.github.token || '',
  });
  const ghSave = el('button', { class: 'btn sm ghost', onclick: () => {
    saveSecrets({ githubToken: ghInput.value.trim() });
    toast(t('settings.savedGithub'));
  } }, t('common.save'));

  const importInput = el('input', { type: 'file', accept: 'application/json', class: 'hidden-file' });
  importInput.onchange = async () => {
    const file = importInput.files?.[0];
    if (!file) return;
    try {
      await importSecretsFile(file);
      toast(t('settings.imported'));
      close(); openSettings();
    } catch (err) { toast(t('settings.importFailed', { err: describeError(err) }), true); }
  };

  const body = el('div', { class: 'modal-body settings-body' },
    section(t('settings.apiKeys'), providerRows),
    section(t('settings.driveTitle'), [
      field(t('settings.driveClientId'), driveInput, driveSave),
      el('div', { class: 'hint' }, t('settings.driveHint')),
    ]),
    section(t('settings.githubTitle'), [
      field(t('settings.githubToken'), ghInput, ghSave),
      el('div', { class: 'hint' }, t('settings.githubHint')),
    ]),
    section(t('settings.fileTitle'), [
      el('div', { class: 'settings-row' },
        el('button', { class: 'btn sm ghost', onclick: exportSecretsFile }, t('settings.exportFile')),
        el('button', { class: 'btn sm ghost', onclick: () => importInput.click() }, t('settings.importFile')),
        importInput),
      el('div', { class: 'hint' }, t('settings.fileHint')),
    ]),
  );

  overlay.append(el('div', { class: 'modal settings-modal' },
    el('div', { class: 'modal-head' },
      el('h3', {}, t('settings.title')),
      el('button', { class: 'btn sm ghost', onclick: close }, t('common.close'))),
    body));
  document.body.append(overlay);
}

function section(title, children) {
  return el('div', { class: 'settings-section' }, el('div', { class: 'settings-title' }, title), ...children);
}

function field(label, input, action) {
  return el('div', { class: 'settings-row' }, el('label', { class: 'settings-label' }, label), input, action);
}

function providerRow(id, meta) {
  const keyInput = el('input', {
    class: 'settings-input', type: 'password', placeholder: meta.keyHint, value: state.apiKeys[id] || '',
  });
  const modelInput = el('input', {
    class: 'settings-input', placeholder: meta.modelHint, value: state.models[id] || meta.defaultModel || '',
  });
  const save = () => {
    setApiKey(id, keyInput.value);
    setModel(id, modelInput.value);
    toast(t('settings.savedProvider', { name: meta.label }));
  };
  return el('div', { class: 'provider-row' },
    el('div', { class: 'provider-name' },
      meta.label,
      el('label', { class: 'radio-inline' },
        el('input', {
          type: 'radio', name: 'active-provider', checked: state.provider === id,
          onchange: () => { set({ provider: id }, 'provider'); logInfo('settings', `default provider -> ${meta.label}`); },
        }), t('settings.setDefault'))),
    field(t('settings.apiKey'), keyInput, null),
    field(t('settings.model'), modelInput, null),
    el('button', { class: 'btn sm', onclick: save }, t('common.save')));
}

export function mountSettingsButton() {
  $('#btn-settings').onclick = openSettings;
}
