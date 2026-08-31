/**
 * Inter-annotator agreement, modeled as a git merge.
 *
 * Two annotators' work lives on two branches (or forks) of the same repo,
 * same file path. This pane:
 *   1. Attempts a *real* `git merge` via GitHub's Merges API first — for two
 *      independently-annotated JSON files this almost always reports a
 *      conflict (409), exactly like `git merge` would locally, because the
 *      same lines differ. That is expected, not an error.
 *   2. On conflict, walks both annotation trees node by node (matched by
 *      `skill::span`, a simplified alignment — not a full smatch/AnCast
 *      graph-matching algorithm) and renders each disagreement as a
 *      git-conflict block (<<<<<<< A / ======= / >>>>>>> B) the human
 *      adjudicator resolves by picking a side or editing directly.
 *   3. The resolved result is committed for real to a new branch, and a PR
 *      back to the base branch is offered — so "IAA" ends as an actual git
 *      artifact (branch + commit + optional PR), not just a report.
 *
 * Agreement stats (plain percentage, plus Cohen's kappa for single-label
 * flat formats like sentiment) are computed from the same comparison pass.
 */

import { el, labelledRow } from '../core/dom.js';
import { state } from '../core/state.js';
import {
  getFile, listBranches, mergeBranches, createBranch, putFile, createPullRequest, isConnected,
} from '../io/github.js';
import { parseDocument } from '../io/sources.js';
import { logInfo, logError, describeError } from '../core/log.js';
import { toast } from './toast.js';
import { t } from '../core/i18n.js';

export function openIaa(prefill = {}) {
  if (!isConnected()) {
    toast(t('iaa.needConnect'), true);
    return;
  }
  const overlay = el('div', { class: 'overlay', onclick: (e) => { if (e.target === overlay) close(); } });
  const close = () => overlay.remove();
  const body = el('div', { class: 'modal-body iaa-body' });
  overlay.append(el('div', { class: 'modal iaa-modal' },
    el('div', { class: 'modal-head' }, el('h3', {}, t('iaa.title')), el('button', { class: 'btn sm ghost', onclick: close }, t('common.close'))),
    body));
  document.body.append(overlay);
  renderSetup(body, prefill);
}

function renderSetup(body, prefill) {
  body.innerHTML = '';
  const { owner = '', repo = '' } = prefill;
  const repoInput = el('input', { class: 'settings-input', placeholder: 'owner/repo', value: owner && repo ? `${owner}/${repo}` : '' });
  const pathInput = el('input', { class: 'settings-input', placeholder: t('iaa.path'), value: prefill.path || 'annotated.json' });
  const branchA = el('select', { class: 'settings-input' });
  const branchB = el('select', { class: 'settings-input' });
  const status = el('span', { class: 'edit-status' });

  const loadBranches = async () => {
    const [o, r] = repoInput.value.trim().split('/');
    if (!o || !r) return;
    try {
      const branches = await listBranches(o, r);
      for (const sel of [branchA, branchB]) {
        sel.innerHTML = '';
        for (const b of branches) sel.append(el('option', { value: b.name }, b.name));
      }
      if (branches[1]) branchB.value = branches[1].name;
    } catch (err) { toast(describeError(err), true); }
  };
  if (owner && repo) loadBranches();
  repoInput.onchange = loadBranches;

  const compare = async () => {
    const [o, r] = repoInput.value.trim().split('/');
    const path = pathInput.value.trim();
    if (!o || !r || !path || !branchA.value || !branchB.value) { toast(t('iaa.needAll'), true); return; }
    status.textContent = t('iaa.reading'); status.className = 'edit-status';
    try {
      const [fileA, fileB] = await Promise.all([
        getFile(o, r, path, branchA.value), getFile(o, r, path, branchB.value),
      ]);
      if (!fileA || !fileB) throw new Error(t('iaa.fileMissing'));
      const docA = parseDocument(fileA.text, path);
      const docB = parseDocument(fileB.text, path);
      renderCompare(body, { owner: o, repo: r, path, branchA: branchA.value, branchB: branchB.value, docA, docB });
    } catch (err) {
      logError('iaa', `compare failed: ${describeError(err)}`, err);
      status.textContent = describeError(err); status.className = 'edit-status err';
    }
  };

  body.append(
    labelledRow(t('iaa.repo'), repoInput),
    labelledRow(t('iaa.path'), pathInput),
    labelledRow(t('iaa.branchA'), branchA),
    labelledRow(t('iaa.branchB'), branchB),
    el('div', { class: 'modal-actions' }, el('button', { class: 'btn', onclick: compare }, t('iaa.compare')), status),
    el('div', { class: 'hint' }, t('iaa.setupHint')),
  );
}

