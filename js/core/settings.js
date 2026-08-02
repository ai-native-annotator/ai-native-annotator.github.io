/**
 * Local-only credential storage (requirement: API keys live on the user's
 * machine, never on a server this tool controls).
 *
 * Two layers, same data:
 *   - localStorage, keyed `annotator_secrets` — convenience, survives reloads.
 *   - an exportable/importable JSON file — the literal "local folder" copy,
 *     so a key can live in a file the user actually owns and can back up,
 *     move between browsers, or delete. Nothing here is ever sent anywhere
 *     except straight to the named provider's own API from the browser.
 */

import { state, set } from './state.js';
import { download } from './dom.js';
import { logInfo } from './log.js';

const KEY = 'annotator_secrets';

const DEFAULTS = () => ({
  apiKeys: {},              // provider id -> key
  models: {},                // provider id -> model override
  driveClientId: '',
  githubToken: '',
});

export function loadSecrets() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { /* first run */ }
  const merged = { ...DEFAULTS(), ...saved };
  set({
    apiKeys: merged.apiKeys,
    models: merged.models,
    github: { ...state.github, token: merged.githubToken },
  });
  return merged;
}

export function saveSecrets(patch) {
  const current = {
    apiKeys: state.apiKeys,
    models: state.models,
    driveClientId: localStorage.getItem('gdrive_client_id') || '',
    githubToken: state.github.token,
  };
  const next = { ...current, ...patch };
  localStorage.setItem(KEY, JSON.stringify(next));
  if (patch.driveClientId !== undefined) localStorage.setItem('gdrive_client_id', patch.driveClientId);
  set({
    apiKeys: next.apiKeys,
    models: next.models,
    github: { ...state.github, token: next.githubToken },
  });
  logInfo('settings', '本地设置已保存（仅存于本机，不上传任何服务器）');
  return next;
}

export function setApiKey(provider, key) {
  saveSecrets({ apiKeys: { ...state.apiKeys, [provider]: key.trim() } });
}

export function setModel(provider, model) {
  saveSecrets({ models: { ...state.models, [provider]: model.trim() } });
}

/** Export every locally-stored credential as one JSON file the user keeps. */
export function exportSecretsFile() {
  const payload = {
    apiKeys: state.apiKeys,
    models: state.models,
    driveClientId: localStorage.getItem('gdrive_client_id') || '',
    githubToken: state.github.token,
    exportedAt: new Date().toISOString(),
    note: 'AI 标注助手本地凭据备份。请妥善保管，不要提交到公开仓库。',
  };
  download('annotator-credentials.json', JSON.stringify(payload, null, 2));
  logInfo('settings', '凭据已导出为本地文件');
}

/** Import a previously-exported credentials file. */
export async function importSecretsFile(file) {
  const text = await file.text();
  const payload = JSON.parse(text);
  return saveSecrets({
    apiKeys: payload.apiKeys || {},
    models: payload.models || {},
    driveClientId: payload.driveClientId || '',
    githubToken: payload.githubToken || '',
  });
}
