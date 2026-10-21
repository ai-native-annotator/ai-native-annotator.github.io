/**
 * Edited skill files, kept in this browser.
 *
 * Every save of a file is a version {at, content, note, source}; the last version is the one
 * the skills run with. The originals stay on the server (data/skillparse/fs/), so "back to the
 * original" is a fetch, never a lost edit. One record per skillset:
 *
 *   localStorage["skillparse_files:<skillset>"] = {"<path under /sp>": [version, ...]}
 */

const PREFIX = 'skillparse_files:';

function read(sid) {
  try { return JSON.parse(localStorage.getItem(PREFIX + sid) || '{}') || {}; } catch { return {}; }
}

function write(sid, data) {
  try {
    localStorage.setItem(PREFIX + sid, JSON.stringify(data));
    return true;
  } catch {
    return false;       // full or blocked: the edit still applies to this session
  }
}

export function edited(sid) {
  return read(sid);
}

export function versions(sid, path) {
  return read(sid)[path] || [];
}

export function current(sid, path) {
  const v = versions(sid, path);
  return v.length ? v[v.length - 1].content : null;
}

export function addVersion(sid, path, content, note = '', source = 'manual') {
  const data = read(sid);
  data[path] = [...(data[path] || []), { at: new Date().toISOString(), content, note, source }];
  return write(sid, data);
}

export function forget(sid, path) {
  const data = read(sid);
  delete data[path];
  return write(sid, data);
}

export async function original(path) {
  const url = new URL(`../../data/skillparse/fs/${path}`, import.meta.url);
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.text();
}

/** Every edited file of a skillset as one JSON object {path: content}, for download. */
export function bundle(sid) {
  const out = {};
  for (const [path, vs] of Object.entries(read(sid))) {
    if (vs.length) out[path] = vs[vs.length - 1].content;
  }
  return out;
}
