/**
 * A step's output as Penman: only concepts and relations (no spans, alignments or ids). A part
 * that a later step builds is written `<node: its text>`; a participant written outside the
 * piece, which a later step joins to the node it names, is `<outside: its text>`.
 *
 * The document step's relations name nodes as "<sentence>:<step id>[/var]" ("3:0.0/s3x"); they
 * are written `<node: words / concept>`, with `s2 ` before a node of an earlier sentence.
 *
 *   outputPenman(skill, output, input) -> string | null (null: show the JSON only)
 *   docNodes(input) -> [{ref, sentence, current, label}]: what a document step can point at
 */

const PAD = '    ';

function constant(v) {
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  const s = String(v);
  return /^[^\s()"/:]+$/.test(s) ? s : JSON.stringify(s);
}

const role = (r) => `:${String(r).replace(/^:/, '')}`;

/**
 * nodes [{var, concept}], edges [[src, role, tgt]], attrs [[var, role, value]];
 * refs: var -> `<node: …>` / `<outside: …>`; extra: [[src, role, text]] written as they are.
 */
function graphPenman({ nodes = [], edges = [], attrs = [] }, refs = new Map(), extra = []) {
  const concept = new Map(nodes.filter((n) => n?.var).map((n) => [n.var, n.concept ?? '?']));
  const seen = new Set();
  const lines = (v, depth) => {
    if (refs.has(v)) return refs.get(v);
    if (!concept.has(v)) return constant(v);
    if (seen.has(v)) return v;
    seen.add(v);
    const pad = PAD.repeat(depth + 1);
    const kids = [];
    for (const [s, r, t] of edges) if (s === v) kids.push(`${pad}${role(r)} ${lines(t, depth + 1)}`);
    for (const [s, r, t] of extra) if (s === v) kids.push(`${pad}${role(r)} ${t}`);
    for (const [s, r, t] of attrs) if (s === v) kids.push(`${pad}${role(r)} ${constant(t)}`);
    return `(${v} / ${concept.get(v)}${kids.length ? `\n${kids.join('\n')}` : ''})`;
  };
  // the first node is the top; anything it does not reach is written as a tree of its own
  const out = [];
  for (const n of nodes) if (n?.var && !seen.has(n.var)) out.push(lines(n.var, 0));
  return out.join('\n');
}

const node = (text) => `<node: ${String(text ?? '').trim() || '…'}>`;
const outside = (text) => `<outside: ${String(text ?? '').trim() || '…'}>`;

function fragment(o, extraAttrs = []) {
  const g = o.graph;
  if (!g || !Array.isArray(g.nodes) || !g.nodes.length) return null;
  const refs = new Map();
  for (const x of o.open || []) if (x?.var) refs.set(x.var, node(x.text));
  const extra = [];
  const top = g.nodes[0].var;
  for (const x of o.outside || []) {
    if (x?.var) refs.set(x.var, outside(x.text));
    // predicate's outside participants have a role and no variable: they hang on the event
    else if (x?.role) extra.push([top, x.role, outside(x.text)]);
  }
  const attrs = [...(g.attrs || []), ...extraAttrs.map(([r, v]) => [top, r, v])];
  return graphPenman({ nodes: g.nodes, edges: g.edges || [], attrs }, refs, extra);
}

/** predicate's aspect, modal strength and polarity, as the attributes of its event. */
function eventAttrs(o) {
  const out = [];
  if (o.aspect && o.aspect !== 'none') out.push(['aspect', o.aspect]);
  if (o.modstr) out.push(['modal-strength', o.modstr]);
  if (o.polarity === 'negative') out.push(['polarity', '-']);
  return out;
}

const DOC_GROUPS = ['temporal', 'modal', 'coref'];
const REF = /^(\d+):([^/\s]+)(?:\/(\S+))?$/;

const clip = (s, n = 16) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** The document step's input, indexed: sentence number -> {tokens, joiner, nodes by step id}. */
function docIndex(input = {}) {
  const sents = Array.isArray(input.sents) ? input.sents : [];
  const trees = Array.isArray(input.trees) ? input.trees : [];
  const by = new Map();
  sents.forEach((snt, k) => {
    const nodes = new Map((trees[k]?.nodes || []).filter((n) => n?.id != null).map((n) => [String(n.id), n]));
    const text = String(snt?.text ?? '');
    by.set(String(snt?.index), { tokens: snt?.tokenized_text || [], joiner: /\s/.test(text.trim()) ? ' ' : '', nodes });
  });
  return { by, current: sents.length ? String(sents[sents.length - 1]?.index) : null };
}

/** A graph node's words (its span, else its step's text) and concept. */
function nodeLabel(snt, step, v) {
  const g = step.graph?.nodes || [];
  const gn = g.find((x) => x?.var === v) || (v ? null : g[0]);
  const span = gn?.span;
  const words = Array.isArray(span) && span[0] >= 1 && span[1] >= span[0]
    ? snt.tokens.slice(span[0] - 1, span[1]).join(snt.joiner) : clip(String(step.input?.text ?? '').trim());
  const concept = gn?.concept ?? null;
  if (!concept) return words || step.id;
  return !words || words === concept ? String(concept) : `${words} / ${concept}`;
}

function refText(ref, idx) {
  const m = REF.exec(String(ref ?? ''));
  if (!m) return String(ref ?? '?');
  const snt = idx.by.get(m[1]);
  const step = snt?.nodes.get(m[2]);
  if (!step) return `<node: ? ${ref}>`;
  const where = m[1] === idx.current ? '' : `s${m[1]} `;
  return `<node: ${where}${nodeLabel(snt, step, m[3])}>`;
}

export function docNodes(input) {
  const idx = docIndex(input);
  const out = [];
  for (const [sentence, snt] of idx.by) {
    for (const step of snt.nodes.values()) {
      const g = step.graph?.nodes || [];
      g.forEach((gn, k) => {
        if (!gn?.var) return;
        out.push({ ref: k === 0 ? `${sentence}:${step.id}` : `${sentence}:${step.id}/${gn.var}`, sentence: Number(sentence),
          current: sentence === idx.current, label: nodeLabel(snt, step, gn.var) });
      });
    }
  }
  return out;
}

export function outputPenman(skill, o, input = {}) {
  if (!o || typeof o !== 'object') return null;
  if ('relations' in o && Array.isArray(o.relations)) {
    const idx = docIndex(input);
    const groups = [...new Set([...DOC_GROUPS, ...o.relations.map((r) => r.group)])];
    const parts = groups.map((gname) => {
      const rs = o.relations.filter((r) => r.group === gname);
      if (!rs.length) return null;
      const items = rs.map((r) => `(${refText(r.source, idx)} ${role(r.relation)} ${refText(r.target, idx)})`);
      const head = `${PAD}:${gname} (`;
      return `${head}${items.join(`\n${' '.repeat(head.length)}`)})`;
    }).filter(Boolean);
    return parts.length ? `(sentence\n${parts.join('\n')})` : '(sentence)';
  }
  if ('relation' in o && Array.isArray(o.parts)) {
    if (o.relation === 'none') return `${node(input.text)}\n# none: predicate takes the whole piece`;
    const kids = o.parts.map((x) => `${PAD}${role(x.role)} ${node(x.text)}`);
    return `(r / ${o.relation}${kids.length ? `\n${kids.join('\n')}` : ''})`;
  }
  if ('type' in o && o.type !== 'stop') return `# ${o.type} → ${node(input.text)}`;
  if (o.graph) return fragment(o, skill === 'predicate' ? eventAttrs(o) : []);
  if (Object.keys(o).length === 1 && Array.isArray(o.span)) return outside(input.text);
  return null;
}
