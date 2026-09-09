/**
 * Run authored code without letting it into the page.
 *
 * The rest of this app deliberately contains no `eval` and no `new Function` —
 * see js/formats/declarative.js, where a generated *format* is a spec rather
 * than code for exactly this reason. But a file parser is not a spec: the
 * shapes real corpora arrive in (CoNLL-U, a bespoke tab layout, an XML dump,
 * one JSON-per-line) need loops and conditionals, and pretending otherwise
 * would mean a format the tool cannot read is a format you must file a bug for.
 *
 * So authored code is allowed, and confined: it runs in a worker with no DOM,
 * no storage, no network, and a deadline. The page keeps its property that
 * nothing in it evaluates a string.
 */

import { t } from './i18n.js';

const WORKER_URL = 'js/sandbox-worker.js';
export const SANDBOX_TIMEOUT_MS = 5000;

/**
 * Call `entry(...args)` inside `source` and return what it returned.
 *
 * The timeout is the point of the worker as much as the isolation is: a parser
 * with a runaway loop hangs its worker, and the worker is disposable. The same
 * loop in the page would hang the tab with no way back.
 */
export function runUserCode(source, entry, args = [], { timeoutMs = SANDBOX_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker(WORKER_URL);
    } catch (err) {
      reject(new Error(t('sandbox.unavailable', { err: err.message })));
      return;
    }
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error(t('sandbox.timeout', { s: Math.round(timeoutMs / 1000), entry })));
    }, timeoutMs);
    const done = (fn, arg) => { clearTimeout(timer); worker.terminate(); fn(arg); };

    worker.onmessage = (e) => {
      const { ok, value, error } = e.data || {};
      if (ok) done(resolve, value);
      else done(reject, new Error(t('sandbox.threw', { entry, err: error })));
    };
    worker.onerror = (e) => done(reject, new Error(t('sandbox.threw', { entry, err: e.message || 'error' })));
    worker.postMessage({ source, entry, args });
  });
}

/** Is the sandbox usable at all? (file:// has no workers, for instance.) */
export function sandboxAvailable() {
  return typeof Worker === 'function' && location.protocol !== 'file:';
}
