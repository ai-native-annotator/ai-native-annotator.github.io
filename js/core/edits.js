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
 * 3. **The tree follows the edit.** An output is not only values, it is also
 *    shape: `<np: …>` placeholders in it are the slots still to expand. So
 *    every accepted edit re-derives the node's pending children from what was
 *    saved (`syncPendingChildren`) — a placeholder written by hand becomes a
 *    row to click, and a placeholder replaced by a real concept stops being
 *    one, because the annotator has just done that step themselves.
 *
 * Penman is the annotator's own notation, so it is the default editing
 * surface; JSON stays available for anything Penman cannot express.
 */

import { state, editKey } from './state.js';
import { parsePenman, toPenman } from './penman.js';
import { advanceSentence, makePendingMarker } from './pipeline.js';
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
  syncPendingChildren(node, path, sentenceIndex);
  logInfo('edits', t('edits.applied', { skill: node.skill, span: shorten(node.span) }));
  return key;
}

export function revertEdit(sentenceIndex, path, node) {
  const key = editKey(sentenceIndex, path);
  if (node.originalOutput !== undefined) {
    node.output = node.originalOutput;
    delete node.originalOutput;
    // The original answer lists slots that have since been resolved, so this
    // has to run too — otherwise reverting would put back a pending row for
    // work that is already done.
    syncPendingChildren(node, path, sentenceIndex);
  }
  state.edits.delete(key);
  logInfo('edits', t('edits.reverted', { skill: node.skill, span: shorten(node.span) }));
}

/**
 * Bring the node's children back in line with its output.
 *
 * An edit is not just a value change: adding `<np: the crowd>` to a relation
 * asks for one more step, and writing a real concept where a placeholder stood
 * says that step is no longer needed. Neither used to reach the tree — the
 * annotated pane kept drawing the shape the model had produced, and a slot the
 * annotator had filled in by hand still sat there marked 待运行. Worse, a
 * newly written placeholder vanished from the artifact entirely, because
 * graphNodeOf() takes expandable edges from `children` and there was no child
 * to take.
 *
 * The rule, and it is the whole rule: **the expandable slots are exactly the
 * `<>` placeholders in the output.** Anything else the annotator wrote counts
 * as annotated.
 *
 *   - a placeholder already answered by a child (pending or resolved) keeps
 *     that child — resolved work is never re-opened, and a pending row keeps
 *     its identity rather than being rebuilt under the annotator's cursor;
 *   - a placeholder nothing answers becomes a new pending row;
 *   - a pending row no placeholder asks for is dropped — the annotator either
 *     wrote the answer or deleted the slot;
 *   - resolved children are never removed here. They are recorded skill calls
 *     with their own rationale and their own subtree; deleting one from a text
 *     box would throw that away invisibly, so penmanToOutput reports the
 *     attempt instead (see `ignored`).
 *
 * Children with no role are left alone: they did not come from a relation
 * (the clause under a subordinating discourse node is the case that matters),
 * so relations have nothing to say about them.
 */
export function syncPendingChildren(node, path = [], sentenceIndex = state.selectedSentence) {
  const out = node?.output;
  if (!out || !Array.isArray(out.relations)) return { added: 0, filled: 0 };

  const wanted = [];
  for (const [role, value] of out.relations) {
    if (value && typeof value === 'object' && value.expand === true) {
      wanted.push({ role, kind: value.kind || 'np', phrase: String(value.phrase ?? '').trim(), sub: value.sub || null });
    }
  }

  const kids = node.children || [];
  const claimed = new Set();
  const claim = (child) => {
    let i = child.role ? wanted.findIndex((w, j) => !claimed.has(j) && w.role === child.role) : -1;
    // Re-labelling a slot is a rename, not a delete: match the phrase so the
    // row keeps its identity instead of being dropped and rebuilt.
    if (i === -1 && child.pending && child.phrase) {
      i = wanted.findIndex((w, j) => !claimed.has(j) && w.phrase === child.phrase);
    }
    if (i !== -1) claimed.add(i);
    return i;
  };

  const next = [];
  let filled = 0;
  for (const child of kids) {
    if (!child.pending) { claim(child); next.push(child); continue; }  // resolved: it fills its own slot
    if (!child.role) { next.push(child); continue; }                   // not a relation slot; not ours to judge
    const i = claim(child);
    if (i === -1) { filled++; continue; }
    const w = wanted[i];
    child.role = w.role;
    child.kind = w.kind;
    child.phrase = w.phrase;
    if (w.sub) child.sub = w.sub;
    next.push(child);
  }

  // Depth drives the pipeline's recursion limits, and a hand-written slot has
  // no marker to inherit it from — take a sibling's, else the tree position.
  const depth = kids.find((c) => c.pending && typeof c.depth === 'number')?.depth ?? path.length;
  let added = 0;
  wanted.forEach((w, j) => {
    if (claimed.has(j)) return;
    next.push(makePendingMarker({ kind: w.kind, phrase: w.phrase, role: w.role, depth, sub: w.sub }));
    added++;
  });

  node.children = next;
  if (added) logInfo('edits', t('edits.slotsAdded', { n: added }));
  if (filled) logInfo('edits', t('edits.slotsFilled', { n: filled }));
  // A slot opened or closed changes whether the sentence is finished, which is
  // what decides whether reentrancy/doc_level should be queued next.
  const sentence = state.doc?.sentences?.[sentenceIndex];
  if ((added || filled) && sentence?.tree) advanceSentence(sentence);
  return { added, filled };
}

