/**
 * Format studio — describe an annotation format in words, get a working
 * renderer.
 *
 * Offline it derives the spec from keywords; in live mode the model fills in
 * the same declarative schema. Either way the result is a JSON spec you can
 * read, edit by hand, and commit — the renderer is built from the spec, so
 * the spec *is* the format definition.
 */

import { el, jsonHtml, download } from '../core/dom.js';
import { state } from '../core/state.js';
import { registerRuntimeFormat } from '../core/registry.js';
import { buildFormat, specFromDescription, specPrompt } from '../formats/declarative.js';
import { callProvider, PROVIDERS } from '../core/providers.js';
import { extractJson } from '../core/runner.js';
import { logInfo, logError, describeError } from '../core/log.js';

export function openStudio(onCreated) {
  const desc = el('textarea', {
    class: 'studio-desc', rows: 5,
    placeholder: '例如：命名实体识别。左边原文逐词一行显示，右边列出识别到的实体及其类型，'
      + '类型包括人名、地名、机构名，每种类型一个颜色。',
  });
  const idInput = el('input', { class: 'studio-id', placeholder: '格式 id（英文，如 ner）', value: '' });
  const preview = el('pre', { class: 'code studio-preview' }, '（尚未生成）');
  const status = el('span', { class: 'edit-status' });
  let spec = null;

  const generate = async () => {
    const text = desc.value.trim();
    const id = (idInput.value.trim() || 'custom').replace(/[^a-z0-9_-]/gi, '').toLowerCase();
    if (!text) { status.textContent = '请先写下格式描述'; status.className = 'edit-status err'; return; }
    status.textContent = '生成中…'; status.className = 'edit-status';
    try {
      if (state.runMode === 'live' && state.apiKeys[state.provider]) {
        logInfo('studio', `live: 生成格式规格 "${id}"`);
        const provider = state.provider;
        const text2 = await callProvider(provider, {
          apiKey: state.apiKeys[provider], model: state.models[provider] || PROVIDERS[provider]?.defaultModel,
          prompt: specPrompt(text, id),
        });
        spec = extractJson(text2);
        status.textContent = 'live 生成完成';
      } else {
        spec = specFromDescription(text, id);
        status.textContent = '本地模板生成完成（切换到 live 模式可得到更贴合描述的规格）';
      }
      spec.id = id;
      preview.innerHTML = jsonHtml(spec);
      status.className = 'edit-status ok';
    } catch (err) {
      logError('studio', `格式生成失败：${describeError(err)}`, err);
      status.textContent = '生成失败：' + err.message;
      status.className = 'edit-status err';
    }
  };

  const apply = () => {
    if (!spec) { status.textContent = '请先生成规格'; status.className = 'edit-status err'; return; }
    try {
      const edited = JSON.parse(preview.textContent);
      const format = registerRuntimeFormat(buildFormat(edited));
      close();
      onCreated?.(format);
    } catch (err) {
      status.textContent = '规格 JSON 无效：' + err.message;
      status.className = 'edit-status err';
    }
  };

  const overlay = el('div', { class: 'overlay', onclick: (e) => { if (e.target === overlay) close(); } },
    el('div', { class: 'modal' },
      el('div', { class: 'modal-head' },
        el('h3', {}, '用文字生成标注格式的显示方法'),
        el('button', { class: 'btn sm ghost', onclick: () => close() }, '关闭')),
      el('div', { class: 'modal-body' },
        el('div', { class: 'field' }, el('label', {}, '格式 id'), idInput),
        el('div', { class: 'field' }, el('label', {}, '用文字描述这个标注格式怎么显示'), desc),
        el('div', { class: 'modal-actions' },
          el('button', { class: 'btn', onclick: generate }, '生成规格'),
          el('button', { class: 'btn ghost', onclick: apply }, '应用为当前格式'),
          el('button', {
            class: 'btn ghost sm',
            onclick: () => spec && download(`format-${spec.id}.json`, JSON.stringify(spec, null, 2)),
          }, '导出规格'),
          status),
        el('div', { class: 'field' },
          el('label', {}, '生成的规格（可直接编辑后再应用）'),
          el('div', { class: 'editable-wrap' }, Object.assign(preview, { contentEditable: 'true' }))),
        el('div', { class: 'hint' },
          '规格是纯数据，不是可执行代码：可以读、可以改、可以提交到 git，'
          + '渲染器由规格构建而成。'),
      )));

  const close = () => overlay.remove();
  document.body.append(overlay);
  desc.focus();
}
