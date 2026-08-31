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
import { t, applyStaticI18n, toggleLang, detectLang } from './core/i18n.js';

const panes = {};

async function boot() {
  loadPersisted();
  // first run: follow the browser's language until the user chooses one
  if (!localStorage.getItem('annotator')) state.lang = detectLang();
  applyStaticI18n();
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
    logError('app', t('app.docIndexFailed', { err: describeError(err) }), err);
    toast(t('app.docIndexFailed', { err: err.message }), true);
  }
  fillDocSelect();
  fillFormatSelect();
  updateModeUi();

  const first = state.docIndex.find((d) => d.format === state.formatId) || state.docIndex[0];
  if (first) await openDoc(first.id);
  else renderAll();
  // Reaching here is the only proof the app is actually wired up; until now the
  // page has been showing the boot-failure banner from index.html.
  document.getElementById('boot-error')?.remove();
  logInfo('app', t('app.ready'));
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
  on('lang', () => {
    applyStaticI18n();       // static markup carrying data-i18n
    fillDocSelect(); fillFormatSelect(); updateModeUi();
    renderAll();             // every pane rebuilds its own strings through t()
  });
}

async function openDoc(id) {
  try {
    const doc = await loadDemo(id);
    await useDoc(doc);
  } catch (err) {
    logError('app', t('app.loadFailed', { err: describeError(err) }), err);
    toast(t('app.loadFailed', { err: err.message }), true);
  }
}

async function useDoc(doc) {
  if (doc.format && doc.format !== state.formatId) {
    try { await loadFormat(doc.format); state.formatId = doc.format; fillFormatSelect(); }
    catch { /* keep current format; renderers degrade to JSON */ }
  }
  const f = activeFormat();
  state.theme = (f.themes || []).some((th) => th.id === state.theme) ? state.theme : f.themes?.[0]?.id;
  set({
    doc, selectedSentence: 0, selectedNode: null,
    edits: new Map(), proposals: [], chat: [],
  }, 'doc');
  expandAll();
  set({}, 'tree');
  const sel = $('#doc-select');
  if ([...sel.options].some((o) => o.value === doc.id)) sel.value = doc.id;
  else sel.value = '';
  logInfo('app', t('app.docLoaded', { id: doc.id }));
}

function fillDocSelect() {
  const sel = $('#doc-select');
  sel.innerHTML = '';
  sel.append(el('option', { value: '', disabled: '' }, t('app.importedDocs')));
  for (const d of state.docIndex) {
    sel.append(el('option', { value: d.id }, t('app.demoOption', { title: d.title, n: d.sentences })));
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
    label.textContent = hasKey ? `live · ${meta?.label || state.provider}` : t('app.liveNoKey');
    label.className = `provider-indicator${hasKey ? '' : ' warn'}`;
  } else {
    label.textContent = 'replay';
    label.className = 'provider-indicator';
  }
}

const SAMPLES = {
  en: 'data/samples/drive-import-demo-en.txt',
  zh: 'data/samples/drive-import-demo-zh.txt',
  wiki: 'data/samples/wikipedia-roman-telescope-2026.txt',
};

async function importSample(lang) {
  const path = SAMPLES[lang];
  toast(t('app.sampleImporting'));
  logInfo('app', `simulated Drive import: ${path}`);
  const res = await fetch(path);
  if (!res.ok) throw new Error(t('app.sampleMissing', { path }));
  const text = await res.text();
  state.formatId = 'umr';
  const doc = parseDocument(text, path.split('/').pop());
  doc.provenance = 'imported: simulated Google Drive import (unannotated UMR file)';
  await useDoc(doc);
  toast(t('app.sampleDone'));
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
  $('#btn-drive-demo-wiki').onclick = () => importSample('wiki').catch((err) => { logError('app', describeError(err), err); toast(err.message, true); });

  $('#btn-export').onclick = () => { if (!exportDocumentFile()) toast(t('app.noDoc'), true); };
  $('#btn-proposals').onclick = exportProposals;
  $('#btn-studio').onclick = () => openStudio((format) => {
    fillFormatSelect();
    $('#format-select').value = format.id;
    state.formatId = format.id;
    state.theme = format.themes?.[0]?.id;
    set({}, 'format');
    toast(t('studio.applied', { label: format.label }));
  });

  $('#btn-lang').onclick = () => toggleLang();

  const modeSel = $('#mode-select');
  modeSel.value = state.runMode;
  modeSel.onchange = (e) => {
    if (e.target.value === 'live' && !state.apiKeys[state.provider]) {
      toast(t('app.needKey'), true);
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

boot().catch((err) => {
  // A boot that throws leaves a fully-rendered but dead page. Say so in the
  // banner rather than letting every button quietly do nothing.
  const why = document.getElementById('boot-error-why');
  if (why) why.textContent = `boot() 抛错：${err?.message || err}  ·  boot() threw: ${err?.message || err}`;
  console.error('[app] boot failed', err);
});
