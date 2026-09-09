/**
 * The last pass of the refine chain, as a program rather than a prompt.
 *
 * Everything this pass checks is decidable: are the parentheses balanced, does
 * every variable get defined once, does every eventive concept carry an
 * :aspect. Asking a model to count brackets costs a round trip, costs money,
 * and is the one kind of question a model can get wrong for no reason. So this
 * pass runs here, in the sandbox, and the chain is the same shape either way —
 * a pass reads the whole graph and returns the whole graph.
 *
 * Edit it. A code step is a skill like any other: this is what "the method is
 * changeable" means when the method is not a matter of judgement.
 *
 *   run(graph, ctx) -> { graph, changes: [string], note: string }
 *
 * `ctx` carries {sentence, tokens, language}. Returning the graph unchanged
 * with an empty `changes` is a clean bill of health.
 */
function run(graph, ctx) {
  const changes = [];
  const problems = [];
  const text = String(graph || '');

  /* ---- balance: the one error that makes everything downstream meaningless */
  let depth = 0, inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' && text[i - 1] !== '\\') inString = !inString;
    if (inString) continue;
    if (ch === '(') depth++;
    else if (ch === ')') { depth--; if (depth < 0) { problems.push('a ")" closes nothing'); break; } }
  }
  if (depth > 0) problems.push(`${depth} unclosed "("`);

  /* ---- one definition per variable, and every reference resolves */
  const defined = new Map();
  const defRe = /\(\s*([a-zA-Z][\w-]*)\s*\/\s*([^\s()]+)/g;
  for (let m = defRe.exec(text); m; m = defRe.exec(text)) {
    if (defined.has(m[1])) problems.push(`variable "${m[1]}" is defined twice`);
    defined.set(m[1], m[2]);
  }
  if (!defined.size) problems.push('no node is defined — this is not a graph');

  const refRe = /:[\w-]+\s+([a-zA-Z][\w-]*)(?=[\s)])/g;
  const dangling = new Set();
  for (let m = refRe.exec(text); m; m = refRe.exec(text)) {
    const v = m[1];
    // A bare word after a role is either a reentrancy or a constant. Only treat
    // it as a reference when it looks like one of this graph's variables.
    if (!defined.has(v) && /^[a-z]\d*$/.test(v)) dangling.add(v);
  }
  for (const v of dangling) problems.push(`"${v}" is referenced but never defined`);

  /* ---- every event carries an aspect (UMR requires it; the model forgets) */
  let out = text;
  for (const [v, concept] of defined) {
    if (!/-\d+$/.test(concept)) continue;                       // not eventive
    const node = nodeSlice(out, v);
    if (node && !/:aspect\b/.test(node)) {
      const stative = /-9\d$/.test(concept);
      out = out.replace(node, node.replace(/\)\s*$/, ` :aspect ${stative ? 'state' : 'performance'})`));
      changes.push(`${v} / ${concept}: added :aspect`);
    }
  }

  return {
    graph: out,
    changes,
    note: problems.length
      ? `Structural problems found: ${problems.join('; ')}.`
      : `Checked ${defined.size} node(s): brackets balanced, variables resolve, events carry :aspect.`,
  };
}

/** The text of one node, from its "(" to its matching ")". */
function nodeSlice(text, variable) {
  const start = text.search(new RegExp(`\\(\\s*${variable}\\s*/`));
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') { depth--; if (depth === 0) return text.slice(start, i + 1); }
  }
  return null;
}
