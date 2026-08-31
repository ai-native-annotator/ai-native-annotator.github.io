/**
 * GitHub connector — browser-direct, no backend.
 *
 * Auth is a user-supplied Personal Access Token (fine-grained or classic,
 * `repo` scope), not an OAuth code exchange: GitHub's OAuth token endpoint
 * does not serve CORS, so a pure static site cannot complete that exchange
 * itself without a server holding a client secret. A PAT is the equivalent
 * of Drive's "bring your own OAuth client id" — a credential you mint
 * yourself on github.com/settings/tokens, scoped and revocable, that never
 * touches anything but api.github.com and this browser's localStorage.
 *
 * This module also carries the primitives the inter-annotator merge feature
 * (ui/iaa.js) needs: listing forks/branches, reading/writing annotation
 * files, and attempting a *real* git merge via GitHub's Merges API before
 * falling back to guided manual reconciliation.
 */

import { state, set } from '../core/state.js';
import { parseDocument } from './sources.js';
import { logInfo, logError, describeError } from '../core/log.js';
import { t as tr } from '../core/i18n.js';

const API = 'https://api.github.com';

function token() {
  return (state.github.token || '').trim();
}

async function gh(path, opts = {}) {
  const tok = token();
  if (!tok) throw new Error(tr('gh.notConnected'));
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      ...opts,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${tok}`,
        'x-github-api-version': '2022-11-28',
        ...(opts.body ? { 'content-type': 'application/json' } : {}),
        ...opts.headers,
      },
    });
  } catch (err) {
    throw new Error(tr('gh.netFail', { err: describeError(err) }));
  }
  if (res.status === 401) throw new Error(tr('gh.bad401'));
  if (res.status === 403) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`GitHub API 403: ${body.message || 'insufficient permission or rate limited'}`);
  }
  return res;
}

async function ghJson(path, opts) {
  const res = await gh(path, opts);
  if (!res.ok && res.status !== 404 && res.status !== 409) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`GitHub API ${res.status}：${body.message || res.statusText}`);
  }
  return { status: res.status, ok: res.ok, data: res.status === 204 ? null : await res.json().catch(() => null) };
}

/* ------------------------------------------------------------------ auth */

export async function connectGithub(tokenValue) {
  const previous = state.github.token;
  const candidate = tokenValue !== undefined ? tokenValue.trim() : previous;
  set({ github: { ...state.github, token: candidate } });
  logInfo('github', tr('gh.verifyingToken'));
  try {
    const { ok, data } = await ghJson('/user');
    if (!ok || !data?.login) throw new Error(tr('gh.verifyFailed'));
    set({ github: { ...state.github, user: data } });
    logInfo('github', tr('gh.connectedLog', { login: data.login }));
    return data;
  } catch (err) {
    // roll back: a failed verification must not leave a half-connected token
    // in state, or every later call (repo browsing, IAA) would silently use
    // a token that's already known to be bad.
    set({ github: { ...state.github, token: previous, user: null } });
    throw err;
  }
}

export function disconnectGithub() {
  set({ github: { token: '', user: null, owner: '', repo: '', branch: '' } });
}

export function isConnected() {
  return Boolean(state.github.user);
}

/* ---------------------------------------------------------------- browse */

export async function listForks(owner, repo) {
  const { ok, data } = await ghJson(`/repos/${owner}/${repo}/forks?per_page=100`);
  if (!ok || !Array.isArray(data)) throw new Error(tr('gh.forksFailed', { repo: `${owner}/${repo}`, err: data?.message || tr('gh.notAList') }));
  return data;
}

export async function getRepo(owner, repo) {
  const { ok, data } = await ghJson(`/repos/${owner}/${repo}`);
  if (!ok) throw new Error(tr('gh.repoMissing', { repo: `${owner}/${repo}` }));
  return data;
}

export async function listBranches(owner, repo) {
  const { ok, data } = await ghJson(`/repos/${owner}/${repo}/branches?per_page=100`);
  if (!ok || !Array.isArray(data)) throw new Error(tr('gh.branchesFailed', { repo: `${owner}/${repo}`, err: data?.message || tr('gh.notAList') }));
  return data;
}

/** List every network member (the origin repo + all its forks) in one call. */
export async function listNetwork(owner, repo) {
  const root = await getRepo(owner, repo).catch(() => null);
  const base = root?.fork ? root.parent : root;
  const origin = base || { owner: { login: owner }, name: repo, full_name: `${owner}/${repo}` };
  const forks = await listForks(origin.owner.login, origin.name);
  return { origin, forks };
}

export async function createPullRequest(owner, repo, { title, head, base, body }) {
  const { ok, data } = await ghJson(`/repos/${owner}/${repo}/pulls`, {
    method: 'POST', body: JSON.stringify({ title, head, base, body }),
  });
  if (!ok) throw new Error(tr('gh.prFailed', { err: data?.message || '' }));
  logInfo('github', tr('gh.prCreated', { n: data.number, url: data.html_url }));
  return data;
}

/* ------------------------------------------------------------- read/write */

export async function getFile(owner, repo, path, ref) {
  const q = ref ? `?ref=${encodeURIComponent(ref)}` : '';
  const { ok, status, data } = await ghJson(`/repos/${owner}/${repo}/contents/${encodePath(path)}${q}`);
  if (!ok) {
    if (status === 404) return null;
    throw new Error(tr('gh.readFailed', { repo: `${owner}/${repo}`, path }));
  }
  const text = decodeBase64Utf8(data.content);
  return { text, sha: data.sha };
}

export async function importFromGithubFile(owner, repo, path, ref) {
  logInfo('github', tr('gh.readingLog', { repo: `${owner}/${repo}`, path, ref: ref || 'default' }));
  const file = await getFile(owner, repo, path, ref);
  if (!file) throw new Error(tr('gh.fileMissing', { repo: `${owner}/${repo}`, path }));
  return parseDocument(file.text, path.split('/').pop());
}

export async function putFile(owner, repo, path, content, message, branch, sha) {
  const body = {
    message, content: encodeBase64Utf8(content), branch,
    ...(sha ? { sha } : {}),
  };
  const { ok, data } = await ghJson(`/repos/${owner}/${repo}/contents/${encodePath(path)}`, {
    method: 'PUT', body: JSON.stringify(body),
  });
  if (!ok) throw new Error(tr('gh.writeFailed', { repo: `${owner}/${repo}`, path }));
  logInfo('github', tr('gh.committed', { repo: `${owner}/${repo}`, path, branch }));
  return data;
}

export async function createBranch(owner, repo, newBranch, fromBranch) {
  const { data: ref } = await ghJson(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(fromBranch)}`);
  if (!ref?.object?.sha) throw new Error(tr('gh.branchMissing', { branch: fromBranch }));
  const { ok, status, data } = await ghJson(`/repos/${owner}/${repo}/git/refs`, {
    method: 'POST', body: JSON.stringify({ ref: `refs/heads/${newBranch}`, sha: ref.object.sha }),
  });
  if (!ok && status !== 422) throw new Error(tr('gh.branchFailed', { branch: newBranch })); // 422 = already exists, fine
  logInfo('github', tr('gh.branchReady', { branch: newBranch }));
  return data;
}

/**
 * Attempt a real git merge via GitHub's Merges API (creates a merge commit
 * on `base` from `head`). 201 = merged, 204 = already up to date, 409 = real
 * conflict — the caller (ui/iaa.js) falls back to guided reconciliation only
 * on 409, exactly like `git merge` failing locally.
 */
export async function mergeBranches(owner, repo, base, head, commitMessage) {
  logInfo('github', tr('gh.merging', { head, base }));
  const { status, data } = await ghJson(`/repos/${owner}/${repo}/merges`, {
    method: 'POST', body: JSON.stringify({ base, head, commit_message: commitMessage }),
  });
  if (status === 201) { logInfo('github', tr('gh.mergeOk')); return { merged: true, alreadyUpToDate: false, commit: data }; }
  if (status === 204) { logInfo('github', tr('gh.mergeUpToDate', { base })); return { merged: true, alreadyUpToDate: true, commit: null }; }
  if (status === 409) { logError('github', tr('gh.mergeConflict', { head, base })); return { merged: false, conflict: true }; }
  throw new Error(tr('gh.mergeOdd', { status }));
}

function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

function decodeBase64Utf8(b64) {
  const bin = atob((b64 || '').replace(/\n/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

function encodeBase64Utf8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
