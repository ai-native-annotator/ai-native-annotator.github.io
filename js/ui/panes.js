/**
 * The three content panes plus the legend strip that sits between the
 * before/after panes.
 *
 * The panes are format-agnostic shells: they own scrolling, headers and the
 * theme switch, and delegate the actual markup to the active format.
 */

import { state, set, currentSentence } from '../core/state.js';
import { el } from '../core/dom.js';
import { renderTree } from './tree.js';
import { sentenceDone } from '../core/pipeline.js';

export function renderSource(container, format) {
  const sentence = currentSentence();
  container.innerHTML = '';
  if (!sentence) return container.append(el('div', { class: 'empty' }, '未载入文档'));
  container.insertAdjacentHTML('beforeend', format.renderSource(sentence));
}

export function renderLegend(container, format) {
  container.innerHTML = '';
  const items = format.legend?.() || [];
  container.append(el('div', { class: 'legend-title' }, '图例'));
  for (const it of items) {
    container.append(el('div', { class: 'legend-item', title: it.note || '' },
      el('span', { class: 'legend-dot', style: `background:${it.color}` }),
      el('span', { class: 'legend-label' }, it.label),
      it.note ? el('span', { class: 'legend-note' }, it.note) : null));
  }
  container.append(el('div', { class: 'legend-foot' },
    format.serial ? '串行：可逐层展开，点击待运行节点标注' : '并行：技能相互独立，可任意顺序点击运行'));
}

export function renderAnnotated(container, format) {
  const sentence = currentSentence();
  container.innerHTML = '';
  if (!sentence) return container.append(el('div', { class: 'empty' }, '未载入文档'));

  const themes = format.themes || [];
  const bar = el('div', { class: 'pane-subbar' },
    el('span', { class: 'sub-label' }, '成品视图'),
    ...themes.map((t) => el('button', {
      class: `chip${state.theme === t.id ? ' on' : ''}`,
      onclick: () => set({ theme: t.id }, 'artifact'),
    }, t.label)));

  const artifact = el('div', { class: 'artifact-wrap' });
  const themeId = themes.some((t) => t.id === state.theme) ? state.theme : themes[0]?.id;
  artifact.insertAdjacentHTML('beforeend', format.renderArtifact(sentence, themeId));
  const extra = format.renderExtra?.(sentence);
  if (extra) artifact.insertAdjacentHTML('beforeend', extra);

  const treeHead = el('div', { class: 'pane-subbar' },
    el('span', { class: 'sub-label' }, '标注树（每个节点 = 一次 skill 调用）'),
    sentenceDone(sentence) ? el('span', { class: 'done-badge' }, '✓ 本句已完成') : null,
    el('span', { class: 'muted sm' }, `${countCalls(sentence.tree)} 次调用`));
  const tree = el('div', { class: 'tree-wrap' });

  container.append(bar, artifact, treeHead, tree);
  renderTree(tree, format);
}

function countCalls(nodes = []) {
  return nodes.reduce((n, x) => n + (x.pending ? 0 : 1) + countCalls(x.children), 0);
}

export function renderSentenceBar(container) {
  const doc = state.doc;
  container.innerHTML = '';
  if (!doc) return;
  container.append(el('span', { class: 'sub-label' }, '句子'));
  doc.sentences.forEach((s, i) => {
    const done = doc.format === 'umr' ? sentenceDone(s) : Object.keys(s.annotation || {}).length > 0;
    container.append(el('button', {
      class: `chip sentence-chip${i === state.selectedSentence ? ' on' : ''}${done ? ' done' : ''}`,
      title: s.text.slice(0, 60),
      onclick: () => set({ selectedSentence: i, selectedNode: null }, 'sentence'),
    }, String(s.index), done ? el('span', { class: 'chip-check' }, '✓') : null));
  });
  container.append(el('span', { class: 'doc-prov', title: doc.provenance || '' },
    doc.provenance?.startsWith('replay') ? '真实实验回放' :
    doc.provenance?.startsWith('imported') ? '导入 · 未标注' :
    doc.provenance?.startsWith('authored') ? '示例数据' : (doc.provenance || '')));
}
