/**
 * Local document sources: bundled demo corpora, local files, and the
 * normalization pass every document goes through on load.
 *
 * `normalizeTree` does two jobs with one mechanism:
 *   1. For a brand-new / imported document (`tree: []` per sentence) it is a
 *      no-op — advanceSentence (pipeline.js) seeds the first pending slot.
 *   2. For a *recorded* document (the bundled demo corpora), it repairs a
 *      real bug in how those were exported: `scripts/build_web_demo.py` in
 *      the source repo only ever looked up a clause's children by matching
 *      the *whole sentence text*, so any sentence where `discourse` split
 *      the sentence into sub-clauses lost every call underneath it — the
 *      calls happened (callCount reflects them) but nothing downstream of
 *      `discourse` was ever written to the exported JSON. Rather than hide
 *      that gap, normalization turns every unresolved pending leaf still
 *      sitting in a resolved node's `output` (found by walking `relations`
 *      for `{expand:true, ...}` values with no matching child by phrase)
 *      into a *visible, clickable* pending row — live mode can then resolve
 *      it for real. See data/skills + core/pipeline.js for the live path.
 */

import { state, traceKey } from '../core/state.js';
import { logInfo, logWarn } from '../core/log.js';
import { download } from '../core/dom.js';
import { advanceSentence } from '../core/pipeline.js';
import { t } from '../core/i18n.js';
import { fetchAsset } from '../core/net.js';

const DEMO_BASE = 'data/demo';

export async function listDemos() {
  const res = await fetchAsset(`${DEMO_BASE}/index.json`);
  if (!res.ok) throw new Error(t('sources.noIndex'));
  return res.json();
}

export async function loadDemo(id) {
  const res = await fetchAsset(`${DEMO_BASE}/${id}.json`);
  if (!res.ok) throw new Error(t('sources.noDemo', { id }));
  const doc = await res.json();
  normalizeDoc(doc);
  return doc;
}

/** Read a user-picked local file into a document object. */
export function openLocalFile() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.umr,.txt';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return reject(new Error(t('sources.noFile')));
      file.text().then((text) => resolve(parseDocument(text, file.name))).catch(reject);
    };
    input.click();
  });
}

/**
 * Accept either our annotated JSON or a raw text/.umr file. A raw file
 * becomes an unannotated document — the left pane fills, the right pane is
 * empty until skills run, which is the normal starting state for new work
 * (this is exactly the shape a Google Drive import of a pre-annotation UMR
 * file produces too — see io/drive.js, which funnels through this same
 * function once the bytes are fetched).
 */
export function parseDocument(text, filename = 'untitled') {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) {
    const doc = JSON.parse(trimmed);
    if (!doc.sentences) throw new Error(t('sources.noSentences'));
    normalizeDoc(doc);
    return doc;
  }
  const lines = trimmed.split('\n').map((l) => l.trim()).filter(Boolean);
  const doc = {
    id: filename.replace(/\.[^.]+$/, ''),
    format: state.formatId,
    language: /[一-鿿]/.test(trimmed) ? 'zh' : 'en',
    provenance: `imported: ${filename}`,
    sentences: lines.map((line, i) => ({
      index: i + 1,
      text: line,
      tokens: tokenize(line),
      graph: '',
      docAnnotation: '',
      annotation: {},
      tree: [],
    })),
  };
  normalizeDoc(doc);
  logInfo('sources', t('sources.imported', { id: doc.id, n: doc.sentences.length }));
  return doc;
}

function tokenize(line) {
  if (/\s/.test(line)) return line.split(/\s+/).filter(Boolean);
  return /[一-鿿]/.test(line) ? [...line] : line.split(/\s+/);
}

/* --------------------------------------------------------- normalization */

function normalizeDoc(doc) {
  if (doc.format !== 'umr') {
    for (const s of doc.sentences || []) s.tree = s.tree || [];
    return;
  }
  for (const s of doc.sentences || []) {
    s.tree = s.tree || [];
    const before = countPending(s.tree) + countResolved(s.tree);
    repairNode({ children: s.tree }, 1);
    const gaps = fillMissingPending(s.tree);
    if (gaps) logWarn('sources', t('sources.repaired', { n: s.index, gaps }));
    advanceSentence(s);
  }
  doc._trace = buildTraceIndex(doc);
}

