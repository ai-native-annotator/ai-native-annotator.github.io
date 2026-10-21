/**
 * A UMR graph drawn as boxes and arrows (inline SVG, colours from the page's tokens).
 *
 *   drawGraph({nodes, edges, attrs, top}, {highlight, onPick, onHover, dashed}) -> <svg>
 *
 * nodes: [{var, concept, words?, align?, auto?}]; edges: [{src, role, tgt}];
 * attrs: [{var, role, value}] (constants, written inside the box). The graph is laid out as a
 * tree from `top` (children in edge order); an edge to a node already placed is a re-entrancy
 * and is drawn as a dashed curve. `highlight` is a Set of variables to mark, `dashed` a Set of
 * variables drawn as open placeholders; `onPick(var)` is called on click, `onHover(var|null)`
 * on hover.
 */

const NS = 'http://www.w3.org/2000/svg';
const FONT = 12;
const PAD_X = 10;
const LINE = 15;
const GAP_X = 22;
const GAP_Y = 56;

function el(tag, attrs = {}, ...kids) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) e.setAttribute(k, String(v));
  kids.flat().forEach((k) => k && e.append(k));
  return e;
}

/** Width of a text in px, roughly: CJK characters are about twice as wide as Latin ones. */
function textWidth(s, size = FONT) {
  let w = 0;
  for (const ch of String(s)) w += /[⺀-鿿＀-￯]/.test(ch) ? size * 1.05 : size * 0.6;
  return w;
}

function boxLines(n, attrs) {
  const lines = [{ text: n.concept, cls: 'g-concept' }];
  lines.push({ text: `${n.var}${n.words ? ` · ${n.words}` : ''}`, cls: 'g-var' });
  for (const a of attrs) lines.push({ text: `:${a.role} ${a.value}`, cls: 'g-attr' });
  return lines;
}

