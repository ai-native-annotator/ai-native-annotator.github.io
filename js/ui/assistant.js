/**
 * AI annotation assistant pane.
 *
 * Shows the selected skill call end to end — which skill ran, what it was
 * given, what it produced, and why — and lets a human override the output.
 * The override is the entry point for the rationale-clash loop: a human edit
 * without a stated reason is just a patch, but an edit *plus* a rationale is
 * evidence that the skill's instructions are wrong, which the chat pane turns
 * into a skill-update proposal.
 */

import { state, set, pathKey } from '../core/state.js';
import { el, jsonHtml, fmtMs } from '../core/dom.js';
import { toast } from './toast.js';

export function renderAssistant(container, format) {
  const sel = state.selectedNode;
  container.innerHTML = '';

  if (!sel) {
    container.append(el('div', { class: 'empty' },
      '在中间的标注树里点一个「待运行」节点来标注，或点一个已完成的节点查看它的输入 / 输出 / 判断依据。'));
    return;
  }

  const { node, path } = sel;
  if (!node || node.pending) { container.append(el('div', { class: 'empty' }, '这一步还没有结果。')); return; }
  const key = pathKey(path);
  const def = (format.skills || []).find((s) => s.id === node.skill);
  const edited = state.edits.get(key);
  const shown = edited ?? node.output;

  container.append(
    el('div', { class: 'assist-head' },
      el('span', { class: 'skill-chip lg', style: `--c:${format.skillColor?.(node.skill) || '#888'}` },
         node.skill),
      def ? el('span', { class: 'skill-label' }, def.label) : null,
      el('span', { class: `src-badge ${node.source || 'replay'}` }, sourceText(node)),
    ),
    def?.describes ? el('div', { class: 'skill-desc' }, def.describes) : null,
    def?.file ? el('div', { class: 'skill-file' }, `技能定义：${def.file}`) : null,

    section('作用范围 (span)', el('div', { class: 'span-box' }, node.span || '—')),
    section('输入 (input)', el('pre', { class: 'code sm' }, node.input || '—')),
    section('输出 (output)' + (edited ? ' — 人工已修改' : ''),
      el('pre', { class: `code${edited ? ' edited' : ''}`, html: jsonHtml(shown) })),
    node.rationale
      ? section('模型判断依据 (model rationale)',
          el('div', { class: 'rationale model' }, node.rationale))
      : null,
    editor(key, shown, node),
  );
}

function sourceText(node) {
  if (node.source === 'live') return `live${node.model ? ' · ' + node.model : ''}${node.latencyMs ? ' · ' + fmtMs(node.latencyMs) : ''}`;
  if (node.source === 'rule') return '代码规则（未调用模型）';
  return 'replay';
}

function section(title, body) {
  return el('div', { class: 'assist-section' },
    el('div', { class: 'assist-title' }, title), body);
}

function editor(key, shown, node) {
  const ta = el('textarea', {
    class: 'edit-box',
    spellcheck: 'false',
    rows: 6,
  }, JSON.stringify(shown, null, 2));

  const status = el('span', { class: 'edit-status' });

  const apply = () => {
    try {
      const parsed = JSON.parse(ta.value);
      state.edits.set(key, parsed);
      set({}, 'selectedNode', 'tree', 'artifact');
      toast('已保存人工修改（原始记录保持不变）— 请在下方说明理由以生成 skill 提案');
    } catch (err) {
      status.textContent = 'JSON 解析失败：' + err.message;
      status.className = 'edit-status err';
    }
  };

  const reset = () => {
    state.edits.delete(key);
    set({}, 'selectedNode', 'tree', 'artifact');
    toast('已还原为模型输出');
  };

  return el('details', { class: 'editor', ...(state.edits.has(key) ? { open: '' } : {}) },
    el('summary', {}, '人工修改'),
    el('div', { class: 'edit-hint' },
      '改完请在下方对话框写下你的理由——系统会把它与模型的 rationale 做对照，产出 skill 更新提案。'),
    ta,
    el('div', { class: 'edit-actions' },
      el('button', { class: 'btn sm', onclick: apply }, '保存修改'),
      el('button', { class: 'btn sm ghost', onclick: reset }, '还原'),
      status),
  );
}
