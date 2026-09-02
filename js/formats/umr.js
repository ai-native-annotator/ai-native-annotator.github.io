/**
 * UMR annotation format.
 *
 * Serial by nature: a sentence becomes a tree, and structures *inside* that
 * tree get annotated again (a clause argument is itself a clause, an NP holds
 * a special entity, ...). Each expansion is one skill call, which is why the
 * annotated pane is a tree of skill calls rather than a flat label list.
 *
 * Skill ids match the Python modules in modular-parsing's umr_parser/modules/,
 * so a skill edited here maps 1:1 onto the backend module it came from. The
 * actual pipeline control flow lives in core/pipeline.js.
 */

import { defineSkill } from '../core/registry.js';
import { esc, jsonHtml } from '../core/dom.js';
import { parsePenman, toJson, toPenman, reentrancies, nodeToPenman } from '../core/penman.js';
import { rootContentNode, graphNodeOf, advanceSentence } from '../core/pipeline.js';
import { t } from '../core/i18n.js';

const SKILL_IDS = ['discourse', 'predicate', 'arguments', 'np_phrase',
  'special_entity', 'stop_test', 'reentrancy', 'doc_level'];

// Built fresh on each read so labels follow the interface language.
const skills = () => SKILL_IDS.map((id) => defineSkill({
  id, label: t(`skill.${id}`), file: `skills/shared/${id}.md`, describes: t(`desc.${id}`),
  serial: id === 'arguments' || id === 'np_phrase',
}));

const SKILL_COLOR = {
  discourse: '#7c6cf0', predicate: '#e0603a', arguments: '#2f9e6e',
  np_phrase: '#2b7fd4', special_entity: '#c08a1e', stop_test: '#8a8f98',
  reentrancy: '#b34ba0', doc_level: '#4a8fa8', '(stop)': '#8a8f98',
};

export default {
  id: 'umr',
  get label() { return t('fmt.umr.label'); },
  get description() { return t('fmt.umr.desc'); },
  get skills() { return skills(); },
  serial: true,
  themes: [
    { id: 'json', label: 'JSON' },
    { id: 'penman', label: 'Penman' },
  ],
  skillColor: (id) => SKILL_COLOR[id] || '#8a8f98',

  /**
   * The opening move when this format is applied to a sentence: queue the
   * first thing to click. Called whenever the format is switched onto a
   * document (core/work.js), and idempotent, so a sentence that already has a
   * tree keeps it and only gets whatever slot comes next.
   */
  seedSentence(sentence) { advanceSentence(sentence); },

  /** Left pane: original text, one token per line (per the format spec). */
  renderSource(sentence) {
    const rows = sentence.tokens.map((tok, i) => `
      <div class="tok-row" data-token="${i}">
        <span class="tok-idx">${i + 1}</span>
        <span class="tok-text">${esc(tok)}</span>
      </div>`).join('');
    return `<div class="token-list">${rows}</div>`;
  },

  /** Right pane artifact: the finished graph, in the selected theme. */
  renderArtifact(sentence, theme) {
    const root = rootContentNode(sentence);
    if (root) {
      const text = nodeToPenman(graphNodeOf(root));
      if (theme === 'penman') return `<pre class="artifact">${esc(text)}</pre>`;
      const parsed = parsePenman(text);
      return `<pre class="artifact">${jsonHtml(parsed ? toJson(parsed) : { _raw: text })}</pre>`;
    }
    const parsed = parsePenman(sentence.graph);
    if (!parsed) {
      // No graph text at all -> the sentence is unannotated, and the hint is
      // exactly what the user needs (a freshly imported sentence already has a
      // seeded pending row, so "tree is empty" is the wrong test for this).
      return `<pre class="artifact empty-artifact">${sentence.graph
        ? esc(sentence.graph)
        : t('fmt.umr.emptyArtifact')}</pre>`;
    }
    if (theme === 'penman') {
      const reent = reentrancies(parsed);
      let html = esc(toPenman(parsed));
      html = html.replace(/\/ ([^\s()]+)/g, '/ <span class="p-concept">$1</span>')
                 .replace(/(:[\w-]+)/g, '<span class="p-role">$1</span>');
      for (const v of reent) {
        html = html.replace(new RegExp(`(?<![\\w-])${v}(?![\\w-])(?!\\s*/)`, 'g'),
                            `<span class="p-reent">${v}</span>`);
      }
      return `<pre class="artifact">${html}</pre>`;
    }
    return `<pre class="artifact">${jsonHtml(toJson(parsed))}</pre>`;
  },

  /** Extra artifact section: the document-level block, when present. */
  renderExtra(sentence) {
    const docLevel = (sentence.tree || []).find((n) => n.skill === 'doc_level' && !n.pending);
    const text = docLevel?.output?.rendered || sentence.docAnnotation;
    if (!text) return '';
    return `<div class="artifact-sub">
      <div class="artifact-sub-title">${esc(t('fmt.umr.docLevel'))}</div>
      <pre class="artifact">${esc(text)}</pre></div>`;
  },

  /** How a tree node labels itself. */
  nodeSummary(node) {
    const out = node.output || {};
    let detail = '';
    if (node.skill === 'discourse') {
      detail = out.has_discourse
        ? t('sent.hasDiscourse', { what: out.structure?.concept || t(out.structure?.kind ? 'sent.subordinate' : 'sent.present') })
        : t('sent.noDiscourse');
    } else if (node.skill === 'predicate') {
      detail = out.concept || (out.lemmas || []).join('/') || out.predicate_text || '';
    } else if (node.skill === 'reentrancy') {
      const n = (out.merge || []).length;
      detail = n ? t('sent.mergeCount', { n }) : t('sent.noMerge');
    } else if (node.skill === 'doc_level') {
      const tp = (out.temporal || []).length, m = (out.modal || []).length, c = (out.coref || []).length;
      detail = t('sent.docCounts', { t: tp, m, c });
    } else if (node.skill === 'stop_test') {
      detail = out.kind || '';
    } else {
      detail = out.concept || '';
    }
    return { title: node.span || '', detail };
  },

  legend: () => [
    { color: SKILL_COLOR.discourse, label: 'discourse', note: t('legend.discourse') },
    { color: SKILL_COLOR.predicate, label: 'predicate', note: t('legend.predicate') },
    { color: SKILL_COLOR.arguments, label: 'arguments', note: t('legend.arguments') },
    { color: SKILL_COLOR.np_phrase, label: 'np_phrase', note: t('legend.np_phrase') },
    { color: SKILL_COLOR.special_entity, label: 'special_entity', note: t('legend.special_entity') },
    { color: SKILL_COLOR.reentrancy, label: 'reentrancy', note: t('legend.reentrancy') },
    { color: SKILL_COLOR.doc_level, label: 'doc_level', note: t('legend.doc_level') },
    { color: SKILL_COLOR['(stop)'], label: '(stop)', note: t('legend.stop') },
  ],
};