export function drawGraph(g, { highlight = new Set(), dashed = new Set(), onPick, onHover } = {}) {
  const byVar = new Map(g.nodes.map((n) => [n.var, n]));
  const attrsOf = new Map();
  for (const a of g.attrs || []) {
    if (!attrsOf.has(a.var)) attrsOf.set(a.var, []);
    attrsOf.get(a.var).push(a);
  }
  // tree edges from the top, in edge order; the rest are re-entrancies
  const kids = new Map(g.nodes.map((n) => [n.var, []]));
  const placed = new Set();
  const treeEdges = [];
  const reentrant = [];
  const roots = [];
  const visit = (v) => {
    placed.add(v);
    for (const e of g.edges.filter((x) => x.src === v)) {
      if (!byVar.has(e.tgt)) continue;
      if (placed.has(e.tgt)) { reentrant.push(e); continue; }
      kids.get(v).push(e.tgt);
      treeEdges.push(e);
      visit(e.tgt);
    }
  };
  const start = byVar.has(g.top) ? g.top : g.nodes[0]?.var;
  for (const v of [start, ...g.nodes.map((n) => n.var)]) {
    if (v && !placed.has(v)) { roots.push(v); visit(v); }
  }

  // box sizes
  const size = new Map();
  for (const n of g.nodes) {
    const lines = boxLines(n, attrsOf.get(n.var) || []);
    const w = Math.max(56, ...lines.map((l, k) => textWidth(l.text, k === 0 ? FONT + 1 : FONT - 1))) + PAD_X * 2;
    size.set(n.var, { w, h: lines.length * LINE + 10, lines });
  }
  // subtree widths, then positions (children centred under their parent)
  const span = new Map();
  const spanOf = (v) => {
    const ks = kids.get(v);
    const childW = ks.reduce((s, k) => s + spanOf(k), 0) + Math.max(0, ks.length - 1) * GAP_X;
    const w = Math.max(size.get(v).w, childW);
    span.set(v, w);
    return w;
  };
  const depth = new Map();
  const rowH = [];
  const pos = new Map();
  const place = (v, left, d) => {
    depth.set(v, d);
    rowH[d] = Math.max(rowH[d] || 0, size.get(v).h);
    const w = span.get(v);
    pos.set(v, { cx: left + w / 2 });
    const ks = kids.get(v);
    const childW = ks.reduce((s, k) => s + span.get(k), 0) + Math.max(0, ks.length - 1) * GAP_X;
    let x = left + (w - childW) / 2;
    for (const k of ks) { place(k, x, d + 1); x += span.get(k) + GAP_X; }
  };
  let left = 0;
  for (const r of roots) { spanOf(r); place(r, left, 0); left += span.get(r) + GAP_X * 2; }
  const rowY = [];
  let y = 8;
  rowH.forEach((h, d) => { rowY[d] = y; y += h + GAP_Y; });
  for (const [v, p] of pos) { p.y = rowY[depth.get(v)]; p.w = size.get(v).w; p.h = size.get(v).h; }
  const width = Math.max(left - GAP_X * 2, 100) + 16;
  const height = y - GAP_Y + 16;

  const svg = el('svg', { class: 'graph-svg', viewBox: `-8 0 ${width} ${height}`, width, height, role: 'img',
    'aria-label': `graph with ${g.nodes.length} nodes` });
  svg.append(el('defs', {}, el('marker', { id: 'g-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' },
    el('path', { d: 'M0,0 L10,5 L0,10 z', class: 'g-arrowhead' }))));
  const label = (x, yy, text) => {
    const t = el('text', { x, y: yy, class: 'g-role', 'text-anchor': 'middle' });
    t.textContent = `:${text}`;
    return t;
  };
  for (const e of treeEdges) {
    const a = pos.get(e.src); const b = pos.get(e.tgt);
    const x1 = a.cx; const y1 = a.y + a.h; const x2 = b.cx; const y2 = b.y;
    svg.append(el('path', { d: `M${x1},${y1} C${x1},${(y1 + y2) / 2} ${x2},${(y1 + y2) / 2} ${x2},${y2}`, class: 'g-edge', 'marker-end': 'url(#g-arrow)' }));
    svg.append(label((x1 + x2) / 2, (y1 + y2) / 2 - 3, e.role));
  }
  for (const e of reentrant) {
    const a = pos.get(e.src); const b = pos.get(e.tgt);
    const x1 = a.cx; const y1 = a.y + a.h; const x2 = b.cx + (b.cx > a.cx ? -b.w / 2 : b.w / 2); const y2 = b.y + b.h / 2;
    const bend = Math.max(40, Math.abs(x2 - x1) / 3);
    svg.append(el('path', { d: `M${x1},${y1} C${x1},${y1 + bend} ${x2 + (b.cx > a.cx ? -bend : bend)},${y2} ${x2},${y2}`, class: 'g-edge g-reentrant', 'marker-end': 'url(#g-arrow)' }));
    svg.append(label((x1 + x2) / 2, Math.max(y1, y2) + 12, e.role));
  }
  for (const n of g.nodes) {
    const p = pos.get(n.var);
    if (!p) continue;
    const cls = ['g-node'];
    if (highlight.has(n.var)) cls.push('hl');
    if (dashed.has(n.var)) cls.push('open');
    if (n.auto) cls.push('auto');
    const grp = el('g', { class: cls.join(' '), transform: `translate(${p.cx - p.w / 2},${p.y})`, tabindex: 0, 'data-var': n.var });
    grp.append(el('rect', { width: p.w, height: p.h, rx: 7 }));
    size.get(n.var).lines.forEach((l, k) => {
      const t = el('text', { x: PAD_X, y: 17 + k * LINE, class: l.cls });
      t.textContent = l.text;
      grp.append(t);
    });
    const title = el('title');
    title.textContent = `${n.var} / ${n.concept}${n.align ? `  [${n.align}]` : ''}${n.skill ? `  ← ${n.skill} ${n.node}` : ''}`;
    grp.append(title);
    if (onPick) {
      grp.addEventListener('click', () => onPick(n.var));
      grp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') onPick(n.var); });
    }
    if (onHover) {
      grp.addEventListener('mouseenter', () => onHover(n.var));
      grp.addEventListener('mouseleave', () => onHover(null));
    }
    svg.append(grp);
  }
  return svg;
}

/** A skill's graph fragment (predicate / np_phrase / special_entity / stop) in drawGraph's shape. */
export function fragmentGraph(output) {
  const g = output?.graph;
  if (!g || !Array.isArray(g.nodes) || !g.nodes.length) return null;
  const open = new Set((output.open || []).map((o) => o.var));
  const outside = new Set((output.outside || []).map((o) => o.var).filter(Boolean));
  const nodes = g.nodes.map((n) => ({ var: n.var, concept: n.concept, words: Array.isArray(n.span) ? `[${n.span.join('-')}]` : '' }));
  const known = new Set(nodes.map((n) => n.var));
  for (const o of [...(output.open || []), ...(output.outside || [])]) {
    if (o.var && !known.has(o.var)) {
      nodes.push({ var: o.var, concept: o.text || '…', words: Array.isArray(o.span) ? `[${o.span.join('-')}]` : '' });
      known.add(o.var);
    }
  }
  const edges = [];
  const attrs = [];
  for (const [s, r, t] of g.edges || []) {
    if (known.has(t)) edges.push({ src: s, role: String(r).replace(/^:/, ''), tgt: t });
    else attrs.push({ var: s, role: String(r).replace(/^:/, ''), value: t });
  }
  for (const [v, r, c] of g.attrs || []) attrs.push({ var: v, role: String(r).replace(/^:/, ''), value: c });
  return { graph: { nodes, edges, attrs, top: nodes[0].var }, dashed: new Set([...open, ...outside]) };
}
