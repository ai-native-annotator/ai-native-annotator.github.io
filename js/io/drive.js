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

import { importDocument } from './sources.js';
import { logInfo, logError, describeError } from '../core/log.js';
import { t } from '../core/i18n.js';

const GIS = 'https://accounts.google.com/gsi/client';
const GAPI = 'https://apis.google.com/js/api.js';
const SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

let accessToken = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error(t('drive.scriptFail', { src })));
    document.head.append(s);
  });
}

export function driveClientId() {
  return localStorage.getItem('gdrive_client_id') || '';
}

export async function importFromDrive() {
  const clientId = driveClientId();
  if (!clientId) {
    throw new Error(t('drive.needClientId'));
  }
  logInfo('drive', t('drive.loading'));
  await Promise.all([loadScript(GIS), loadScript(GAPI)]);
  await new Promise((r) => window.gapi.load('client:picker', r));

  try {
    accessToken = await new Promise((resolve, reject) => {
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: (resp) => (resp.access_token ? resolve(resp.access_token) : reject(new Error(t('drive.denied')))),
        error_callback: (err) => reject(new Error(t('drive.oauthFail', { err: err.type || err.message || 'unknown' }))),
      });
      tokenClient.requestAccessToken({ prompt: accessToken ? '' : 'consent' });
    });
  } catch (err) {
    logError('drive', t('drive.oauthLogged', { err: describeError(err) }), err);
    throw err;
  }
  logInfo('drive', t('drive.oauthOk'));

  const file = await new Promise((resolve, reject) => {
    const view = new window.google.picker.DocsView(window.google.picker.ViewId.DOCS)
      .setMimeTypes('application/json,text/plain');
    new window.google.picker.PickerBuilder()
      .setOAuthToken(accessToken)
      .addView(view)
      .setCallback((data) => {
        const A = window.google.picker.Action;
        if (data.action === A.PICKED) resolve(data.docs[0]);
        else if (data.action === A.CANCEL) reject(new Error(t('drive.cancelled')));
      })
      .build().setVisible(true);
  });

  logInfo('drive', t('drive.reading', { name: file.name }));
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(t('drive.readFail', { status: res.status, text: res.statusText }));
  return importDocument(await res.text(), file.name);
}
