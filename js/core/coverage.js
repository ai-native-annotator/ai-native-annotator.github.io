/**
 * Coverage checking — "did this decomposition actually account for the source
 * text, or did a step quietly drop part of it?"
 *
 * Two metrics, deliberately kept separate:
 *
 *   looseCoverage()  — a faithful port of modular-parsing's
 *                      graph.coverage_report(), so numbers here are
 *                      comparable with the research pipeline's own reports.
 *                      It concatenates every concept/phrase/constant into one
 *                      blob, strips non-word characters, and substring-tests
 *                      each source token against it. That is *permissive*:
 *                      "the" is a substring of "telescope", so short tokens
 *                      pass almost unconditionally. Useful for comparison,
 *                      not for trusting.
 *
 *   strictCoverage() — token-level accounting with word boundaries, which is
 *                      what actually answers the question. Every source token
 *                      lands in exactly one of three buckets:
 *                        covered  — appears as a whole token in some node's
 *                                   `phrase`, or matches a concept's lemma
 *                        dropped  — a function word the skill files explicitly
 *                                   say to drop (articles, auxiliaries, 的/了…)
 *                        lost     — content word accounted for by nothing
 *                      Only `lost` is a real problem.
 *
 * The node schema is what makes this possible at all: it requires `phrase` to
 * copy the exact words from the input ("it is how the system verifies no text
 * is lost"). So a step that invents, paraphrases, or forgets a span shows up
 * here immediately.
 *
 * stepCoverage() applies the same accounting to ONE node against its own
 * children, which is what localises a failure to the step that caused it.
 */

/** Function words the skill files / language overlays explicitly say are not annotated. */
const DROPPABLE_EN = new Set([
  'a', 'an', 'the',                                  // articles (overlay: "articles are dropped")
  'be', 'am', 'is', 'are', 'was', 'were', 'been', 'being',
  'do', 'does', 'did', 'have', 'has', 'had',         // auxiliaries
  // modals: the overlay says these become :modstr / :modpred, not nodes
  'will', 'would', 'can', 'could', 'may', 'might', 'must', 'shall', 'should',
  'to',                                              // infinitival "to"
  // prepositions and conjunctions: these are absorbed by the *role name*
  // (":temporal", ":manner", …), so losing the preposition itself is not a
  // content loss — losing its object is, and that is still caught.
  'of', 'that', 'as', 'on', 'in', 'at', 'by', 'for', 'with', 'from', 'into',
  'over', 'under', 'after', 'before', 'during', 'while', 'and', 'or', 'but',
]);
const DROPPABLE_ZH = new Set([
  '的', '地', '得', '了', '着', '过', '之', '所', '来', '去',
]);

const PUNCT_RX = /^[\s.,!?;:"'()\[\]{}—–\-·，。！？；：、《》“”‘’（）]+$/;

export function isContentToken(tok) {
  const t = String(tok || '').trim();
  if (!t || PUNCT_RX.test(t)) return false;
  return /[\w一-鿿]/.test(t);
}

function normalize(tok) {
  return String(tok || '').toLowerCase().replace(/[^\w一-鿿]/g, '');
}

/**
 * Crude English stemmer — enough to match "launched" against concept
 * "launch-01". Also undoes the doubled final consonant English inserts before
 * -ed/-ing ("planned" → "plann" → "plan"), without which `plan-01` fails to
 * account for the word it obviously covers.
 */
function stem(word) {
  let w = normalize(word);
  for (const suf of ['ing', 'ed', 'es', 's', 'd']) {
    if (w.length > suf.length + 2 && w.endsWith(suf)) { w = w.slice(0, -suf.length); break; }
  }
  if (w.length > 3 && /([bdfglmnprt])\1$/.test(w)) w = w.slice(0, -1);
  return w;
}

/**
 * Surface forms a token may legitimately have been *normalised into* by the
 * annotation rather than copied verbatim. The special-entity skill turns
 * "30 August 2026" into `:month 8`, so the word "August" is correctly
 * accounted for by the number 8 and must not count as lost.
 */
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july',
  'august', 'september', 'october', 'november', 'december'];
function normalisedEquivalents(tok) {
  const n = normalize(tok);
  const out = [];
  const mi = MONTHS.indexOf(n);
  if (mi >= 0) out.push(String(mi + 1));
  return out;
}

