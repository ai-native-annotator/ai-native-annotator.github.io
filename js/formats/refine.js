/**
 * UMR by refinement: one-shot draft, then a chain of passes over the whole graph.
 *
 * The contrast with formats/umr.js is the point of having both. `umr` builds a
 * graph bottom-up: each skill owns a span, and the result is a tree of calls
 * that mirrors the sentence's structure. `refine` starts from a complete but
 * rough graph and improves it in place: each pass reads the entire graph and
 * returns the entire graph.
 *
 * That makes the passes SEQUENTIAL, not hierarchical — pass 4 does not sit
 * under pass 3, it replaces its output — so this format declares `chain: true`
 * and the annotated pane renders a pipeline with a per-pass diff instead of a
 * tree. See core/chain.js.
 *
 * The pass order is not arbitrary. Structure has to settle before anything
 * decorates it: you cannot put :aspect on the right events until the events
 * and their senses are right, and document-level relations point at variables
 * that reentrancy may still merge. Each pass therefore assumes everything
 * above it is already settled, which is exactly what a chain buys.
 */

import { esc, jsonHtml } from '../core/dom.js';
import { defineSkill } from '../core/registry.js';
import { t } from '../core/i18n.js';
import { parsePenman, toPenman, toJson, reentrancies } from '../core/penman.js';

const PASSES = [
  'oneshot',      // draft the whole graph from the sentence
  'roleset',      // predicate senses: taste-01 vs taste-02
  'argstruct',    // core roles :ARG0..n against the roleset's frame
  'aspect',       // every eventive node carries a legal :aspect
  'entity',       // person / name / wiki wrappers, dates, quantities
  'reentrancy',   // one variable per referent within the sentence
  'doclevel',     // cross-sentence temporal and modal dependencies
  'validate',     // structural well-formedness, last word
];

const PASS_COLOR = {
  oneshot: '#7c6cf0', roleset: '#e0603a', argstruct: '#2f9e6e', aspect: '#c08a1e',
  entity: '#2b7fd4', reentrancy: '#b34ba0', doclevel: '#4a8fa8', validate: '#8a8f98',
};

// Built fresh on each read so labels follow the interface language.
// `validate` is a program, not a prompt. Everything it checks — balanced
// brackets, variables defined once and resolving, an :aspect on every eventive
// node — is decidable, and asking a model to count parentheses costs a round
// trip to get an answer it can get wrong for no reason. It runs in the sandbox
// and is editable like any other skill; see data/reference/refine/validate.js.
const CODE = { validate: 'reference/refine/validate.js' };

const skills = () => PASSES.map((id) => defineSkill({
  id,
  namespace: 'refine',
  label: t(`refine.skill.${id}`),
  file: `skills/refine/${id}.md`,
  describes: t(`refine.desc.${id}`),
  serial: true,
  code: CODE[id] || '',
  llm: !CODE[id],
}));

export default {
  id: 'refine',
  get label() { return t('fmt.refine.label'); },
  get description() { return t('fmt.refine.desc'); },
  get skills() { return skills(); },
  serial: true,
  chain: true,                 // passes run in order over the whole graph
  themes: [
    { id: 'penman', label: 'Penman' },
    { id: 'json', label: 'JSON' },
  ],
  skillColor: (id) => PASS_COLOR[id] || '#8a8f98',

  renderSource(sentence) {
    const rows = (sentence.tokens || []).map((tok, i) => `
      <div class="tok-row" data-token="${i}">
        <span class="tok-idx">${i + 1}</span>
        <span class="tok-text">${esc(tok)}</span>
      </div>`).join('');
    return `<div class="token-list">${rows}</div>`;
  },

  /** The artifact is simply the latest pass's graph — the chain's whole output. */
  renderArtifact(sentence, theme) {
    const graph = sentence.graph || '';
    if (!graph) return `<pre class="artifact empty-artifact">${t('fmt.refine.empty')}</pre>`;
    const parsed = parsePenman(graph);
    if (!parsed) {
      // Unparseable is worth seeing verbatim rather than hidden: a pass
      // returned something malformed and the annotator needs to look at it.
      return `<pre class="artifact malformed">${esc(graph)}</pre>`;
    }
    if (theme === 'json') return `<pre class="artifact">${jsonHtml(toJson(parsed))}</pre>`;
    const reent = reentrancies(parsed);
    let html = esc(toPenman(parsed));
    html = html.replace(/\/ ([^\s()]+)/g, '/ <span class="p-concept">$1</span>')
               .replace(/(:[\w-]+)/g, '<span class="p-role">$1</span>');
    for (const v of reent) {
      html = html.replace(new RegExp(`(?<![\\w-])${v}(?![\\w-])(?!\\s*/)`, 'g'),
                          `<span class="p-reent">${v}</span>`);
    }
    return `<pre class="artifact">${html}</pre>`;
  },

  renderExtra(sentence) {
    if (!sentence.docAnnotation) return '';
    return `<div class="artifact-section">
      <div class="artifact-label">${t('fmt.umr.docLevel')}</div>
      <pre class="artifact doc-level">${esc(sentence.docAnnotation)}</pre></div>`;
  },

  nodeSummary(node) {
    return { title: node.label || node.pass, detail: '' };
  },

  legend: () => [],
};