const shorten = (s, n = 32) => (String(s ?? '').length > n ? String(s).slice(0, n) + '…' : String(s ?? ''));

/* ------------------------------------------------------- output <-> Penman */

/**
 * The node's own output as Penman. Edges to child *nodes* are rendered one
 * level deep so the annotator can see and re-label them, but their internals
 * are not expanded — a node's editor edits that node, not its whole subtree.
 * Content written inline in a relation is not a separate call and does render
 * whole, so nothing the annotator typed here disappears on the next save.
 *
 * Unresolved children (`{expand:true}`) render as `<np: the phrase>`, the same
 * placeholder the artifact uses, so a half-finished graph is still editable.
 */
export function outputToPenman(node) {
  const out = node?.output || {};
  const counter = { n: 0 };
  const nextVar = () => `x${++counter.n}`;
  const root = { var: out.id || nextVar(), concept: out.concept || 'thing', relations: [] };

  // Children are the authority on expandable edges. `output.relations` keeps
  // the model's `{expand:true}` answer even after a slot has been resolved, so
  // rendering both lists drew every filled slot twice — once as a `<np: …>`
  // that was no longer pending and once as the node that had filled it. The
  // annotator then saw a placeholder for work already done, which is exactly
  // the confusion "only <> needs expanding" is meant to rule out.
  const kids = (node?.children || []).filter((c) => c.role);
  const taken = new Set();
  const claim = (role) => {
    const i = kids.findIndex((c, j) => !taken.has(j) && c.role === role);
    if (i !== -1) taken.add(i);
    return i;
  };

  for (const [role, value] of out.relations || []) {
    if (value && typeof value === 'object' && value.expand === true) {
      const i = claim(role);
      if (i !== -1) { root.relations.push([role, childStub(kids[i], nextVar)]); continue; }
    }
    root.relations.push([role, penmanValue(value, nextVar)]);
  }
  kids.forEach((child, j) => {
    if (!taken.has(j)) root.relations.push([child.role, childStub(child, nextVar)]);
  });
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
    // Inline content keeps its own relations: the annotator may have written a
    // whole sub-structure here, and flattening it to a bare concept would
    // silently delete the rest of it on the next save.
    if (value.concept) {
      return {
        var: value.id || nextVar(),
        concept: value.concept,
        relations: (value.relations || []).map(([r, v]) => [r, penmanValue(v, nextVar)]),
      };
    }
    return JSON.stringify(value);
  }
  return String(value);
}

function childStub(child, nextVar) {
  if (child.pending) return pendingToken(child.kind, child.phrase);
  if (child.ref) return String(child.ref);   // a reentrancy edge: just the variable
  const c = child.output || {};
  return { var: c.id || nextVar(), concept: c.concept || 'thing', relations: [] };
}

