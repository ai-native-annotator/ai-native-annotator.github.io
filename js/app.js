/**
 * Bootstrap + wiring.
 *
 * Keeps every pane subscribed to the state keys it depends on, so a change
 * anywhere re-renders exactly the panes that care and nothing else.
 */

import { state, set, on, loadPersisted, persist } from './core/state.js';
import { loadFormat, getFormat, listFormats, availableFormatIds } from './core/registry.js';
import { loadSecrets } from './core/settings.js';
import { $, el } from './core/dom.js';
import { renderSource, renderAnnotated, renderLegend, renderSentenceBar } from './ui/panes.js';
import { renderTree, expandAll } from './ui/tree.js';
import { renderAssistant } from './ui/assistant.js';
import { renderChat, exportProposals } from './ui/chat.js';
import { openStudio } from './ui/studio.js';
import { toast } from './ui/toast.js';
import { mountLogPanel } from './ui/log-panel.js';
import { openSettings, mountSettingsButton } from './ui/settings-panel.js';
import { mountGithubButton } from './ui/github-panel.js';
import {
  listDemos, loadDemo, openLocalFile, parseDocument, exportDocumentFile,
} from './io/sources.js';
import { importFromDrive } from './io/drive.js';
import { PROVIDERS } from './core/providers.js';
import { logInfo, logError, describeError } from './core/log.js';

const panes = {};

async function boot() {
  loadPersisted();
  loadSecrets();
  cacheNodes();
  wireToolbar();
  wireMenus();
  mountLogPanel();
  mountSettingsButton();
  mountGithubButton(async (doc) => { await useDoc(doc); });
  subscribe();

  await loadFormat('umr');
  await loadFormat('sentiment');

  try {
    state.docIndex = await listDemos();
  } catch (err) {
    logError('app', `演示语料索引加载失败：${describeError(err)}`, err);
    toast('演示语料索引加载失败：' + err.message, true);
  }
  fillDocSelect();
  fillFormatSelect();
  updateModeUi();

  const first = state.docIndex.find((d) => d.format === state.formatId) || state.docIndex[0];
  if (first) await openDoc(first.id);
  else renderAll();
  logInfo('app', '就绪');
}

function cacheNodes() {
  panes.source = $('#pane-source');
  panes.legend = $('#legend');
  panes.annotated = $('#pane-annotated');
  panes.assistant = $('#pane-assistant');
  panes.chat = $('#pane-chat');
  panes.sentences = $('#sentence-bar');
}

function activeFormat() {
  return getFormat(state.formatId) || getFormat('umr');
}

function renderAll() {
  const f = activeFormat();
  if (!f) return;
  renderSentenceBar(panes.sentences);
  renderSource(panes.source, f);
  renderLegend(panes.legend, f);
  renderAnnotated(panes.annotated, f);
  renderAssistant(panes.assistant, f);
  renderChat(panes.chat, f);
}

function subscribe() {
  on('doc', () => renderAll());
  on('sentence', () => {
    const f = activeFormat();
    expandAll();
    renderSentenceBar(panes.sentences);
    renderSource(panes.source, f);
    renderAnnotated(panes.annotated, f);
    renderAssistant(panes.assistant, f);
  });
  on('tree', () => { renderAnnotated(panes.annotated, activeFormat()); renderSentenceBar(panes.sentences); });
  on('artifact', () => renderAnnotated(panes.annotated, activeFormat()));
  on('selectedNode', () => {
    const f = activeFormat();
    renderAnnotated(panes.annotated, f);
    renderAssistant(panes.assistant, f);
    renderChat(panes.chat, f);
  });
  on('chat', () => renderChat(panes.chat, activeFormat()));
  on('voice', () => renderChat(panes.chat, activeFormat()));
  on('format', () => renderAll());
  on('runMode', () => { persist(); renderAll(); updateModeUi(); });
  on('provider', () => { persist(); updateModeUi(); });
  on('apiKeys', () => updateModeUi());
  on('models', () => updateModeUi());
}

async function openDoc(id) {
  try {
    const doc = await loadDemo(id);
    await useDoc(doc);
  } catch (err) {
    logError('app', `载入失败：${describeError(err)}`, err);
    toast('载入失败：' + err.message, true);
  }
}

async function useDoc(doc) {
  if (doc.format && doc.format !== state.formatId) {
    try { await loadFormat(doc.format); state.formatId = doc.format; fillFormatSelect(); }
    catch { /* keep current format; renderers degrade to JSON */ }
  }
  const f = activeFormat();
  state.theme = (f.themes || []).some((t) => t.id === state.theme) ? state.theme : f.themes?.[0]?.id;
  set({
    doc, selectedSentence: 0, selectedNode: null,
    edits: new Map(), proposals: [], chat: [],
  }, 'doc');
  expandAll();
  set({}, 'tree');
  const sel = $('#doc-select');
  if ([...sel.options].some((o) => o.value === doc.id)) sel.value = doc.id;
  else sel.value = '';
  logInfo('app', `已载入文档「${doc.id}」`);
}

