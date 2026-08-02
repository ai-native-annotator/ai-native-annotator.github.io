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

export const SPEC_SCHEMA = {
  id: 'string — 格式标识（英文小写）',
  label: 'string — 显示名',
  description: 'string',
  serial: 'boolean — 是否为串行标注（标注之上再标注）',
  source: { layout: "'tokens' | 'text' — 左侧原文：逐词一行 或 整段文本" },
  artifact: {
    layout: "'badges' | 'spans' | 'table' | 'json'",
    fields: "[{key, label, type: 'text'|'badge'|'list'|'number'}]",
  },
  skills: "[{id, label, describes, serial}]",
  legend: "[{label, color, note}]",
};

const PALETTE = ['#2f9e6e', '#d1493f', '#2b7fd4', '#c08a1e', '#7c6cf0', '#b34ba0', '#4a8fa8'];

export function buildFormat(spec) {
  const fields = spec.artifact?.fields || [];
  const legend = (spec.legend || []).map((l, i) => ({
    label: l.label, note: l.note || '', color: l.color || PALETTE[i % PALETTE.length],
  }));
  const colorFor = Object.fromEntries(legend.map((l) => [l.label, l.color]));
  const skills = (spec.skills || []).map((s) => defineSkill({
    id: s.id, label: s.label || s.id, file: s.file || `skills/${spec.id}/${s.id}.md`,
    describes: s.describes || '', serial: Boolean(s.serial),
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
      { id: spec.artifact?.layout || 'badges', label: '标签视图' },
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
        if (!Object.keys(ann).length) return '<pre class="artifact empty-artifact">(尚未标注)</pre>';
        return `<pre class="artifact">${jsonHtml(ann)}</pre>`;
      }
      const rows = fields.map((f) => {
        const v = ann[f.key];
        if (v === undefined || v === null || v === '') return '';
        return `<div class="gen-row">
          <span class="gen-label">${esc(f.label || f.key)}</span>
          ${renderValue(v, f, colorFor)}</div>`;
      }).join('');
      return rows ? `<div class="gen-fields">${rows}</div>` : '<pre class="artifact empty-artifact">(尚未标注)</pre>';
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
  const t = text.toLowerCase();
  const zh = text;
  const wantsTokens = /逐[字词]|每.{0,2}[字词].{0,3}一行|token|per line|一行一个/.test(zh + t);
  const fields = [];
  const legend = [];

  const guess = [
    { re: /极性|情感|polarity|sentiment/i, key: 'polarity', label: '极性', type: 'badge',
      values: ['positive', 'negative', 'neutral'] },
    { re: /实体|ner|entity/i, key: 'entities', label: '实体', type: 'list' },
    { re: /类别|分类|label|category|class/i, key: 'label', label: '类别', type: 'badge' },
    { re: /强度|intensity|score|分数|置信/i, key: 'score', label: '强度/分数', type: 'number' },
    { re: /关系|relation/i, key: 'relations', label: '关系', type: 'list' },
    { re: /摘要|summary/i, key: 'summary', label: '摘要', type: 'text' },
    { re: /主题|topic/i, key: 'topic', label: '主题', type: 'badge' },
  ];
  for (const g of guess) {
    if (g.re.test(zh) || g.re.test(t)) {
      fields.push({ key: g.key, label: g.label, type: g.type });
      for (const v of g.values || []) legend.push({ label: v, note: '' });
    }
  }
  if (!fields.length) fields.push({ key: 'label', label: '标注', type: 'text' });

  const serial = /串行|嵌套|再标注|递归|层级|serial|nested/.test(zh + t);
  const skills = fields.map((f) => ({
    id: f.key, label: f.label, describes: `产出 ${f.label} 字段`, serial: false,
  }));
  if (serial) {
    skills.push({ id: 'refine', label: '二次标注', describes: '在上一层结果之上继续标注', serial: true });
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
    '你是标注工具的格式设计器。根据用户对某种标注格式的文字描述，',
    '产出一个 JSON 规格（不要输出任何解释文字，只输出 JSON）。',
    '规格字段含义：',
    JSON.stringify(SPEC_SCHEMA, null, 2),
    '',
    `其中 id 必须为 "${id}"。fields 描述标注结果里有哪些字段以及如何显示。`,
    'skills 是产生这些标注所需的技能拆解——如果这个格式是串行的（标注之上再标注），',
    'serial 设为 true 并在 skills 里体现层级。legend 给出取值到颜色语义的说明。',
    '',
    `用户描述：${description}`,
  ].join('\n');
}
