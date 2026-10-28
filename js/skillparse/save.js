/**
 * Work in progress, kept in this browser (IndexedDB, which holds far more than localStorage):
 *
 *   work     "<skillset>|<doc>" -> {at, skillset, doc, wave, item, steps, confirmed, state}
 *            state is the bridge's snapshot(): every step of every wave, as it stands
 *   imports  "<doc>" -> {name, text, fmt, at}: the documents imported here, imported again into
 *            the page's Python at start (its file system lives only as long as the page)
 *
 * Nothing here is sent anywhere. Storage can be blocked (a private window, cleared site data):
 * then every call quietly does nothing and the page works as before, without keeping anything.
 */

const DB = 'skillparse';
const STORES = ['work', 'imports'];
let opened = null;

function db() {
  if (!opened) {
    opened = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => STORES.forEach((s) => {
        if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
      });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }).catch(() => null);
  }
  return opened;
}

async function run(store, mode, fn) {
  try {
    const d = await db();
    if (!d) return undefined;
    return await new Promise((resolve, reject) => {
      const tx = d.transaction(store, mode);
      const req = fn(tx.objectStore(store));
      tx.oncomplete = () => resolve(req?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('skillparse: browser storage', err);
    return undefined;
  }
}

export const workKey = (skillset, doc) => `${skillset}|${doc}`;
export const getWork = (key) => run('work', 'readonly', (s) => s.get(key));
export const putWork = (key, rec) => run('work', 'readwrite', (s) => s.put(rec, key));
export const dropWork = (key) => run('work', 'readwrite', (s) => s.delete(key));

export async function allImports() {
  const recs = await run('imports', 'readonly', (s) => s.getAll());
  return (recs || []).sort((a, b) => String(a.at).localeCompare(String(b.at)));
}
export const putImport = (rec) => run('imports', 'readwrite', (s) => s.put({ ...rec, at: new Date().toISOString() }, rec.name));

/** The document last open, for the next visit. */
export function lastOpen(value) {
  try {
    if (value) localStorage.setItem('skillparse_last', JSON.stringify(value));
    else return JSON.parse(localStorage.getItem('skillparse_last') || 'null');
  } catch { /* storage blocked */ }
  return null;
}