function fillDocSelect() {
  const sel = $('#doc-select');
  sel.innerHTML = '';
  sel.append(el('option', { value: '', disabled: '' }, '（导入的文档）'));
  for (const d of state.docIndex) {
    sel.append(el('option', { value: d.id }, `${d.title} · ${d.sentences} 句`));
  }
}

function fillFormatSelect() {
  const sel = $('#format-select');
  sel.innerHTML = '';
  const ids = new Set([...availableFormatIds(), ...listFormats().map((f) => f.id)]);
  for (const id of ids) {
    const f = getFormat(id);
    sel.append(el('option', { value: id }, f ? f.label : id));
  }
  sel.value = state.formatId;
}

function updateModeUi() {
  const label = $('#provider-indicator');
  if (!label) return;
  const meta = PROVIDERS[state.provider];
  if (state.runMode === 'live') {
    const hasKey = Boolean((state.apiKeys[state.provider] || '').trim());
    label.textContent = hasKey ? `live · ${meta?.label || state.provider}` : 'live · 未设置 API Key';
    label.className = `provider-indicator${hasKey ? '' : ' warn'}`;
  } else {
    label.textContent = 'replay';
    label.className = 'provider-indicator';
  }
}

async function importSample(lang) {
  const path = `data/samples/drive-import-demo-${lang}.txt`;
  toast('正在模拟 Google Drive 导入未标注 UMR 文件…');
  logInfo('app', `模拟 Drive 导入：${path}`);
  const res = await fetch(path);
  if (!res.ok) throw new Error(`示例文件缺失：${path}`);
  const text = await res.text();
  state.formatId = 'umr';
  const doc = parseDocument(text, `drive-import-demo-${lang}.umr.txt`);
  doc.provenance = 'imported: 模拟 Google Drive 导入（未标注 UMR 文件，标注后文件为空）';
  await useDoc(doc);
  toast('已导入未标注文档 —— 在右侧标注树里点击「待运行」节点，逐个 skill 完成标注。');
}

function wireToolbar() {
  $('#format-select').onchange = async (e) => {
    await loadFormat(e.target.value).catch(() => {});
    state.formatId = e.target.value;
    persist();
    const f = activeFormat();
    state.theme = f.themes?.[0]?.id || 'json';
    const match = state.docIndex.find((d) => d.format === state.formatId);
    if (match) await openDoc(match.id); else set({}, 'format');
  };
  $('#doc-select').onchange = (e) => { if (e.target.value) openDoc(e.target.value); };

  $('#btn-local').onclick = async () => {
    try { await useDoc(await openLocalFile()); } catch (err) { logError('app', describeError(err), err); toast(err.message, true); }
  };
  $('#btn-drive').onclick = async () => {
    try { await useDoc(await importFromDrive()); } catch (err) { logError('app', describeError(err), err); toast(err.message, true); }
  };
  $('#btn-drive-demo-en').onclick = () => importSample('en').catch((err) => { logError('app', describeError(err), err); toast(err.message, true); });
  $('#btn-drive-demo-zh').onclick = () => importSample('zh').catch((err) => { logError('app', describeError(err), err); toast(err.message, true); });

  $('#btn-export').onclick = () => { if (!exportDocumentFile()) toast('还没有载入文档', true); };
  $('#btn-proposals').onclick = exportProposals;
  $('#btn-studio').onclick = () => openStudio((format) => {
    fillFormatSelect();
    $('#format-select').value = format.id;
    state.formatId = format.id;
    state.theme = format.themes?.[0]?.id;
    set({}, 'format');
    toast(`已应用生成的格式：${format.label}`);
  });

  const modeSel = $('#mode-select');
  modeSel.value = state.runMode;
  modeSel.onchange = (e) => {
    if (e.target.value === 'live' && !state.apiKeys[state.provider]) {
      toast('live 模式需要先在设置里填好 API Key', true);
      openSettings();
    }
    set({ runMode: e.target.value }, 'runMode');
  };
}

function wireMenus() {
  for (const btn of document.querySelectorAll('[data-menu]')) {
    const menu = document.getElementById(btn.dataset.menu);
    btn.onclick = (e) => {
      e.stopPropagation();
      const isOpen = menu.classList.contains('show');
      document.querySelectorAll('.dropdown-menu.show').forEach((m) => m.classList.remove('show'));
      if (!isOpen) menu.classList.add('show');
    };
  }
  document.addEventListener('click', () => {
    document.querySelectorAll('.dropdown-menu.show').forEach((m) => m.classList.remove('show'));
  });
}

boot();
