/* global importScripts, loadPyodide */
/**
 * The Python side of index.html, in a Web Worker.
 *
 * Loads Pyodide, writes SkillParseUMR's files (data/skillparse/MANIFEST.json) into its
 * file system under /sp, unpacks the vendored jieba and penman, and answers
 * {id, method, args} messages by calling sp_bridge.call(method, json). The skills run
 * here exactly as they run from the command line; nothing in the page evaluates them.
 *
 * A classic worker on purpose: pyodide.js is a classic script (importScripts).
 */

const PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';
let call = null;

function progress(text) {
  postMessage({ type: 'progress', text });
}

async function fetchOk(url, as = 'text') {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return as === 'buffer' ? res.arrayBuffer() : res.text();
}

async function boot(base) {
  progress('loading Python (Pyodide) …');
  importScripts(`${PYODIDE}pyodide.js`);
  const py = await loadPyodide({ indexURL: PYODIDE });
  progress('loading PyYAML …');
  await py.loadPackage(['pyyaml']);

  const root = `${base}data/skillparse/`;
  const manifest = JSON.parse(await fetchOk(`${root}MANIFEST.json`));
  progress(`copying ${manifest.files.length} skill files …`);
  const texts = await Promise.all(manifest.files.map((f) => fetchOk(root + f)));
  manifest.files.forEach((f, k) => {
    const dest = f.startsWith('fs/') ? `/sp/${f.slice(3)}` : `/sp/${f}`;
    py.FS.mkdirTree(dest.slice(0, dest.lastIndexOf('/')));
    py.FS.writeFile(dest, texts[k]);
  });

  progress('unpacking jieba and penman …');
  py.FS.mkdirTree('/sp/vendor');
  for (const v of manifest.vendor) {
    const buf = await fetchOk(root + v, 'buffer');
    py.unpackArchive(buf, 'zip', { extractDir: '/sp/vendor' });
  }

  progress('starting the skills …');
  py.runPython('import sys; sys.path.insert(0, "/sp/bridge")');
  const mod = py.pyimport('sp_bridge');
  call = (method, args) => JSON.parse(mod.call(method, JSON.stringify(args || {})));
  const res = call('boot', {});
  if (res.error) throw new Error(res.error);
  return { ...res.ok, pyodide: py.version };
}

self.onmessage = async ({ data }) => {
  const { id, method, args } = data;
  try {
    if (method === '__boot') {
      postMessage({ id, ok: await boot(args.base) });
      return;
    }
    if (!call) throw new Error('Python is not loaded yet');
    const res = call(method, args);
    postMessage({ id, ...res });
  } catch (err) {
    postMessage({ id, error: err?.message || String(err), trace: err?.stack || '' });
  }
};
