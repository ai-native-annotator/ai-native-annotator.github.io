/**
 * A step's output as Penman: only concepts and relations (no spans, alignments or ids). A part
 * that a later step builds is written `<node: its text>`; a participant written outside the
 * piece, which a later step joins to the node it names, is `<outside: its text>`.
 *
 *   outputPenman(skill, output, input) -> string | null (null: show the JSON only)
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

export function outputPenman(skill, o, input = {}) {
  if (!o || typeof o !== 'object') return null;
  if ('relations' in o && Array.isArray(o.relations)) {
    const groups = [...new Set([...DOC_GROUPS, ...o.relations.map((r) => r.group)])];
    const parts = groups.map((gname) => {
      const rs = o.relations.filter((r) => r.group === gname);
      if (!rs.length) return null;
      const items = rs.map((r) => `(${r.source} ${role(r.relation)} ${r.target})`);
      const head = `${PAD}:${gname} (`;
      return `${head}${items.join(`\n${' '.repeat(head.length)}`)})`;
    }).filter(Boolean);
    return parts.length ? `(sentence\n${parts.join('\n')})` : '(sentence)';
  }
  if ('merges' in o && Array.isArray(o.merges)) {
    return o.merges.length ? o.merges.map((m) => `# ${m.node} = ${m.into}`).join('\n') : '# —';
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
