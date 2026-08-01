/**
 * Visible activity log. Every skill call, source-connect attempt, and
 * background operation reports here — success or failure — so nothing is
 * only discoverable by opening devtools. Errors also go to console.error
 * with the full object (stack, cause) for real debugging.
 *
 * This exists so failures are *surfaced*, not swallowed: a catch block's job
 * is to log + rethrow-or-report, never to just make the error disappear.
 */

import { state, set } from './state.js';

const MAX_LOG = 500;

export function logEvent(level, source, message, detail) {
  const entry = { ts: Date.now(), level, source, message, detail };
  state.log.push(entry);
  if (state.log.length > MAX_LOG) state.log.shift();
  set({}, 'log');
  const line = `[${source}] ${message}`;
  if (level === 'error') console.error(line, detail ?? '');
  else if (level === 'warn') console.warn(line, detail ?? '');
  else console.log(line, detail ?? '');
  return entry;
}

export const logInfo = (source, message, detail) => logEvent('info', source, message, detail);
export const logWarn = (source, message, detail) => logEvent('warn', source, message, detail);
export const logError = (source, message, detail) => logEvent('error', source, message, detail);

/** Format an Error (or anything thrown) into a short, honest message. */
export function describeError(err) {
  if (err instanceof Error) return err.message || err.name || String(err);
  if (typeof err === 'string') return err;
  try { return JSON.stringify(err); } catch { return String(err); }
}
