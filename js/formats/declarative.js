/**
 * Declarative format builder.
 *
 * A new annotation format is described as *data* (which fields exist, how the
 * two panes lay out, what the legend means) and this module turns that spec
 * into a live format object. The format studio (ui/studio.js) generates such
 * specs from a text description — either locally from a template or, in live
 * mode, by asking the model to fill in this same schema.
 *
 * Deliberately not `eval`/`new Function` on generated code: a spec can be
 * inspected, diffed, and committed to git, and a malformed one degrades to a
 * plain JSON view instead of breaking the app. Generated formats run their
 * skills through the same flat (non-recursive) mechanism as sentiment.
 */

import { esc, jsonHtml } from '../core/dom.js';
import { defineSkill } from '../core/registry.js';
import { flatPendingSlots, runFlatSkill } from '../core/flat.js';
import { t } from '../core/i18n.js';

// Built on read so the schema shown to the user (and sent to the model in
// live mode) is in the interface language.
export const specSchema = () => ({
  id: t('studio.schema.id'),
  label: t('studio.schema.label'),
  description: 'string',
  serial: t('studio.schema.serial'),
  source: { layout: t('studio.schema.source') },
  artifact: {
    layout: "'badges' | 'spans' | 'table' | 'json'",
    fields: "[{key, label, type: 'text'|'badge'|'list'|'number'}]",
  },
  skills: "[{id, label, describes, instructions?, serial}]",
  legend: "[{label, color, note}]",
});

const PALETTE = ['#2f9e6e', '#d1493f', '#2b7fd4', '#c08a1e', '#7c6cf0', '#b34ba0', '#4a8fa8'];

export function buildFormat(spec) {
  const fields = spec.artifact?.fields || [];
  const legend = (spec.legend || []).map((l, i) => ({
    label: l.label, note: l.note || '', color: l.color || PALETTE[i % PALETTE.length],
  }));
  const colorFor = Object.fromEntries(legend.map((l) => [l.label, l.color]));
  const skills = (spec.skills || []).map((s) => defineSkill({
    id: s.id,
    namespace: `runtime/${spec.id}`,
    label: s.label || s.id,
    file: s.file || `skills/${spec.id}/${s.id}.md`,
    describes: s.describes || '',
    instructions: inlineSkillInstructions(spec, s),
    serial: Boolean(s.serial),
  }));
  const skillColor = Object.fromEntries(
    skills.map((s, i) => [s.id, PALETTE[i % PALETTE.length]]));

  return {
    id: spec.id,
    label: spec.label || spec.id,
    description: spec.description || '',
    generated: true,
    flat: true,
    spec,
    skills,
    serial: Boolean(spec.serial),
    themes: [
      { id: spec.artifact?.layout || 'badges', label: t('studio.badgeTheme') },
      { id: 'json', label: 'JSON' },
    ],
    skillColor: (id) => skillColor[id] || '#8a8f98',

    renderSource(sentence) {
      if (spec.source?.layout === 'tokens') {
        const rows = (sentence.tokens || [...sentence.text]).map((tok, i) =>
          `<div class="tok-row" data-token="${i}">
             <span class="tok-idx">${i + 1}</span>
             <span class="tok-text">${esc(tok)}</span></div>`).join('');
        return `<div class="token-list">${rows}</div>`;
      }
      return `<div class="plain-text">${esc(sentence.text)}</div>`;
    },

    renderArtifact(sentence, theme) {
      const ann = sentence.annotation || {};
      if (theme === 'json' || !fields.length) {
        if (!Object.keys(ann).length) return `<pre class="artifact empty-artifact">${t('fmt.empty')}</pre>`;
        return `<pre class="artifact">${jsonHtml(ann)}</pre>`;
      }
      const rows = fields.map((f) => {
        const v = ann[f.key];
        if (v === undefined || v === null || v === '') return '';
        return `<div class="gen-row">
          <span class="gen-label">${esc(f.label || f.key)}</span>
          ${renderValue(v, f, colorFor)}</div>`;
      }).join('');
      return rows ? `<div class="gen-fields">${rows}</div>` : `<pre class="artifact empty-artifact">${t('fmt.empty')}</pre>`;
    },

    renderExtra: () => '',

    // flat-format contract (same as formats/sentiment.js): both must be on the
    // format object itself, since that object is what the registry hands to the UI
    pendingSlots: (sentence) => flatPendingSlots(skills, sentence),
    runSkill: (skillId, sentence, language) =>
      runFlatSkill(skills.find((s) => s.id === skillId), sentence, language),

    nodeSummary(node) {
      const out = node.output || {};
      const first = fields.find((f) => out[f.key] !== undefined);
      return { title: node.span || '', detail: first ? String(out[first.key]).slice(0, 30) : '' };
    },

    legend: () => legend,
  };
}

