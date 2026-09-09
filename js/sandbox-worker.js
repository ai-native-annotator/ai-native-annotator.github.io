/**
 * The one place in this app where authored code is executed.
 *
 * A custom importer (or a skill's code step) is JavaScript the annotator wrote
 * or a model generated. Running it in the page would put it next to the API
 * keys in localStorage, the document, and the DOM — on a public site that is
 * not a trade worth making for a file parser.
 *
 * So it runs here instead. A worker has no DOM, no localStorage, no cookies,
 * and no access to anything the page holds; it can be killed mid-loop; and the
 * only way in or out is the message this file answers. `fetch` and friends are
 * removed below so a parser cannot quietly become a network client.
 *
 * The worker is a same-origin file rather than a blob: URL on purpose — a
 * `script-src 'self'` policy allows this and blocks the blob.
 *
 * Message in : {source, entry, args}
 * Message out: {ok: true, value} | {ok: false, error}
 */

// Nothing here needs the network or the parent's storage. Taking them away is
// cheaper than auditing what a generated parser might do with them.
for (const name of ['fetch', 'XMLHttpRequest', 'WebSocket', 'importScripts', 'indexedDB', 'caches']) {
  try { delete self[name]; } catch { self[name] = undefined; }
}

self.onmessage = (e) => {
  const { source, entry, args } = e.data || {};
  try {
    // eslint-disable-next-line no-new-func
    const module = new Function(`"use strict";\n${source}\nreturn typeof ${entry} === 'function' ? ${entry} : undefined;`)();
    if (typeof module !== 'function') {
      throw new Error(`the code does not define a function called ${entry}()`);
    }
    const value = module(...(args || []));
    // structuredClone here rather than at postMessage time so an unserialisable
    // return value (a function, a DOM-ish object) fails with a message about
    // the value rather than an opaque DataCloneError.
    self.postMessage({ ok: true, value: structuredClone(value) });
  } catch (err) {
    self.postMessage({ ok: false, error: String(err && err.message ? err.message : err) });
  }
};
