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

const SKILLS = [
  defineSkill({ id: 'polarity', label: '整体极性', file: 'skills/sentiment/polarity.md',
    describes: '一次性判定整句极性 positive/negative/neutral/mixed 及置信度' }),
  defineSkill({ id: 'aspect', label: '方面级情感', file: 'skills/sentiment/aspect.md',
    describes: '抽取评价对象（aspect）及其各自极性——整体极性之上的第二层标注', serial: true }),
  defineSkill({ id: 'intensity', label: '强度', file: 'skills/sentiment/intensity.md',
    describes: '给出 1–5 的情感强度与触发词' }),
];

const POLARITY_COLOR = { positive: '#2f9e6e', negative: '#d1493f', neutral: '#8a8f98', mixed: '#c08a1e' };
const SKILL_COLOR = { polarity: '#2f9e6e', aspect: '#2b7fd4', intensity: '#c08a1e' };
const POLARITY_ZH = { positive: '正面', negative: '负面', neutral: '中性', mixed: '褒贬混合' };

export default {
  id: 'sentiment',
  label: '情感标注（简单格式示例）',
  description: '并行标注：每句一次性从左到右；三个 skill 相互独立，可任意顺序点击运行',
  skills: SKILLS,
  serial: false,
  flat: true,
  themes: [
    { id: 'badges', label: '标签视图' },
    { id: 'json', label: 'JSON' },
  ],
  skillColor: (id) => SKILL_COLOR[id] || '#8a8f98',

  // The flat-format contract ui/tree.js relies on. These MUST live on the
  // default export: registry.js registers `mod.default`, so a named export
  // here would be invisible to the UI — the pending rows would silently never
  // appear and a new document could never be annotated.
  pendingSlots: (sentence) => flatPendingSlots(SKILLS, sentence),
  runSkill: (skillId, sentence, language) =>
    runFlat(SKILLS.find((s) => s.id === skillId), sentence, language),

  renderSource(sentence) {
    return `<div class="plain-text">${esc(sentence.text)}</div>`;
  },

  renderArtifact(sentence, theme) {
    const ann = sentence.annotation || {};
    if (theme === 'json') {
      return `<pre class="artifact">${jsonHtml(ann)}</pre>`;
    }
    if (!Object.keys(ann).length) {
      return '<pre class="artifact empty-artifact">(尚未标注 — 在右侧标注树里点击 polarity / aspect / intensity 开始)</pre>';
    }
    const pol = ann.polarity || 'neutral';
    const color = POLARITY_COLOR[pol] || '#8a8f98';
    const aspects = (ann.aspects || []).map((a) => `
      <div class="aspect-row">
        <span class="dot" style="background:${POLARITY_COLOR[a.polarity] || '#8a8f98'}"></span>
        <span class="aspect-term">${esc(a.term)}</span>
        <span class="aspect-pol">${POLARITY_ZH[a.polarity] || a.polarity}</span>
        ${a.evidence ? `<span class="aspect-ev">"${esc(a.evidence)}"</span>` : ''}
      </div>`).join('');

    return `
      <div class="sent-summary">
        <span class="pol-badge" style="background:${color}">${POLARITY_ZH[pol] || pol}</span>
        ${ann.intensity ? `<span class="intensity">强度 ${ann.intensity}/5</span>` : ''}
        ${ann.confidence ? `<span class="conf">置信 ${ann.confidence}</span>` : ''}
      </div>
      ${aspects ? `<div class="aspect-list"><div class="artifact-sub-title">方面级</div>${aspects}</div>` : ''}
      ${ann.triggers?.length ? `<div class="triggers">触发词：${ann.triggers.map((t) => `<code>${esc(t)}</code>`).join(' ')}</div>` : ''}`;
  },

  renderExtra: () => '',

  nodeSummary(node) {
    const out = node.output || {};
    let detail = '';
    if (node.skill === 'polarity') detail = POLARITY_ZH[out.polarity] || out.polarity || '';
    else if (node.skill === 'aspect') detail = `${(out.aspects || []).length} 个方面`;
    else if (node.skill === 'intensity') detail = out.intensity ? `强度 ${out.intensity}/5` : '';
    return { title: node.span || '', detail };
  },

  legend: () => [
    { color: POLARITY_COLOR.positive, label: 'positive', note: '正面' },
    { color: POLARITY_COLOR.negative, label: 'negative', note: '负面' },
    { color: POLARITY_COLOR.neutral, label: 'neutral', note: '中性' },
    { color: POLARITY_COLOR.mixed, label: 'mixed', note: '褒贬混合' },
    { color: SKILL_COLOR.aspect, label: 'aspect', note: '方面级第二层标注' },
  ],
};
