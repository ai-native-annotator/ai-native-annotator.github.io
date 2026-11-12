/**
 * Edited skill files, kept in this browser.
 *
 * Every save of a file is a version {at, content, note, source}; the last version is the one
 * the skills run with. The originals stay on the server (data/skillparse/), so "back to the
 * original" is a fetch, never a lost edit. One record per skillset:
 *
 *   localStorage["skillparse_files:<skillset>"] = {"<path under /sp>": [version, ...]}
 */

const PREFIX = 'skillparse_files:';

/** Where a file was before the skills were moved into one folder (versions saved then keep their place). */
const MOVED = [
  ['skillparseumr/web-procedures/', 'skills/'],
  ['skillparseumr/skillsets/tools/', 'skills/tools/'],
];
const moved = (path) => MOVED.reduce((p, [from, to]) => (p.startsWith(from) ? to + p.slice(from.length) : p), path);

function read(sid) {
  try {
    const data = JSON.parse(localStorage.getItem(PREFIX + sid) || '{}') || {};
    return Object.fromEntries(Object.entries(data).map(([path, vs]) => [moved(path), vs]));
  } catch {
    return {};
  }
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

const ROOT = new URL('../../data/skillparse/', import.meta.url);
let manifest = null;

async function fetchOk(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res;
}

/** A file as the site ships it; MANIFEST.json says which file holds a path of the Python file system. */
export async function original(path) {
  manifest ||= fetchOk(new URL('MANIFEST.json', ROOT)).then((res) => res.json());
  const src = (await manifest).files[path];
  if (!src) throw new Error(`${path}: not a file of the site`);
  return (await fetchOk(new URL(src, ROOT))).text();
}

/** Every edited file of a skillset as one JSON object {path: content}, for download. */
export function bundle(sid) {
  const out = {};
  for (const [path, vs] of Object.entries(read(sid))) {
    if (vs.length) out[path] = vs[vs.length - 1].content;
  }
  return out;
}
