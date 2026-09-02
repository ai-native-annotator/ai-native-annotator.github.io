/**
 * Which annotation belongs to which method.
 *
 * A document is text: sentences, tokens, an id, a language. How you annotate it
 * is a separate choice — build the graph bottom-up one skill call at a time
 * (formats/umr.js), refine a whole draft pass by pass (formats/refine.js), or
 * label it flat (formats/sentiment.js). Nothing about a sentence says which of
 * those you must use, so an imported file must not arrive welded to one.
 *
 * It used to be welded. `parseDocument` stamped the active format onto the
 * document, importing a sample forced 'umr' first, and the format picker
 * responded by *switching to a different document* that matched the format you
 * picked — so choosing a method threw away the text you were working on.
 *
 * What made that hard to undo is that the three methods write to the same
 * sentence: `tree` for the recursive and flat ones, `passes` + `graph` for the
 * chained one, `annotation` for flat output. Switching method in place would
 * have overwritten whatever the last one produced. So the annotation fields are
 * parked per format here, and the sentence carries only whichever set is
 * currently in view. Switch to refine and your skill tree is not gone, it is
 * parked; switch back and it is exactly as you left it, down to which rows were
 * still waiting to run.
 *
 * `doc.format` therefore stops meaning "this document is a UMR document" and
 * starts meaning "the annotation shipped inside this file was made this way" —
 * a fact about the recording, not a restriction on the text.
 */

import { state } from './state.js';

/**
 * The per-sentence fields that ARE the annotation. Everything else on a
 * sentence (text, tokens, index) is the document and stays put.
 */
const WORK_FIELDS = ['tree', 'passes', 'graph', 'docAnnotation', 'annotation', '_idSeq', '_docRegistry'];

const blank = () => ({
  tree: [], passes: [], graph: '', docAnnotation: '', annotation: {},
  _idSeq: 0, _docRegistry: null,
});

const snapshot = (s) => Object.fromEntries(WORK_FIELDS.map((k) => [k, s[k]]));

/**
 * State keyed by tree path — a human edit at `s0:1`, the argument thread about
 * that node, the proposals it produced. Paths repeat across formats (`[1]` is
 * a node in both umr and sentiment), so these belong to a method exactly as
 * much as the tree does. Kept out of the document so exported JSON stays plain
 * data: `state.edits` is a Map, and a Map inside an exported document would
 * quietly serialise to `{}`.
 */
let side = new Map();

/**
 * Park the annotation a freshly-loaded document arrived with under its own
 * format, so that switching away from it does not overwrite the recording.
 */
export function initWork(doc) {
  side = new Map();
  const recorded = doc?.format || null;
  for (const s of doc?.sentences || []) {
    s._work = s._work || {};
    if (recorded && !s._work[recorded]) s._work[recorded] = snapshot(s);
  }
}

/** Put the work currently in view away under `formatId`. */
export function stashWork(doc, formatId) {
  if (!doc || !formatId) return;
  for (const s of doc.sentences || []) {
    s._work = s._work || {};
    s._work[formatId] = snapshot(s);
  }
  side.set(formatId, { edits: state.edits, chats: state.chats, proposals: state.proposals });
}

/**
 * Bring `formatId`'s work back into view, or start it fresh if this document
 * has never been annotated that way. `seedSentence` is the format's own
 * opening move — for umr, the first pending row to click.
 */
export function restoreWork(doc, formatId, format) {
  if (!doc) return;
  for (const s of doc.sentences || []) {
    // A fresh blank PER SENTENCE. Sharing one would hand every sentence the
    // same `tree` array, so annotating sentence 1 would silently annotate all
    // of them — and the second sentence would open showing the first's work.
    const slot = blank();
    const stored = s._work?.[formatId];
    if (stored) for (const k of WORK_FIELDS) if (stored[k] !== undefined) slot[k] = stored[k];
    for (const k of WORK_FIELDS) s[k] = slot[k];
    format?.seedSentence?.(s);
  }
  const kept = side.get(formatId);
  state.edits = kept?.edits || new Map();
  state.chats = kept?.chats || {};
  state.proposals = kept?.proposals || [];
}

/** Has this document been annotated with `formatId` at all? */
export function hasWork(doc, formatId) {
  return (doc?.sentences || []).some((s) => {
    const w = s._work?.[formatId];
    if (!w) return false;
    return Boolean(w.tree?.length || w.passes?.length || w.graph
      || Object.keys(w.annotation || {}).length);
  });
}

/**
 * Every format this document has work for, so the picker can say which methods
 * have something behind them rather than making the annotator click to find out.
 */
export function workedFormats(doc) {
  const ids = new Set();
  for (const s of doc?.sentences || []) for (const id of Object.keys(s._work || {})) ids.add(id);
  return [...ids].filter((id) => hasWork(doc, id));
}
