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
import { rootContentNode, graphNodeOf } from '../core/pipeline.js';

const SKILLS = [
  defineSkill({ id: 'discourse', label: '篇章关系', file: 'skills/shared/discourse.md',
    describes: '判断句子顶层是否为并列/从属结构，并切分出各子句跨度' }),
  defineSkill({ id: 'predicate', label: '核心谓词', file: 'skills/shared/predicate.md',
    describes: '在抽象概念与动词词元之间选择核心谓词，给出 PropBank 候选词元' }),
  defineSkill({ id: 'arguments', label: '论元与属性', file: 'skills/shared/arguments.md',
    describes: '选定义项、挂载论元与修饰语、填 :aspect/:modstr 等属性', serial: true }),
  defineSkill({ id: 'np_phrase', label: '名词短语', file: 'skills/shared/np_phrase.md',
    describes: '识别（可能隐含的）中心词、命名实体、代词指称属性', serial: true }),
  defineSkill({ id: 'special_entity', label: '特殊实体', file: 'skills/shared/special_entity.md',
    describes: '日期、数量、区间、URL、比分等特殊文本的子树' }),
  defineSkill({ id: 'stop_test', label: '停止判定', file: 'skills/shared/stop_test.md',
    describes: '判断一个短语是否还需要继续分解（仅在上游 skill 未给出合法 kind 时才会被调用）' }),
  defineSkill({ id: 'reentrancy', label: '同指消解', file: 'skills/shared/reentrancy.md',
    describes: '句内代词/控制/零形回指合并为同一变量' }),
  defineSkill({ id: 'doc_level', label: '篇章级标注', file: 'skills/shared/doc_level.md',
    describes: '跨句时序、情态、共指依赖' }),
];

const SKILL_COLOR = {
  discourse: '#7c6cf0', predicate: '#e0603a', arguments: '#2f9e6e',
  np_phrase: '#2b7fd4', special_entity: '#c08a1e', stop_test: '#8a8f98',
  reentrancy: '#b34ba0', doc_level: '#4a8fa8', '(stop)': '#8a8f98',
};

export default {
  id: 'umr',
  label: 'UMR（统一意义表示）',
  description: '串行标注：句子→树→树内结构再标注，每层展开由一个 skill 负责',
  skills: SKILLS,
  serial: true,
  themes: [
    { id: 'json', label: 'JSON' },
    { id: 'penman', label: 'Penman' },
  ],
  skillColor: (id) => SKILL_COLOR[id] || '#8a8f98',

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
      const empty = (sentence.tree || []).length === 0;
      return `<pre class="artifact empty-artifact">${empty
        ? '(尚未标注 — 在右侧「标注树」里点击第一个待处理节点开始)'
        : esc(sentence.graph || '(空)')}</pre>`;
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
      <div class="artifact-sub-title">篇章级标注 (doc-level)</div>
      <pre class="artifact">${esc(text)}</pre></div>`;
  },

  /** How a tree node labels itself. */
  nodeSummary(node) {
    const out = node.output || {};
    let detail = '';
    if (node.skill === 'discourse') {
      detail = out.has_discourse ? `并列/从属：${out.structure?.concept || (out.structure?.kind ? '从属' : '有')}` : '单句（无篇章关系）';
    } else if (node.skill === 'predicate') {
      detail = out.concept || (out.lemmas || []).join('/') || out.predicate_text || '';
    } else if (node.skill === 'reentrancy') {
      const n = (out.merge || []).length;
      detail = n ? `合并 ${n} 组同指` : '无同指';
    } else if (node.skill === 'doc_level') {
      const t = (out.temporal || []).length, m = (out.modal || []).length, c = (out.coref || []).length;
      detail = `时序${t} 情态${m} 共指${c}`;
    } else if (node.skill === 'stop_test') {
      detail = out.kind || '';
    } else {
      detail = out.concept || '';
    }
    return { title: node.span || '', detail };
  },

  legend: () => [
    { color: SKILL_COLOR.discourse, label: 'discourse', note: '篇章关系切分' },
    { color: SKILL_COLOR.predicate, label: 'predicate', note: '核心谓词/义项' },
    { color: SKILL_COLOR.arguments, label: 'arguments', note: '论元+属性（可再展开）' },
    { color: SKILL_COLOR.np_phrase, label: 'np_phrase', note: '名词短语（可再展开）' },
    { color: SKILL_COLOR.special_entity, label: 'special_entity', note: '日期/数量等' },
    { color: SKILL_COLOR.reentrancy, label: 'reentrancy', note: '句内同指' },
    { color: SKILL_COLOR.doc_level, label: 'doc_level', note: '跨句依赖' },
    { color: SKILL_COLOR['(stop)'], label: '(stop)', note: '停止分解（代码判定，未调用模型）' },
  ],
};

