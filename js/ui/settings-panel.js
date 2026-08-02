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

export function openSettings() {
  const overlay = el('div', { class: 'overlay', onclick: (e) => { if (e.target === overlay) close(); } });
  const close = () => overlay.remove();

  const providerRows = Object.entries(PROVIDERS).map(([id, meta]) => providerRow(id, meta));

  const driveInput = el('input', {
    class: 'settings-input', placeholder: '例如 1234567890-abc.apps.googleusercontent.com',
    value: localStorage.getItem('gdrive_client_id') || '',
  });
  const driveSave = el('button', { class: 'btn sm ghost', onclick: () => {
    saveSecrets({ driveClientId: driveInput.value.trim() });
    toast('已保存 Google OAuth Client ID');
  } }, '保存');

  const ghInput = el('input', {
    class: 'settings-input', type: 'password', placeholder: 'ghp_... 或 github_pat_...',
    value: state.github.token || '',
  });
  const ghSave = el('button', { class: 'btn sm ghost', onclick: () => {
    saveSecrets({ githubToken: ghInput.value.trim() });
    toast('已保存 GitHub Token（仅本机）');
  } }, '保存');

  const importInput = el('input', { type: 'file', accept: 'application/json', class: 'hidden-file' });
  importInput.onchange = async () => {
    const file = importInput.files?.[0];
    if (!file) return;
    try {
      await importSecretsFile(file);
      toast('已从本地文件导入凭据');
      close(); openSettings();
    } catch (err) { toast(`导入失败：${describeError(err)}`, true); }
  };

  const body = el('div', { class: 'modal-body settings-body' },
    section('大模型 API Key（存于本机，可导出为本地文件备份）', providerRows),
    section('Google Drive', [
      field('OAuth Client ID', driveInput, driveSave),
      el('div', { class: 'hint' }, '在 Google Cloud Console 创建 OAuth 客户端 ID（应用类型：桌面应用/Web），本工具没有后端，无法代为保管凭据。'),
    ]),
    section('GitHub', [
      field('Personal Access Token', ghInput, ghSave),
      el('div', { class: 'hint' },
        '需要 repo 权限的 fine-grained 或 classic token（github.com/settings/tokens）。'
        + '用于浏览你的仓库/fork、读写标注文件、发起 inter-annotator 合并。'),
    ]),
    section('本地凭据文件', [
      el('div', { class: 'settings-row' },
        el('button', { class: 'btn sm ghost', onclick: exportSecretsFile }, '导出为本地文件'),
        el('button', { class: 'btn sm ghost', onclick: () => importInput.click() }, '从本地文件导入'),
        importInput),
      el('div', { class: 'hint' }, '所有 key/token 会打包成一个 JSON 文件下载到本地——可以放进你自己的密码管理器或加密文件夹，不会经过任何服务器。'),
    ]),
  );

  overlay.append(el('div', { class: 'modal settings-modal' },
    el('div', { class: 'modal-head' },
      el('h3', {}, '⚙ 设置'),
      el('button', { class: 'btn sm ghost', onclick: close }, '关闭')),
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
    toast(`已保存 ${meta.label} 设置`);
  };
  return el('div', { class: 'provider-row' },
    el('div', { class: 'provider-name' },
      meta.label,
      el('label', { class: 'radio-inline' },
        el('input', {
          type: 'radio', name: 'active-provider', checked: state.provider === id,
          onchange: () => { set({ provider: id }, 'provider'); logInfo('settings', `已切换默认模型提供方为 ${meta.label}`); },
        }), '设为默认')),
    field('API Key', keyInput, null),
    field('模型', modelInput, null),
    el('button', { class: 'btn sm', onclick: save }, '保存'));
}

export function mountSettingsButton() {
  $('#btn-settings').onclick = openSettings;
}