async function renderCompare(body, ctx) {
  body.innerHTML = t('iaa.merging');
  let mergeResult = null;
  try {
    mergeResult = await mergeBranches(ctx.owner, ctx.repo, ctx.branchA, ctx.branchB, `iaa: merge ${ctx.branchB} into ${ctx.branchA} for review`);
  } catch (err) {
    logError('iaa', `merge API failed: ${describeError(err)}`, err);
  }

  const resolutions = new Map();
  const { items, merged, stats } = diffDocs(ctx.docA, ctx.docB);
  const render = () => renderResult(body, ctx, mergeResult, items, resolutions, stats, () => render());
  render();
}

function nodeKey(n) { return `${n.skill}::${n.span}`; }

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (!a || !b || typeof a !== 'object') return false;
  const ak = Object.keys(a), bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  return ak.every((k) => deepEqual(a[k], b[k]));
}

/** One recursive pass: builds the flat comparison list and the (currently-resolved) merged tree together. */
function diffLevel(nodesA, nodesB, resolutions, path) {
  const byA = new Map((nodesA || []).filter((n) => !n.pending).map((n) => [nodeKey(n), n]));
  const byB = new Map((nodesB || []).filter((n) => !n.pending).map((n) => [nodeKey(n), n]));
  const keys = [...new Set([...byA.keys(), ...byB.keys()])];
  const items = [];
  const merged = [];
  let i = 0;
  for (const k of keys) {
    const a = byA.get(k), b = byB.get(k);
    const p = [...path, i++].join('.');
    const status = (!a || !b) ? 'structural' : (deepEqual(a.output, b.output) ? 'agree' : 'disagree');
    const rep = a || b;
    items.push({ pathKey: p, span: rep.span, skill: (a && b && a.skill !== b.skill) ? `${a.skill} / ${b.skill}` : rep.skill,
      status, outA: a?.output ?? null, outB: b?.output ?? null, hasA: Boolean(a), hasB: Boolean(b) });

    const choice = resolutions.get(p) || (status === 'agree' ? 'A' : null);
    let node = null;
    if (choice === 'B') node = b ? structuredClone(sanitize(b)) : null;
    else if (choice === 'skip') node = null;
    else if (choice && typeof choice === 'object') { node = structuredClone(sanitize(a || b)); node.output = choice; }
    else node = a ? structuredClone(sanitize(a)) : (b ? structuredClone(sanitize(b)) : null);

    if (node) {
      if (a && b && choice !== 'B') {
        const sub = diffLevel(a.children || [], b.children || [], resolutions, [...path, i - 1]);
        items.push(...sub.items);
        node.children = sub.merged;
      } else {
        node.children = (node.children || []).filter((c) => !c.pending);
      }
      merged.push(node);
    }
  }
  return { items, merged };
}

function sanitize(n) {
  const { pending, ...rest } = n;
  void pending;
  return rest;
}

function diffDocs(docA, docB) {
  const allItems = [];
  const mergedSentences = [];
  const n = Math.max(docA.sentences.length, docB.sentences.length);
  for (let i = 0; i < n; i++) {
    const sa = docA.sentences[i], sb = docB.sentences[i];
    const treeA = sa?.tree || [], treeB = sb?.tree || [];
    const { items, merged } = diffLevel(treeA, treeB, new Map(), [i]);
    allItems.push(...items.map((it) => ({ ...it, sentenceIndex: i, sentenceText: (sa || sb)?.text })));
    mergedSentences.push({ ...(sa || sb), tree: merged });
  }
  const comparable = allItems.filter((it) => it.status !== 'structural');
  const agree = comparable.filter((it) => it.status === 'agree').length;
  const structural = allItems.filter((it) => it.status === 'structural').length;
  const stats = {
    total: allItems.length, comparable: comparable.length, agree, structural,
    pct: comparable.length ? Math.round((agree / comparable.length) * 1000) / 10 : null,
    kappa: cohenKappa(docA, docB),
  };
  return { items: allItems, merged: mergedSentences, stats };
}