/**
 * Parse edited Penman back into an output object.
 *
 * Every edge in the edited text is one of four things, and the difference is
 * what makes an edit land where the annotator meant it:
 *
 *   `:role <np: phrase>`   an unexpanded slot — stays a slot
 *   `:role (x / concept)`  where a real child already answers that edge — the
 *                          child is a recorded skill call with its own subtree,
 *                          so only its ROLE is this editor's to change; a
 *                          rewritten concept is reported, not silently applied
 *   `:role (x / concept)`  where a *placeholder* stood — the annotator has done
 *                          that step by hand, so it becomes ordinary content
 *                          and the pending row goes away
 *   `:role value`          a constant
 *
 * A `<>` placeholder written *inside* hand-written content is kept and
 * rendered, but it does not become a clickable row: rows live in
 * `node.children`, and a value nested inside a relation has no place there.
 * Put the placeholder at the top level of the node you are editing to get a
 * row for it.
 *
 * Anything that could not be applied comes back in `ignored`, so the UI can
 * say so rather than pretend the edit landed whole.
 */
export function penmanToOutput(text, node) {
  const parsed = parsePenman(text);
  if (!parsed) return { error: t('edits.penmanParse') };

  const prev = node?.output || {};
  const kids = (node?.children || []).filter((c) => c.role);
  const out = { ...prev, concept: parsed.concept || prev.concept };
  const relations = [];
  const ignored = [];
  const claimed = new Set();
  const free = (i) => !claimed.has(i);

  for (const [role, value] of parsed.relations || []) {
    if (value && typeof value === 'object') {
      const idx = matchChild(kids, free, role, value.concept);
      if (idx === -1) {                       // new content the annotator wrote
        relations.push([role, inlineNode(value)]);
        continue;
      }
      claimed.add(idx);
      if (kids[idx].pending) {                // a slot answered by hand: done, not pending
        relations.push([role, inlineNode(value)]);
        continue;
      }
      kids[idx].pendingRole = role;           // applied by the caller, see applyChildRoles
      if (value.concept && kids[idx].output?.concept
          && value.concept !== kids[idx].output.concept) {
        ignored.push(t('edits.ignoredConcept', { role, concept: value.concept }));
      }
      continue;
    }

    const placeholder = PENDING.exec(String(value));
    if (placeholder) {
      const slot = { expand: true, kind: placeholder[1], phrase: placeholder[2] };
      // `sub` (extra roles a subordinating structure hands down) has no place
      // in the token, so carry it over from the value being replaced.
      const sub = subOf(prev, role);
      if (sub) slot.sub = sub;
      relations.push([role, slot]);
      continue;
    }

    // A bare variable naming a reentrancy child: that edge belongs to the
    // child, and adding it to relations too would draw it twice.
    const refIdx = kids.findIndex((c, i) => free(i) && c.ref && String(c.ref) === String(value));
    if (refIdx !== -1) { claimed.add(refIdx); kids[refIdx].pendingRole = role; continue; }

    relations.push([role, String(value)]);
  }

  // A resolved child nothing in the text answers to was deleted by hand. It is
  // its own skill call, so it is kept and the attempt reported. An unclaimed
  // *pending* child is a different matter — the slot is simply gone, and
  // syncPendingChildren drops the row.
  kids.forEach((c, i) => {
    if (!claimed.has(i) && !c.pending) ignored.push(t('edits.ignoredMissing', { role: c.role }));
  });

  out.relations = relations;
  return { output: out, ignored, childRoles: kids };
}

/**
 * Which child, if any, an edited `(x / concept)` edge refers to. Concept first
 * so a re-labelled edge still finds its node, then role so a re-named concept
 * still does, and only then a pending slot — a placeholder must not swallow an
 * edit meant for a real child.
 */
function matchChild(kids, free, role, concept) {
  let i = kids.findIndex((c, j) => free(j) && !c.pending && concept && c.output?.concept === concept);
  if (i !== -1) return i;
  i = kids.findIndex((c, j) => free(j) && !c.pending && c.role === role);
  if (i !== -1) return i;
  return kids.findIndex((c, j) => free(j) && c.pending && c.role === role);
}

/** A parsed Penman sub-node as orchestrator content (see the node schema). */
function inlineNode(parsedNode) {
  const relations = [];
  for (const [role, value] of parsedNode.relations || []) {
    if (value && typeof value === 'object') { relations.push([role, inlineNode(value)]); continue; }
    const placeholder = PENDING.exec(String(value));
    relations.push([role, placeholder
      ? { expand: true, kind: placeholder[1], phrase: placeholder[2] }
      : String(value)]);
  }
  return { concept: parsedNode.concept || 'thing', relations };
}

function subOf(prev, role) {
  const hit = (prev?.relations || []).find(([r, v]) =>
    r === role && v && typeof v === 'object' && v.expand === true && v.sub);
  return hit ? hit[1].sub : null;
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