/**
 * Derivational match: a concept is very often the verb behind a nominalised
 * token ("separation" ← `separate-01`, "commissioning" ← `commission-01`),
 * which inflectional stemming alone will not catch.
 *
 * Rule: the shared prefix must be at least 5 characters AND cover at least
 * 70% of the shorter word. That accepts separation/separate (7 of 8 = 88%)
 * while rejecting communication/commissioning (shared "commi" = 5, but only
 * 38% of the shorter word), which a bare prefix test would wrongly merge.
 */
function sharesDerivation(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const shorter = Math.min(a.length, b.length);
  return i >= 5 && i / shorter >= 0.7;
}

/** A concept like "launch-01" or "date-entity" contributes its lemma part(s). */
function conceptSurfaces(concept) {
  const c = String(concept || '');
  if (!c) return [];
  const withoutSense = c.replace(/-\d+$/, '');
  return withoutSense.split(/[-_]/).filter(Boolean);
}

export function tokenize(text, language) {
  const s = String(text || '');
  if (language === 'zh' && !/\s/.test(s)) return [...s];
  return s.split(/\s+/).filter(Boolean);
}

/* --------------------------------------------------- walking a live tree */

/**
 * What a set of nodes *accounts for*.
 *
 * The critical rule: a resolved node's own `span`/`phrase` is the text it was
 * HANDED, not evidence that it did anything with it. Counting it would make
 * every check vacuously 100% (the first version of this file did exactly
 * that, and happily reported full coverage on a decomposition that had thrown
 * away two whole modifiers). So evidence is only:
 *
 *   - `concept` lemmas   — the meaning the node actually captured
 *   - constants          — quoted names, numbers, attribute values it emitted
 *   - phrases of PENDING leaves — text explicitly handed on to a later step
 *     (not lost, just not expanded yet)
 *
 * A resolved child contributes its own concept/constants recursively, never
 * its span.
 */
export function accountedStrings(nodes, { includePending = true } = {}) {
  const phrases = [];
  const concepts = [];
  const constants = [];

  const visitOutput = (out) => {
    if (!out || typeof out !== 'object') return;
    if (out.concept) concepts.push(String(out.concept));
    for (const rel of out.relations || []) {
      if (!Array.isArray(rel) || rel.length < 2) continue;
      const val = rel[1];
      if (val && typeof val === 'object') {
        // NOTE: deliberately does NOT harvest `expand:true` phrases from
        // relations. `output.relations` keeps the model's ORIGINAL answer
        // forever, so a slot that has since been resolved still looks pending
        // here — crediting it would hand coverage to text merely for having
        // been *listed as a to-do*, not for being analysed. Pending state is
        // read from `children` in walk(), which is the live truth.
        if (val.expand !== true && !val.ref) visitOutput(val); // inline nested node is real output
      } else if (val !== undefined && val !== null) {
        constants.push(String(val));
      }
    }
  };

  const walk = (list) => {
    for (const n of list || []) {
      if (n.pending) { if (includePending && n.phrase) phrases.push(String(n.phrase)); continue; }
      if (n.ref) continue;                       // reentrancy pointer: no new text
      visitOutput(n.output);
      walk(n.children);
    }
  };
  walk(nodes);
  return { phrases, concepts, constants };
}

/* ------------------------------------------------------------- the metrics */

/**
 * Evidence for the LOOSE metric only. This one deliberately DOES include each
 * node's own `phrase`, because the Python `coverage_report()` does
 * (`mentioned.append(str(n.get("phrase","")))`) and its whole number depends
 * on it. Keep it separate from accountedStrings(): sharing the strict
 * collector here silently turned this into a different, far harsher metric
 * that was being labelled "the backend's number" while not being it.
 */
