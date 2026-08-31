/**
 * fetch with a deadline.
 *
 * A request that fails is easy: it rejects and someone reports it. A request
 * that simply never answers is the bad case — boot() awaits it forever, the
 * page sits there half-built, and the only symptom is "it did not finish",
 * which says nothing about where or why. A deadline turns that silence into a
 * normal, attributable error.
 *
 * Only used for the app's own asset fetches (skill files, demo corpora,
 * vendored resources). Model calls are deliberately NOT capped here — a long
 * generation is not a stall, and core/providers.js already carries an abort
 * signal for the caller to cancel deliberately.
 */

import { t } from './i18n.js';

export const ASSET_TIMEOUT_MS = 15000;

export async function fetchAsset(url, { timeoutMs = ASSET_TIMEOUT_MS, ...init } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error(t('net.timeout', { url, s: Math.round(timeoutMs / 1000) }));
    }
    throw new Error(t('net.failed', { url, err: err?.message || String(err) }));
  } finally {
    clearTimeout(timer);
  }
}
