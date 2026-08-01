/**
 * Penman <-> JSON conversion, and JSON node-tree -> Penman for the live
 * pipeline's output (a node produced by the orchestrator uses the shared
 * node schema: {concept, relations:[[role,value]...], id?}).
 *
 * Node shape (parse result): {var, concept, relations: [[role, value], ...]}
 * where a value is either a nested node, {ref: "<var>"} for a reentrancy, or
 * a constant string.
 */

export function parsePenman(text) {
  const src = (text || '').trim();
  if (!src.startsWith('(')) return null;
  let i = 0;

  const skipWs = () => { while (i < src.length && /\s/.test(src[i])) i++; };

  const readToken = () => {
    skipWs();
    if (src[i] === '"') { // quoted constant, keep the quotes
      let j = i + 1;
      while (j < src.length && (src[j] !== '"' || src[j - 1] === '\\')) j++;
      const tok = src.slice(i, j + 1);
      i = j + 1;
      return tok;
    }
    const start = i;
    while (i < src.length && !/[\s()]/.test(src[i])) i++;
    return src.slice(start, i);
  };

  const parseNode = () => {
    skipWs();
    if (src[i] !== '(') return null;
    i++; // (
    const variable = readToken();
    skipWs();
    let concept = '';
    if (src[i] === '/') { i++; concept = readToken(); }
    const relations = [];
    for (;;) {
      skipWs();
      if (i >= src.length || src[i] === ')') { i++; break; }
      if (src[i] !== ':') { readToken(); continue; } // tolerate junk
      const role = readToken();
      skipWs();
      if (src[i] === '(') relations.push([role, parseNode()]);
      else {
        const tok = readToken();
        relations.push([role, tok]);
      }
    }
    return { var: variable, concept, relations };
  };

  try { return parseNode(); } catch { return null; }
}

/** Collect every variable defined in the tree (to detect reentrancies). */
export function definedVars(node, out = new Set()) {
  if (!node) return out;
  out.add(node.var);
  for (const [, val] of node.relations || []) {
    if (val && typeof val === 'object') definedVars(val, out);
  }
  return out;
}

export function toPenman(node, indent = 4, depth = 0) {
  if (!node) return '';
  const pad = '\n' + ' '.repeat(indent * (depth + 1));
  let out = `(${node.var} / ${node.concept}`;
  for (const [role, val] of node.relations || []) {
    out += pad + role + ' ';
    out += (val && typeof val === 'object') ? toPenman(val, indent, depth + 1) : val;
  }
  return out + ')';
}

/** Plain-JSON view (what the "json" theme shows). */
export function toJson(node) {
  if (!node) return null;
  const obj = { var: node.var, concept: node.concept };
  const rels = node.relations || [];
  if (rels.length) {
    obj.relations = rels.map(([role, val]) => ({
      role,
      value: (val && typeof val === 'object') ? toJson(val) : val,
    }));
  }
  return obj;
}

/** Variables mentioned but never defined here = reentrancy targets. */
export function reentrancies(node) {
  const defined = definedVars(node);
  const refs = new Set();
  const walk = (n) => {
    for (const [, val] of n.relations || []) {
      if (val && typeof val === 'object') walk(val);
      else if (typeof val === 'string' && defined.has(val)) refs.add(val);
    }
  };
  if (node) walk(node);
  return refs;
}

/**
 * Render the *live* annotation tree (orchestrator node schema, with `id`
 * instead of `var`, and possibly unresolved pending leaves still inside
 * `relations`) as Penman text. Pending leaves render as `<...phrase...>` so
 * the partial graph stays readable while annotation is in progress.
 */
export function nodeToPenman(node, varCounter = { n: 0 }, seen = new Map(), indent = 4, depth = 0) {
  if (!node) return '(x0 / amr-empty)';
  if (node.expand) return `<${node.kind || 'pending'}: ${node.phrase || ''}>`;
  if (node.ref) return seen.get(node.ref) || node.ref;

  const v = node.id || `x${++varCounter.n}`;
  seen.set(node.id, v);
  const pad = '\n' + ' '.repeat(indent * (depth + 1));
  let out = `(${v} / ${node.concept ?? 'thing'}`;
  for (const [role, val] of node.relations || []) {
    out += pad + role + ' ';
    if (val && typeof val === 'object') {
      out += val.ref
        ? (seen.get(val.ref) || `<ref:${val.ref}>`)
        : nodeToPenman(val, varCounter, seen, indent, depth + 1);
    } else {
      out += val;
    }
  }
  return out + ')';
}
