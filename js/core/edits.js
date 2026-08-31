/**
 * Human edits to a skill call's output.
 *
 * Two things this module exists to guarantee:
 *
 * 1. **An accepted edit is immediately the annotation.** Edits used to live
 *    only in `state.edits`, which the assistant pane read but the artifact
 *    builder did not — so correcting a concept updated the little output box
 *    and nothing else. The finished graph in 「标注后文件」 still showed the
 *    model's original answer, which is the one thing that must never happen in
 *    an annotation tool: the annotator says "this is wrong", the tool agrees,
 *    and the file keeps the wrong value. `applyEdit` writes through onto
 *    `node.output`, so every downstream reader — Penman/JSON artifact, export,
 *    coverage back-check, the next skill's task input — sees the corrected
 *    value with no extra plumbing. `state.edits` stays as the *record* of what
 *    a human changed (for export, the ✎ flag, and the rationale clash).
 *
 * 2. **The edit is reversible.** The model's original answer is stashed on
 *    `node.originalOutput` the first time a node is edited, never overwritten
 *    after that, so revert always restores the real original rather than the
 *    previous edit.
 *
 * Penman is the annotator's own notation, so it is the default editing
 * surface; JSON stays available for anything Penman cannot express.
 */

import { state, editKey } from './state.js';
import { parsePenman, toPenman } from './penman.js';
import { logInfo, logWarn } from './log.js';
import { t } from './i18n.js';

/* ------------------------------------------------------------ apply/revert */

export function isEdited(sentenceIndex, path) {
  return state.edits.has(editKey(sentenceIndex, path));
}

export function editedOutput(sentenceIndex, path) {
  return state.edits.get(editKey(sentenceIndex, path));
}

/**
 * Accept a human correction. Returns the key it was stored under.
 * `node.output` becomes the corrected value, so the artifact is correct the
 * moment this returns and the caller only has to trigger a repaint.
 */
export function applyEdit(sentenceIndex, path, node, output) {
  const key = editKey(sentenceIndex, path);
  if (node.originalOutput === undefined) node.originalOutput = structuredClone(node.output);
  node.output = output;
  state.edits.set(key, output);
  logInfo('edits', t('edits.applied', { skill: node.skill, span: shorten(node.span) }));
  return key;
}

export function revertEdit(sentenceIndex, path, node) {
  const key = editKey(sentenceIndex, path);
  if (node.originalOutput !== undefined) {
    node.output = node.originalOutput;
    delete node.originalOutput;
  }
  state.edits.delete(key);
  logInfo('edits', t('edits.reverted', { skill: node.skill, span: shorten(node.span) }));
}

const shorten = (s, n = 32) => (String(s ?? '').length > n ? String(s).slice(0, n) + '…' : String(s ?? ''));

/* ------------------------------------------------------- output <-> Penman */

/**
 * The node's own output as Penman. Child edges are rendered one level deep so
 * the annotator can see and re-label them, but their internals are not
 * expanded — a node's editor edits that node, not its whole subtree.
 *
 * Unresolved children (`{expand:true}`) render as `<np: the phrase>`, the same
 * placeholder the artifact uses, so a half-finished graph is still editable.
 */
export function outputToPenman(node) {
  const out = node?.output || {};
  const counter = { n: 0 };
  const nextVar = () => `x${++counter.n}`;
  const root = { var: out.id || nextVar(), concept: out.concept || 'thing', relations: [] };

  for (const [role, value] of out.relations || []) {
    root.relations.push([role, penmanValue(value, nextVar)]);
  }
  for (const child of node?.children || []) {
    if (!child.role) continue;
    root.relations.push([child.role, childStub(child, nextVar)]);
  }
  return toPenman(root);
}

/**
 * Pending slots are quoted. Penman's tokenizer splits on whitespace, so a bare
 * <np: Edmund Pope> reads as three tokens and the phrase is destroyed on save —
 * the marker comes back as "<np:" and the annotator silently loses the slot.
 * Quoting keeps it one token, which readToken() already handles.
 */
const PENDING = /^"?<([a-z_]+):\s*([\s\S]*?)>"?$/;
const pendingToken = (kind, phrase) => `"<${kind || 'np'}: ${phrase || ''}>"`;

function penmanValue(value, nextVar) {
  if (value && typeof value === 'object') {
    if (value.expand === true) return pendingToken(value.kind, value.phrase);
    if (value.ref) return String(value.ref);
    if (value.concept) return { var: value.id || nextVar(), concept: value.concept, relations: [] };
    return JSON.stringify(value);
  }
  return String(value);
}

function childStub(child, nextVar) {
  if (child.pending) return pendingToken(child.kind, child.phrase);
  const c = child.output || {};
  return { var: c.id || nextVar(), concept: c.concept || 'thing', relations: [] };
}

/**
 * Parse edited Penman back into an output object.
 *
 * Deliberately conservative and *explicit about it*: it updates this node's
 * concept, its constant relations, and the roles on its child edges. It does
 * not add or delete children, because children are real tree nodes with their
 * own recorded calls and rationales — deleting one from a text box would throw
 * that away invisibly. Anything it could not apply comes back in `ignored` so
 * the UI can say so instead of pretending the edit landed whole.
 */
export function penmanToOutput(text, node) {
  const parsed = parsePenman(text);
  if (!parsed) return { error: t('edits.penmanParse') };

  const prev = node?.output || {};
  const childRoles = (node?.children || []).filter((c) => c.role);
  const out = { ...prev, concept: parsed.concept || prev.concept };
  const relations = [];
  const ignored = [];
  const newChildRoles = [];

  for (const [role, value] of parsed.relations || []) {
    if (value && typeof value === 'object') {
      // a sub-node: this is a child edge, so only its role is ours to change
      newChildRoles.push({ role, concept: value.concept });
      continue;
    }
    const placeholder = PENDING.exec(String(value));
    if (placeholder) {
      relations.push([role, { expand: true, kind: placeholder[1], phrase: placeholder[2] }]);
      continue;
    }
    relations.push([role, String(value)]);
  }

  // re-label child edges by matching concepts; unmatched ones are reported
  const used = new Set();
  for (const { role, concept } of newChildRoles) {
    const idx = childRoles.findIndex((c, i) => !used.has(i)
      && (c.output?.concept === concept || c.pending));
    if (idx === -1) { ignored.push(t('edits.ignoredChild', { role, concept })); continue; }
    used.add(idx);
    childRoles[idx].pendingRole = role;   // applied by the caller, see applyChildRoles
  }
  for (let i = 0; i < childRoles.length; i++) {
    if (!used.has(i)) ignored.push(t('edits.ignoredMissing', { role: childRoles[i].role }));
  }

  out.relations = relations;
  return { output: out, ignored, childRoles };
}

/** Commit the role renames penmanToOutput staged, once the caller accepts. */
export function applyChildRoles(childRoles) {
  let n = 0;
  for (const child of childRoles || []) {
    if (child.pendingRole && child.pendingRole !== child.role) { child.role = child.pendingRole; n++; }
    delete child.pendingRole;
  }
  if (n) logWarn('edits', t('edits.rolesChanged', { n }));
  return n;
}
