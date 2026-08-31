/**
 * Sentiment annotation format — the "simple format" counterpart to UMR.
 *
 * Where UMR is *serial* (annotate the annotation, recursively, via
 * core/pipeline.js), sentiment is *parallel*: three independent skills each
 * contribute a slice of `sentence.annotation`, so all three pending slots
 * are available from the start and can be run in any order — still one
 * real, visible model call per click, just without recursion.
 */

import { defineSkill } from '../core/registry.js';
import { esc, jsonHtml } from '../core/dom.js';
import { runFlatSkill as runFlat, flatPendingSlots } from '../core/flat.js';
import { t } from '../core/i18n.js';

const SKILL_IDS = ['polarity', 'aspect', 'intensity'];
const SKILLS = () => SKILL_IDS.map((id) => defineSkill({
  id, label: t(`skill.${id}`), file: `skills/sentiment/${id}.md`,
  describes: t(`desc.${id}`), serial: id === 'aspect',
}));

const POLARITY_COLOR = { positive: '#2f9e6e', negative: '#d1493f', neutral: '#8a8f98', mixed: '#c08a1e' };
const SKILL_COLOR = { polarity: '#2f9e6e', aspect: '#2b7fd4', intensity: '#c08a1e' };
const polName = (p) => t(`legend.${p}`) || p;

export default {
  id: 'sentiment',
  get label() { return t('fmt.sentiment.label'); },
  get description() { return t('fmt.sentiment.desc'); },
  get skills() { return SKILLS(); },
  serial: false,
  flat: true,
  themes: [
    { id: 'badges', get label() { return t('theme.badges'); } },
    { id: 'json', label: 'JSON' },
  ],
  skillColor: (id) => SKILL_COLOR[id] || '#8a8f98',

  // The flat-format contract ui/tree.js relies on. These MUST live on the
  // default export: registry.js registers `mod.default`, so a named export
  // here would be invisible to the UI — the pending rows would silently never
  // appear and a new document could never be annotated.
  pendingSlots: (sentence) => flatPendingSlots(SKILLS(), sentence),
  runSkill: (skillId, sentence, language) =>
    runFlat(SKILLS().find((s) => s.id === skillId), sentence, language),

  renderSource(sentence) {
    return `<div class="plain-text">${esc(sentence.text)}</div>`;
  },

  renderArtifact(sentence, theme) {
    const ann = sentence.annotation || {};
    if (theme === 'json') {
      return `<pre class="artifact">${jsonHtml(ann)}</pre>`;
    }
    if (!Object.keys(ann).length) {
      return `<pre class="artifact empty-artifact">${esc(t('fmt.sentiment.empty'))}</pre>`;
    }
    const pol = ann.polarity || 'neutral';
    const color = POLARITY_COLOR[pol] || '#8a8f98';
    const aspects = (ann.aspects || []).map((a) => `
      <div class="aspect-row">
        <span class="dot" style="background:${POLARITY_COLOR[a.polarity] || '#8a8f98'}"></span>
        <span class="aspect-term">${esc(a.term)}</span>
        <span class="aspect-pol">${esc(polName(a.polarity))}</span>
        ${a.evidence ? `<span class="aspect-ev">"${esc(a.evidence)}"</span>` : ''}
      </div>`).join('');

    return `
      <div class="sent-summary">
        <span class="pol-badge" style="background:${color}">${esc(polName(pol))}</span>
        ${ann.intensity ? `<span class="intensity">${esc(t('sent.intensity', { n: ann.intensity }))}</span>` : ''}
        ${ann.confidence ? `<span class="conf">${esc(t('sent.confidence', { n: ann.confidence }))}</span>` : ''}
      </div>
      ${aspects ? `<div class="aspect-list"><div class="artifact-sub-title">${esc(t('sent.aspects'))}</div>${aspects}</div>` : ''}
      ${ann.triggers?.length ? `<div class="triggers">${esc(t('sent.triggers'))}${ann.triggers.map((w) => `<code>${esc(w)}</code>`).join(' ')}</div>` : ''}`;
  },

  renderExtra: () => '',

  nodeSummary(node) {
    const out = node.output || {};
    let detail = '';
    if (node.skill === 'polarity') detail = out.polarity ? polName(out.polarity) : '';
    else if (node.skill === 'aspect') detail = t('sent.aspectCount', { n: (out.aspects || []).length });
    else if (node.skill === 'intensity') detail = out.intensity ? t('sent.intensity', { n: out.intensity }) : '';
    return { title: node.span || '', detail };
  },

  legend: () => [
    { color: POLARITY_COLOR.positive, label: 'positive', note: t('legend.positive') },
    { color: POLARITY_COLOR.negative, label: 'negative', note: t('legend.negative') },
    { color: POLARITY_COLOR.neutral, label: 'neutral', note: t('legend.neutral') },
    { color: POLARITY_COLOR.mixed, label: 'mixed', note: t('legend.mixed') },
    { color: SKILL_COLOR.aspect, label: 'aspect', note: t('legend.aspectNote') },
  ],
};