function inlineSkillInstructions(spec, skill) {
  if (String(skill.instructions || '').trim()) return String(skill.instructions).trim();
  const fields = (spec.artifact?.fields || [])
    .map((field) => `- ${field.key}: ${field.type || 'text'} (${field.label || field.key})`)
    .join('\n');
  return [
    `# ${skill.label || skill.id}`,
    String(skill.describes || `Annotate the ${skill.id} field.`).trim(),
    '',
    'Return one JSON object using only the relevant output fields:',
    fields || `- ${skill.id}: text`,
  ].join('\n');
}

function renderValue(v, field, colorFor) {
  if (field.type === 'badge') {
    const c = colorFor[v] || '#8a8f98';
    return `<span class="pol-badge" style="background:${c}">${esc(v)}</span>`;
  }
  if (field.type === 'list' || Array.isArray(v)) {
    return `<span class="gen-list">${(Array.isArray(v) ? v : [v])
      .map((x) => `<code>${esc(typeof x === 'object' ? JSON.stringify(x) : x)}</code>`)
      .join(' ')}</span>`;
  }
  if (field.type === 'number') return `<span class="gen-num">${esc(v)}</span>`;
  return `<span class="gen-text">${esc(typeof v === 'object' ? JSON.stringify(v) : v)}</span>`;
}

/**
 * Offline generator: derive a usable spec from a plain-text description by
 * keyword matching. Crude on purpose — it exists so the feature works with no
 * API key; live mode produces a much better spec from the same description.
 */
export function specFromDescription(text, id) {
  const low = text.toLowerCase();          // NOT `t` — that is the i18n lookup
  const zh = text;
  const wantsTokens = /逐[字词]|每.{0,2}[字词].{0,3}一行|token|per line|一行一个/.test(zh + low);
  const fields = [];
  const legend = [];

  const guess = [
    { re: /极性|情感|polarity|sentiment/i, key: 'polarity', label: t('studio.f.polarity'), type: 'badge',
      values: ['positive', 'negative', 'neutral'] },
    { re: /实体|ner|entity/i, key: 'entities', label: t('studio.f.entities'), type: 'list' },
    { re: /类别|分类|label|category|class/i, key: 'label', label: t('studio.f.label'), type: 'badge' },
    { re: /强度|intensity|score|分数|置信/i, key: 'score', label: t('studio.f.score'), type: 'number' },
    { re: /关系|relation/i, key: 'relations', label: t('studio.f.relations'), type: 'list' },
    { re: /摘要|summary/i, key: 'summary', label: t('studio.f.summary'), type: 'text' },
    { re: /主题|topic/i, key: 'topic', label: t('studio.f.topic'), type: 'badge' },
  ];
  for (const g of guess) {
    if (g.re.test(zh) || g.re.test(low)) {
      fields.push({ key: g.key, label: g.label, type: g.type });
      for (const v of g.values || []) legend.push({ label: v, note: '' });
    }
  }
  if (!fields.length) fields.push({ key: 'label', label: t('studio.f.generic'), type: 'text' });

  const serial = /串行|嵌套|再标注|递归|层级|serial|nested/.test(zh + low);
  const skills = fields.map((f) => ({
    id: f.key, label: f.label, describes: t('studio.f.describes', { label: f.label }), serial: false,
  }));
  if (serial) {
    skills.push({ id: 'refine', label: t('studio.f.refine'), describes: t('studio.f.refineDesc'), serial: true });
  }

  return {
    id, label: id, description: text.slice(0, 120), serial,
    source: { layout: wantsTokens ? 'tokens' : 'text' },
    artifact: { layout: 'badges', fields },
    skills, legend,
  };
}

/** Prompt used in live mode to have the model fill in this same schema. */
export function specPrompt(description, id) {
  return [
    t('studio.prompt'),
    JSON.stringify(specSchema(), null, 2),
    '',
    t('studio.promptId', { id }),
    t('studio.promptSkills'),
    '',
    t('studio.promptDesc', { description }),
  ].join('\n');
}