/** Cohen's kappa on the primary categorical field (polarity), when both docs have it — a bonus metric for flat formats. */
function cohenKappa(docA, docB) {
  const pairs = [];
  const n = Math.min(docA.sentences.length, docB.sentences.length);
  for (let i = 0; i < n; i++) {
    const pa = docA.sentences[i]?.annotation?.polarity;
    const pb = docB.sentences[i]?.annotation?.polarity;
    if (pa && pb) pairs.push([pa, pb]);
  }
  if (pairs.length < 2) return null;
  const cats = [...new Set(pairs.flat())];
  const countA = Object.fromEntries(cats.map((c) => [c, 0]));
  const countB = Object.fromEntries(cats.map((c) => [c, 0]));
  let po = 0;
  for (const [a, b] of pairs) { if (a === b) po++; countA[a]++; countB[b]++; }
  po /= pairs.length;
  let pe = 0;
  for (const c of cats) pe += (countA[c] / pairs.length) * (countB[c] / pairs.length);
  const denom = 1 - pe;
  return { value: denom === 0 ? 1 : Math.round(((po - pe) / denom) * 1000) / 1000, n: pairs.length };
}

function renderResult(body, ctx, mergeResult, items, resolutions, stats, rerender) {
  body.innerHTML = '';
  const disagreements = items.filter((it) => it.status !== 'agree');

  const mergeBanner = mergeResult?.merged
    ? el('div', { class: 'iaa-banner ok' }, t(mergeResult.alreadyUpToDate ? 'iaa.upToDate' : 'iaa.mergedClean',
        { head: ctx.branchB, base: ctx.branchA }))
    : el('div', { class: 'iaa-banner conflict' }, t('iaa.conflict', { head: ctx.branchB, base: ctx.branchA }));

  const statsBox = el('div', { class: 'iaa-stats' },
    stat(t('iaa.statComparable'), stats.comparable),
    stat(t('iaa.statAgree'), stats.agree),
    stat(t('iaa.statPct'), stats.pct !== null ? `${stats.pct}%` : '—'),
    stat(t('iaa.statStructural'), stats.structural),
    stats.kappa ? stat(t('iaa.statKappa'), `${stats.kappa.value} (n=${stats.kappa.n})`) : null,
  );

  const list = el('div', { class: 'iaa-list' });
  if (!disagreements.length) {
    list.append(el('div', { class: 'empty' }, t('iaa.noDisagreement')));
  }
  for (const it of disagreements) {
    list.append(conflictRow(it, resolutions, rerender, ctx));
  }

  const commitBtn = el('button', { class: 'btn', onclick: () => commitResolution(ctx, resolutions, status2) },
    t('iaa.commit'));
  const status2 = el('span', { class: 'edit-status' });

  body.append(
    mergeBanner, statsBox,
    el('div', { class: 'pane-subbar' }, el('span', { class: 'sub-label' }, t('iaa.disagreements', { n: disagreements.length }))),
    list,
    el('div', { class: 'modal-actions' }, commitBtn, status2),
  );
}

function stat(label, value) {
  return el('div', { class: 'iaa-stat' }, el('div', { class: 'iaa-stat-val' }, String(value)), el('div', { class: 'iaa-stat-label' }, label));
}