function countPending(nodes) { return (nodes || []).reduce((n, x) => n + (x.pending ? 1 : 0) + countPending(x.children), 0); }
function countResolved(nodes) { return (nodes || []).reduce((n, x) => n + (x.pending ? 0 : 1) + countResolved(x.children), 0); }

/** Recurse into already-resolved children so nested gaps are fixed too. */
function repairNode(node, depth) {
  for (const child of node.children || []) {
    if (!child.pending) repairNode(child, depth + 1);
  }
}

/**
 * For every resolved node, find pending-leaf-shaped values in its output
 * that have no matching child (matched by exact phrase text — robust to
 * whatever order the original export happened to preserve, if any) and
 * append a pending marker for them. Recurses through the whole tree,
 * including into the `discourse` node's `structure`. Returns how many gaps
 * were filled.
 */
function fillMissingPending(nodes, depth = 0) {
  let filled = 0;
  for (const node of nodes || []) {
    if (node.pending) continue;
    const existingPhrases = new Set((node.children || []).filter((c) => !c.pending)
      .map((c) => c.span).filter(Boolean));
    const pendingLeaves = leavesOf(node);
    node.children = node.children || [];
    for (const leaf of pendingLeaves) {
      const already = node.children.some((c) => c.pending ? c.phrase === leaf.phrase : c.span === leaf.phrase);
      if (already) continue;
      node.children.push({ pending: true, kind: leaf.kind || 'np', phrase: leaf.phrase,
        role: leaf.role || null, depth: depth + 1, sub: leaf.sub || null });
      filled++;
    }
    filled += fillMissingPending(node.children, depth + 1);
  }
  return filled;
}

function leavesOf(node) {
  const out = [];
  const scan = (val, role) => {
    if (val && typeof val === 'object' && val.expand === true) out.push({ ...val, role });
  };
  if (node.skill === 'discourse' && node.output?.has_discourse && node.output.structure) {
    const s = node.output.structure;
    if (s.expand === true) out.push({ ...s, role: null });
    else for (const [role, val] of s.relations || []) scan(val, role);
  } else {
    for (const [role, val] of node.output?.relations || []) scan(val, role);
  }
  return out;
}

/** Flat (skill, span) -> recorded call index, used by runner.js in replay mode. */
function buildTraceIndex(doc) {
  const idx = new Map();
  const walk = (nodes) => {
    for (const n of nodes || []) {
      if (!n.pending) {
        idx.set(traceKey(n.skill, n.span), { output: n.output, rationale: n.rationale, rawText: n.rawText, model: n.model });
        walk(n.children);
      }
    }
  };
  for (const s of doc.sentences || []) walk(s.tree);
  return idx;
}

/* ------------------------------------------------------------------ export */

/**
 * Export the working document with human edits folded in. Committing this
 * file on a branch (or pushing straight to GitHub — see ui/github-panel.js)
 * and merging is the intended collaboration path — the annotations are
 * plain JSON, so git diffs and merges them directly. See ui/iaa.js for a
 * guided version of that merge when two annotators diverge.
 */
export function exportDocument() {
  const doc = state.doc;
  if (!doc) return null;
  const out = structuredClone(stripTrace(doc));
  out.exportedAt = new Date().toISOString();
  out.humanEdits = [...state.edits.entries()].map(([path, output]) => ({ path, output }));
  out.skillProposals = state.proposals.map((p) => ({ skill: p.skill, text: p.text }));
  return out;
}

export function exportDocumentFile() {
  const doc = exportDocument();
  if (!doc) return false;
  download(`${doc.id}-annotated.json`, JSON.stringify(doc, null, 1));
  logInfo('sources', t('sources.exported', { id: doc.id }));
  return true;
}

function stripTrace(doc) {
  const { _trace, ...rest } = doc;
  return rest;
}
