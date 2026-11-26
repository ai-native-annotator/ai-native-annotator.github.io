/**
 * GitHub as the place where a document's annotations are kept and moderated. Every call goes from
 * this browser straight to api.github.com with the person's own token (kept in localStorage with
 * the other keys, sent nowhere else):
 *
 *   an annotator   opens a .txt or .umr file of a repository, annotates it here, and submits the
 *                  .umr as a pull request from a branch of their own (a fork, without write access)
 *   a moderator    lists the open pull requests that annotate the same file, compares them
 *                  (mode-moderate.js), and merges the version they decide on into the base branch
 *
 * A source file `docs/a.txt` is annotated as `docs/a.umr`; a `.umr` source is annotated in place.
 * A pull request made here carries MARK with the file's path in its description, which is how the
 * moderator's list finds it (a pull request made by hand is found by the file it changes).
 */

import { readJson, writeJson } from './local.js';

const API = 'https://api.github.com';
const SECRETS = 'annotator_secrets';
const SOURCES = 'skillparse_github_docs';
const MARK = 'skillparse-annotation';

export const token = () => readJson(SECRETS).github || '';
export function saveToken(value) {
  const s = readJson(SECRETS);
  s.github = String(value || '').trim();
  writeJson(SECRETS, s);
}

/** Where a document of this browser came from: {owner, repo, base, path} (docSource(id, value) keeps it). */
export function docSource(id, value) {
  const all = readJson(SOURCES);
  if (value === undefined) return all[id] || null;
  if (value) all[id] = value; else delete all[id];
  writeJson(SOURCES, all);
  return value;
}

/** "owner/name", or a github.com address of the repository or of a file in it: {owner, repo, base?, path?}. */
export function parseRepo(text) {
  const s = String(text || '').trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/, '');
  const m = /^([\w.-]+)\/([\w.-]+)(?:\/(?:blob|tree)\/([^/]+)(?:\/(.+))?)?\/?$/.exec(s);
  return m ? { owner: m[1], repo: m[2], ...(m[3] ? { base: m[3] } : {}), ...(m[4] ? { path: decodeURIComponent(m[4]) } : {}) } : null;
}

/** The file an annotation of `path` is written to. */
export const umrPath = (path) => (/\.umr$/i.test(path) ? path : path.replace(/\.[^./]+$/, '') + '.umr');
const slug = (path) => path.replace(/\.[^./]+$/, '').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(-60) || 'document';
const enc = (path) => path.split('/').map(encodeURIComponent).join('/');