function conflictRow(it, resolutions, rerender, ctx) {
  const current = resolutions.get(it.pathKey) || (it.status === 'structural' ? (it.hasA ? 'A' : 'B') : null);
  const pick = (choice) => { resolutions.set(it.pathKey, choice); rerender(); };
  return el('div', { class: `iaa-conflict ${it.status}` },
    el('div', { class: 'iaa-conflict-head' },
      el('span', { class: 'skill-chip' }, it.skill),
      el('span', { class: 'node-title' }, truncate(it.span, 60)),
      it.status === 'structural' ? el('span', { class: 'muted sm' }, t(it.hasA ? 'iaa.onlyA' : 'iaa.onlyB')) : null),
    el('div', { class: 'conflict-block' },
      el('div', { class: `conflict-side${current === 'A' ? ' picked' : ''}` },
        el('div', { class: 'conflict-marker' }, `<<<<<<< A (${ctx.branchA})`),
        el('pre', { class: 'code sm' }, it.hasA ? JSON.stringify(it.outA, null, 2) : t('iaa.absent')),
        el('button', { class: 'btn xs', onclick: () => pick('A') }, t('iaa.takeA'))),
      el('div', { class: 'conflict-sep' }, '======='),
      el('div', { class: `conflict-side${current === 'B' ? ' picked' : ''}` },
        el('pre', { class: 'code sm' }, it.hasB ? JSON.stringify(it.outB, null, 2) : t('iaa.absent')),
        el('div', { class: 'conflict-marker' }, `>>>>>>> B (${ctx.branchB})`),
        el('button', { class: 'btn xs', onclick: () => pick('B') }, t('iaa.takeB')))),
    el('div', { class: 'conflict-actions' },
      el('button', { class: 'btn xs ghost', onclick: () => pick('skip') }, t('iaa.takeNeither')),
      current ? el('span', { class: 'muted sm' }, t('iaa.chosen', { choice: current === 'skip' ? t('iaa.deleted') : current }))
        : el('span', { class: 'muted sm warn' }, t('iaa.undecided'))));
}

function truncate(s, n) { return String(s ?? '').length > n ? String(s).slice(0, n) + '…' : String(s ?? ''); }

async function commitResolution(ctx, resolutions, status) {
  status.textContent = t('iaa.generating'); status.className = 'edit-status';
  try {
    const [fileA, fileB] = await Promise.all([
      getFile(ctx.owner, ctx.repo, ctx.path, ctx.branchA), getFile(ctx.owner, ctx.repo, ctx.path, ctx.branchB),
    ]);
    const docA = parseDocument(fileA.text, ctx.path);
    const docB = parseDocument(fileB.text, ctx.path);
    const mergedSentences = [];
    const n = Math.max(docA.sentences.length, docB.sentences.length);
    for (let i = 0; i < n; i++) {
      const sa = docA.sentences[i], sb = docB.sentences[i];
      const { merged } = diffLevel(sa?.tree || [], sb?.tree || [], resolutions, [i]);
      mergedSentences.push({ ...(sa || sb), tree: merged });
    }
    const mergedDoc = { ...docA, sentences: mergedSentences, iaa: {
      mergedFrom: [ctx.branchA, ctx.branchB], mergedAt: new Date().toISOString(),
    } };

    const targetBranch = `iaa/${ctx.path.replace(/[^a-z0-9]+/gi, '-')}-${Date.now()}`;
    logInfo('iaa', `creating resolution branch ${targetBranch}`);
    await createBranch(ctx.owner, ctx.repo, targetBranch, ctx.branchA);
    const existing = await getFile(ctx.owner, ctx.repo, ctx.path, targetBranch);
    await putFile(ctx.owner, ctx.repo, ctx.path, JSON.stringify(mergedDoc, null, 1),
      `iaa: reconcile ${ctx.branchA} + ${ctx.branchB}`, targetBranch, existing?.sha);

    status.innerHTML = '';
    status.append(t('iaa.committed', { branch: targetBranch }));
    const prBtn = el('button', { class: 'btn xs', onclick: async () => {
      try {
        const pr = await createPullRequest(ctx.owner, ctx.repo, {
          title: `IAA: reconcile ${ctx.branchA} + ${ctx.branchB} (${ctx.path})`,
          head: targetBranch, base: ctx.branchA,
          body: `Inter-annotator merge of \`${ctx.path}\` from \`${ctx.branchA}\` and \`${ctx.branchB}\`, resolved through the annotation tool's conflict UI.`,
        });
        status.append(` PR: ${pr.html_url}`);
      } catch (err) { toast(describeError(err), true); }
    } }, t('iaa.createPr'));
    status.append(prBtn);
    status.className = 'edit-status ok';
    toast(t('iaa.committedToast'));
  } catch (err) {
    logError('iaa', `commit failed: ${describeError(err)}`, err);
    status.textContent = describeError(err); status.className = 'edit-status err';
  }
}