function looseEvidence(nodes) {
  const out = [];
  const visitOutput = (o) => {
    if (!o || typeof o !== 'object') return;
    if (o.concept) out.push(String(o.concept));
    if (o.phrase) out.push(String(o.phrase));
    for (const rel of o.relations || []) {
      if (!Array.isArray(rel) || rel.length < 2) continue;
      const val = rel[1];
      if (val && typeof val === 'object') { if (!val.ref) visitOutput(val); }
      else if (val !== undefined && val !== null) out.push(String(val));
    }
  };
  const walk = (list) => {
    for (const n of list || []) {
      if (n.ref) continue;
      if (n.pending) { if (n.phrase) out.push(String(n.phrase)); continue; }
      if (n.span) out.push(String(n.span));
      visitOutput(n.output);
      walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

/** Faithful port of graph.coverage_report() — permissive on purpose; see file header. */
export function looseCoverage(nodes, tokens) {
  const blob = normalize(looseEvidence(nodes).join(' '));
  const content = tokens.filter(isContentToken);
  const missing = content.filter((tok) => {
    const key = normalize(tok);
    return key && !blob.includes(key);
  });
  return {
    ratio: 1 - missing.length / Math.max(1, content.length),
    missing,
    contentCount: content.length,
  };
}

/**
 * Token-level accounting with word boundaries. Returns every source token
 * sorted into covered / dropped (legitimately) / lost (a real gap).
 */
export function strictCoverage(nodes, tokens, language) {
  const { phrases, concepts, constants } = accountedStrings(nodes);
  const droppable = language === 'zh' ? DROPPABLE_ZH : DROPPABLE_EN;

  // Build a set of whole tokens the annotation accounts for.
  const covered = new Set();
  for (const p of [...phrases, ...constants]) {
    for (const t of tokenize(p, language)) {
      const n = normalize(t);
      if (n) { covered.add(n); covered.add(stem(n)); }
    }
  }
  const conceptStems = new Set();
  for (const c of concepts) {
    for (const surf of conceptSurfaces(c)) { conceptStems.add(normalize(surf)); conceptStems.add(stem(surf)); }
  }

  const conceptList = [...conceptStems];
  const isAccounted = (raw) => {
    const n = normalize(raw);
    if (!n) return true;
    if (covered.has(n) || covered.has(stem(n))) return true;
    if (conceptStems.has(n) || conceptStems.has(stem(n))) return true;
    // nominalisation / derivation: "separation" is accounted for by `separate-01`
    if (conceptList.some((c) => sharesDerivation(stem(n), c) || sharesDerivation(n, c))) return true;
    // normalised into another surface: "August" -> `:month 8`
    if (normalisedEquivalents(raw).some((e) => covered.has(e))) return true;
    return false;
  };

  const content = tokens.filter(isContentToken);
  const result = { covered: [], dropped: [], lost: [] };
  for (const tok of content) {
    const n = normalize(tok);
    if (!n) continue;
    if (isAccounted(tok)) { result.covered.push(tok); continue; }
    // hyphenated compound: "90-day" is correctly split into `:quant 90` +
    // `:unit (day)`, so it counts as covered when every part is accounted for
    const parts = String(tok).split(/[-–—]/).filter((p) => normalize(p));
    if (parts.length > 1 && parts.every((p) => isAccounted(p) || droppable.has(normalize(p)))) {
      result.covered.push(tok); continue;
    }
    if (droppable.has(n)) { result.dropped.push(tok); continue; }
    result.lost.push(tok);
  }
  const denom = Math.max(1, result.covered.length + result.lost.length);
  return {
    ...result,
    ratio: result.covered.length / denom,   // legitimately-dropped words are excluded from the denominator
    contentCount: content.length,
  };
}

/**
 * Local check for ONE decomposition step: does what this node produced
 * account for the span this node was handed?
 *
 * This is the diagnostic that localises a loss — a sentence-level number tells
 * you something went missing, this tells you which call dropped it.
 */
export function stepCoverage(node, language) {
  if (!node || node.pending || node.ref) return null;
  const span = node.span || node.output?.phrase || '';
  if (!span) return null;
  // Only nodes that actually decompose into parts are meaningful to check;
  // a leaf ('(stop)') covers its span by definition.
  const tokens = tokenize(span, language);
  const self = { ...node, children: node.children || [] };
  const res = strictCoverage([self], tokens, language);
  return {
    span,
    ratio: res.ratio,
    lost: res.lost,
    dropped: res.dropped,
    coveredCount: res.covered.length,
    contentCount: res.contentCount,
  };
}

/** Sentence-level report + the per-step breakdown, for the back-check panel. */
export function sentenceCoverage(sentence, language) {
  const tokens = sentence.tokens?.length ? sentence.tokens : tokenize(sentence.text, language);
  const strict = strictCoverage(sentence.tree || [], tokens, language);
  const loose = looseCoverage(sentence.tree || [], tokens);

  const steps = [];
  const walk = (nodes, path = []) => {
    for (let i = 0; i < (nodes || []).length; i++) {
      const n = nodes[i];
      if (n.pending || n.ref) continue;
      const hasParts = (n.children || []).some((c) => c.pending || c.role);
      if (hasParts) {
        const sc = stepCoverage(n, language);
        if (sc) steps.push({ ...sc, skill: n.skill, path: [...path, i] });
      }
      walk(n.children, [...path, i]);
    }
  };
  walk(sentence.tree || []);

  return {
    strict, loose, steps,
    worstSteps: steps.filter((s) => s.lost.length).sort((a, b) => b.lost.length - a.lost.length),
  };
}