function b64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export async function gh(path, { method = 'GET', body, raw = false, okStatus = [] } = {}) {
  if (!token()) throw Object.assign(new Error('GitHub: no token (⚙ Settings)'), { status: 401 });
  const res = await fetch(path.startsWith('http') ? path : API + path, {
    method,
    headers: {
      Authorization: `Bearer ${token()}`,
      Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (okStatus.includes(res.status)) return null;
  if (!res.ok) {
    let msg = '';
    try { const j = await res.json(); msg = [j.message, ...(j.errors || []).map((e) => e.message || e.code)].filter(Boolean).join('; '); } catch { /* no body */ }
    throw Object.assign(new Error(`GitHub ${res.status}: ${msg || res.statusText || method + ' ' + path}`), { status: res.status });
  }
  if (res.status === 204) return null;
  return raw ? res.text() : res.json();
}

let me = null;
/** The token's user (asked once per token). */
export async function whoami() {
  if (me?.token !== token()) me = { token: token(), user: await gh('/user') };
  return me.user;
}

export const repoInfo = ({ owner, repo }) => gh(`/repos/${owner}/${repo}`);

/** The .txt and .umr files of a branch. */
export async function listFiles({ owner, repo, base }) {
  const tree = await gh(`/repos/${owner}/${repo}/git/trees/${encodeURIComponent(base)}?recursive=1`);
  return (tree.tree || []).filter((f) => f.type === 'blob' && /\.(txt|umr)$/i.test(f.path)).map((f) => f.path).sort();
}

/** A file's text at a branch or commit, or null when there is none. */
export const fileText = ({ owner, repo }, path, ref) =>
  gh(`/repos/${owner}/${repo}/contents/${enc(path)}?ref=${encodeURIComponent(ref)}`, { raw: true, okStatus: [404] });

const fileSha = async ({ owner, repo }, path, ref) =>
  (await gh(`/repos/${owner}/${repo}/contents/${enc(path)}?ref=${encodeURIComponent(ref)}`, { okStatus: [404] }))?.sha;

const headSha = async ({ owner, repo }, branch) =>
  (await gh(`/repos/${owner}/${repo}/git/ref/heads/${enc(branch)}`, { okStatus: [404] }))?.object?.sha;

/** `text` written to `path` on `branch` (made from the base branch when it is not there), as one commit. */
async function commitFile(where, { branch, from, path, text, message }) {
  if (!(await headSha(where, branch))) {
    await gh(`/repos/${where.owner}/${where.repo}/git/refs`, { method: 'POST', body: { ref: `refs/heads/${branch}`, sha: from } });
  }
  const sha = await fileSha(where, path, branch);
  return gh(`/repos/${where.owner}/${where.repo}/contents/${enc(path)}`, { method: 'PUT',
    body: { message, content: b64(text), branch, ...(sha ? { sha } : {}) } });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * An annotation submitted: the .umr written to the annotator's branch `annotate/<login>/<file>`
 * (in the repository itself with write access, else in their fork) and a pull request to the base
 * branch opened, or the one already open for that branch updated. onStep(text) says how far it is.
 * Returns {url, number, branch, updated}.
 */
export async function submitAnnotation(src, text, { title, note = '', onStep = () => {} } = {}) {
  const user = await whoami();
  const info = await repoInfo(src);
  const base = src.base || info.default_branch;
  const from = await headSha(src, base);
  if (!from) throw new Error(`GitHub: no branch ${base} in ${src.owner}/${src.repo}`);
  let where = src;
  if (!info.permissions?.push) {
    onStep('fork');
    where = { owner: user.login, repo: src.repo };
    await gh(`/repos/${src.owner}/${src.repo}/forks`, { method: 'POST', body: {} });
    for (let k = 0; k < 20 && !(await gh(`/repos/${where.owner}/${where.repo}`, { okStatus: [404] })); k++) await sleep(1500);
  }
  const branch = `annotate/${user.login}/${slug(src.path)}`;
  const path = umrPath(src.path);
  onStep('commit');
  await commitFile(where, { branch, from, path, text, message: `Annotate ${path}` });
  onStep('pull');
  const head = `${where.owner}:${branch}`;
  const open = await gh(`/repos/${src.owner}/${src.repo}/pulls?state=open&head=${encodeURIComponent(head)}&base=${encodeURIComponent(base)}`);
  if (open.length) return { url: open[0].html_url, number: open[0].number, branch, updated: true };
  const pr = await gh(`/repos/${src.owner}/${src.repo}/pulls`, { method: 'POST', body: {
    title: title || `Annotation of ${path} by ${user.login}`, head: where.owner === src.owner ? branch : head, base,
    body: `${note ? note + '\n\n' : ''}UMR annotation of \`${path}\`, made with the SkillParse workbench.\n\n<!-- ${MARK} path="${path}" -->`,
  } });
  return { url: pr.html_url, number: pr.number, branch, updated: false };
}

/**
 * The open pull requests to the base branch that annotate `path`: the ones made here (MARK), and
 * any other that changes the file. [{number, title, login, url, sha, repo: {owner, repo}, updated}]
 */
export async function annotationPulls(src) {
  const base = src.base || (await repoInfo(src)).default_branch;
  const path = umrPath(src.path);
  const pulls = await gh(`/repos/${src.owner}/${src.repo}/pulls?state=open&base=${encodeURIComponent(base)}&per_page=100`);
  const out = [];
  let looked = 0;
  for (const p of pulls) {
    const marked = (p.body || '').includes(`${MARK} path="${path}"`);
    if (!marked) {
      if ((p.body || '').includes(MARK) || looked++ >= 30) continue;       // another file's, or too many to look into
      const files = await gh(`/repos/${src.owner}/${src.repo}/pulls/${p.number}/files?per_page=100`);
      if (!files.some((f) => f.filename === path)) continue;
    }
    if (!p.head?.repo) continue;            // its fork is gone
    out.push({ number: p.number, title: p.title, login: p.user?.login || `#${p.number}`, url: p.html_url, sha: p.head.sha,
      repo: { owner: p.head.repo.owner.login, repo: p.head.repo.name }, updated: p.updated_at });
  }
  return out;
}

/**
 * The moderated version put on the base branch, all of it through git: a branch
 * `adjudicate/<file>-<time>` with the file, a pull request that says what was compared and what
 * was decided, merged; then (closeOthers) each annotator's pull request closed with a note that
 * names it. Returns {url, number, merged, closed: [numbers], problem}.
 */
export async function mergeModerated(src, text, { title, body, others = [], closeOthers = true, onStep = () => {} } = {}) {
  const info = await repoInfo(src);
  const base = src.base || info.default_branch;
  const from = await headSha(src, base);
  const path = umrPath(src.path);
  const branch = `adjudicate/${slug(src.path)}-${new Date().toISOString().replace(/[-:]|\..*$/g, '').replace('T', '-')}`;
  onStep('commit');
  await commitFile(src, { branch, from, path, text, message: `Adjudicated annotation of ${path}` });
  onStep('pull');
  const pr = await gh(`/repos/${src.owner}/${src.repo}/pulls`, { method: 'POST',
    body: { title: title || `Adjudicated annotation of ${path}`, head: branch, base, body } });
  const out = { url: pr.html_url, number: pr.number, merged: false, closed: [], problem: '' };
  onStep('merge');
  try {
    await gh(`/repos/${src.owner}/${src.repo}/pulls/${pr.number}/merge`, { method: 'PUT', body: { merge_method: 'squash' } });
    out.merged = true;
  } catch (err) {
    out.problem = err.message;             // a protected branch, a required review: it is merged on GitHub
    return out;
  }
  if (closeOthers) {
    onStep('close');
    for (const n of others) {
      try {
        await gh(`/repos/${src.owner}/${src.repo}/issues/${n}/comments`, { method: 'POST',
          body: { body: `Moderated together with the other annotations of \`${path}\`; the adjudicated version was merged in #${pr.number}.` } });
        await gh(`/repos/${src.owner}/${src.repo}/pulls/${n}`, { method: 'PATCH', body: { state: 'closed' } });
        out.closed.push(n);
      } catch (err) {
        out.problem = err.message;
      }
    }
  }
  return out;
}
