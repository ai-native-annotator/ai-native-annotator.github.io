/**
 * Google Drive import. Needs the user's own OAuth client id (no server to
 * hold one — see core/settings.js), entered in Settings and kept in
 * localStorage. Loads the Google scripts lazily so the app works fully
 * offline until Drive is actually used.
 *
 * A file picked here is plain text/JSON, so it goes through the exact same
 * parseDocument() as a local file or a pasted sample — a pre-annotation UMR
 * file from Drive becomes a document with every sentence's tree empty,
 * ready for step-by-step live annotation.
 */

import { parseDocument } from './sources.js';
import { logInfo, logError, describeError } from '../core/log.js';

const GIS = 'https://accounts.google.com/gsi/client';
const GAPI = 'https://apis.google.com/js/api.js';
const SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

let accessToken = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error(`加载失败: ${src}`));
    document.head.append(s);
  });
}

export function driveClientId() {
  return localStorage.getItem('gdrive_client_id') || '';
}
export function setDriveClientId(id) {
  localStorage.setItem('gdrive_client_id', id.trim());
}

export async function importFromDrive() {
  const clientId = driveClientId();
  if (!clientId) {
    throw new Error('请先在「设置」里填入你自己的 Google OAuth Client ID —— 本工具没有后端，不能替你保管凭据。');
  }
  logInfo('drive', '加载 Google Identity Services / Picker…');
  await Promise.all([loadScript(GIS), loadScript(GAPI)]);
  await new Promise((r) => window.gapi.load('client:picker', r));

  try {
    accessToken = await new Promise((resolve, reject) => {
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: (resp) => (resp.access_token ? resolve(resp.access_token) : reject(new Error('授权被拒绝'))),
        error_callback: (err) => reject(new Error(`OAuth 失败: ${err.type || err.message || '未知错误'}`)),
      });
      tokenClient.requestAccessToken({ prompt: accessToken ? '' : 'consent' });
    });
  } catch (err) {
    logError('drive', `Google OAuth 失败：${describeError(err)}`, err);
    throw err;
  }
  logInfo('drive', 'OAuth 成功，打开文件选择器');

  const file = await new Promise((resolve, reject) => {
    const view = new window.google.picker.DocsView(window.google.picker.ViewId.DOCS)
      .setMimeTypes('application/json,text/plain');
    new window.google.picker.PickerBuilder()
      .setOAuthToken(accessToken)
      .addView(view)
      .setCallback((data) => {
        const A = window.google.picker.Action;
        if (data.action === A.PICKED) resolve(data.docs[0]);
        else if (data.action === A.CANCEL) reject(new Error('已取消'));
      })
      .build().setVisible(true);
  });

  logInfo('drive', `读取文件 ${file.name}`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Drive 读取失败: ${res.status} ${res.statusText}`);
  return parseDocument(await res.text(), file.name);
}
