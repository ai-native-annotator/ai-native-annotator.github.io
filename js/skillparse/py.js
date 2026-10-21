/**
 * The page's handle on the Python worker: py(method, args) -> the bridge's result.
 * A Python exception comes back as a rejected promise whose error carries the traceback.
 */

let worker = null;
let seq = 0;
const waiting = new Map();
const listeners = new Set();

export function onProgress(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function send(method, args) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    waiting.set(id, { resolve, reject });
    worker.postMessage({ id, method, args });
  });
}

export async function bootPython() {
  worker = new Worker(new URL('./py-worker.js', import.meta.url));
  worker.onmessage = ({ data }) => {
    if (data.type === 'progress') {
      listeners.forEach((fn) => fn(data.text));
      return;
    }
    const w = waiting.get(data.id);
    if (!w) return;
    waiting.delete(data.id);
    if (data.error) {
      const err = new Error(data.error);
      err.trace = data.trace;
      w.reject(err);
    } else {
      w.resolve(data.ok);
    }
  };
  worker.onerror = (e) => listeners.forEach((fn) => fn(`worker error: ${e.message}`));
  const base = new URL('../../', import.meta.url).href;
  return send('__boot', { base });
}

export function py(method, args = {}) {
  if (!worker) return Promise.reject(new Error('Python is not loaded'));
  return send(method, args);
}
