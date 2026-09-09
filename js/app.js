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
import { renderSource, renderAnnotated, renderSentenceBar } from './ui/panes.js';
import { renderSkillPanel } from './ui/skill-panel.js';
import { renderTree, expandAll } from './ui/tree.js';
import { renderAssistant } from './ui/assistant.js';
import { renderChat, exportProposals } from './ui/chat.js';
import { openStudio } from './ui/studio.js';
import { openImporterPanel } from './ui/importer-panel.js';
import { toast } from './ui/toast.js';
import { mountLogPanel } from './ui/log-panel.js';
import { openSettings, mountSettingsButton } from './ui/settings-panel.js';
import { mountGithubButton } from './ui/github-panel.js';
import {
  listDemos, loadDemo, openLocalFile, importDocument, exportDocumentFile,
} from './io/sources.js';
import { initWork, stashWork, restoreWork, workedFormats } from './core/work.js';
import { importFromDrive } from './io/drive.js';
import { PROVIDERS } from './core/providers.js';
import { logInfo, logError, describeError } from './core/log.js';
import { t, applyStaticI18n, setLang, loadLocale, detectLang, LOCALES } from './core/i18n.js';

const panes = {};

/**
 * Name the step we are about to attempt, on `window` so the plain inline script
 * in index.html can read it without importing anything.
 *
 * "js/app.js did not finish boot()" is barely more useful than silence: it says
 * something broke but not what, and boot can stop for reasons that never reach
 * a catch (a fetch that hangs rather than fails). With the step recorded, the
 * banner can say *where* it stopped, which is the whole difference between a
 * bug report we can act on and one we cannot.
 */
function step(name) {
  window.__bootStep = name;
  const node = document.getElementById('boot-step');
  if (node) node.textContent = name;
}

async function boot() {
  step('loadPersisted');
  loadPersisted();
  // first run: follow the browser's language until the user chooses one
  if (!localStorage.getItem('annotator')) state.lang = detectLang();
  // A file-backed locale has to be in hand before the first paint, or the UI
  // renders in English and then flips, which reads as a bug.
  step('loadLocale');
  await loadLocale(state.lang);
  step('applyStaticI18n');
  applyStaticI18n();
  step('loadSecrets');
  loadSecrets();
  step('cacheNodes');
  cacheNodes();
  step('wireToolbar');
  wireToolbar();
  step('wireMenus');
  wireMenus();
  step('mountLogPanel');
  mountLogPanel();
  step('mountSettingsButton');
  mountSettingsButton();
  step('mountGithubButton');
  mountGithubButton(async (doc) => { await useDoc(doc); });
  step('subscribe');
  subscribe();

  step("loadFormat('umr')  [fetch js/formats/umr.js]");
  await loadFormat('umr');
  step("loadFormat('sentiment')  [fetch js/formats/sentiment.js]");
  await loadFormat('sentiment');
  // Loaded up front so the picker can show every method by its real name: the
  // point of the picker is choosing how to annotate what you have open, and a
  // list with one entry reading "refine" because its module has not been
  // fetched yet reads like a bug.
  step("loadFormat('refine')  [fetch js/formats/refine.js]");
  await loadFormat('refine');

  step('listDemos()  [fetch data/demo/index.json]');
  try {
    state.docIndex = await listDemos();
  } catch (err) {
    logError('app', t('app.docIndexFailed', { err: describeError(err) }), err);
    toast(t('app.docIndexFailed', { err: err.message }), true);
  }
  step('fillDocSelect / fillFormatSelect / updateModeUi');
  fillDocSelect();
  fillFormatSelect();
  updateModeUi();

  const first = state.docIndex.find((d) => d.format === state.formatId) || state.docIndex[0];
  step(first ? `openDoc('${first.id}')  [fetch data/demo/${first.id}.json]` : 'renderAll');
  if (first) await openDoc(first.id);
  else renderAll();
  // Reaching here is the only proof the app is actually wired up; until now the
  // page has been showing the boot-failure banner from index.html.
  step('done');
  document.getElementById('boot-error')?.remove();
  logInfo('app', t('app.ready'));
}

function cacheNodes() {
  const need = {
    source: '#pane-source', legend: '#legend', annotated: '#pane-annotated',
    assistant: '#pane-assistant', chat: '#pane-chat', sentences: '#sentence-bar',
  };
  for (const [name, sel] of Object.entries(need)) {
    panes[name] = $(sel);
    if (!panes[name]) { missingNodes.push(sel); logError('app', t('app.missingNode', { sel })); }
  }
}

function activeFormat() {
  return getFormat(state.formatId) || getFormat('umr');
}

/**
 * Repaint every pane. Each call is guarded on its own container so one absent
 * pane costs that pane and nothing else — the same rule as wire(): a missing
 * element must never take the rest of the app down with it.
 */
function renderAll() {
  const f = activeFormat();
  if (!f) return;
  if (panes.sentences) renderSentenceBar(panes.sentences, f);
  if (panes.source) renderSource(panes.source, f);
  if (panes.legend) renderSkillPanel(panes.legend, f);
  if (panes.annotated) renderAnnotated(panes.annotated, f);
  if (panes.assistant) renderAssistant(panes.assistant, f);
  if (panes.chat) renderChat(panes.chat, f);
}

function subscribe() {
  on('doc', () => renderAll());
  on('sentence', () => {
    const f = activeFormat();
    expandAll();
    renderSentenceBar(panes.sentences, f);
    renderSource(panes.source, f);
    renderAnnotated(panes.annotated, f);
    renderAssistant(panes.assistant, f);
  });
  on('tree', () => { const f = activeFormat(); renderAnnotated(panes.annotated, f); renderSentenceBar(panes.sentences, f); });
  on('artifact', () => renderAnnotated(panes.annotated, activeFormat()));
  // a skill amendment accepted in the chat changes what the next call sends,
  // so the pane that shows that skill has to repaint at once
  // a skill amendment or a new journal entry changes what the skill panel and
  // the assistant show, so both repaint
  on('skills', () => {
    renderAssistant(panes.assistant, activeFormat());
    if (panes.legend) renderSkillPanel(panes.legend, activeFormat());
  });
  on('reflection', () => { if (panes.legend) renderSkillPanel(panes.legend, activeFormat()); });
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

/**
 * Open a document. `doc.format` says how the annotation in the file was made,
 * so it is worth following — opening the recorded sentiment demo should show
 * you that recording rather than an empty pane. It is a fact about the file,
 * not a restriction on the text: a raw import carries no format at all and is
 * annotated with whatever method is already selected, and either way every
 * other method stays one click away (see core/work.js).
 */
async function useDoc(doc) {
  initWork(doc);
  if (doc.format && doc.format !== state.formatId) {
    try { await loadFormat(doc.format); state.formatId = doc.format; fillFormatSelect(); persist(); }
    catch { /* keep current format; renderers degrade to JSON */ }
  }
  const f = activeFormat();
  state.theme = (f.themes || []).some((th) => th.id === state.theme) ? state.theme : f.themes?.[0]?.id;
  // Assigned without emitting, then restored, then painted once: repainting
  // between the two would show the document with the *previous* method's work
  // still on screen for a frame.
  Object.assign(state, {
    doc, selectedSentence: 0, selectedNode: null, selectedPass: null,
    edits: new Map(), proposals: [], chats: {},
  });
  restoreWork(doc, state.formatId, f);
  fillFormatSelect();          // which methods this document already has work in
  expandAll();
  set({}, 'doc');
  const sel = $('#doc-select');
  if ([...sel.options].some((o) => o.value === doc.id)) sel.value = doc.id;
  else sel.value = '';
  logInfo('app', t('app.docLoaded', { id: doc.id }));
}

/**
 * Change the method applied to the document you are on — not the document.
 *
 * The picker used to hunt the demo index for a document whose `format` matched
 * and open that instead, which meant choosing a method silently discarded the
 * text you were annotating. Nothing about a sentence requires one method, so
 * the sentence stays and the method changes: the outgoing work is parked, the
 * incoming work is restored (or started fresh), and switching back and forth
 * costs nothing.
 */
async function switchFormat(id) {
  if (id === state.formatId) return;
  try { await loadFormat(id); } catch (err) {
    logError('app', t('app.formatFailed', { id, err: describeError(err) }), err);
    toast(t('app.formatFailed', { id, err: err.message }), true);
    const sel = $('#format-select');
    if (sel) sel.value = state.formatId;
    return;
  }
  if (state.doc) stashWork(state.doc, state.formatId);
  state.formatId = id;
  persist();
  const f = activeFormat();
  state.theme = f.themes?.[0]?.id || 'json';
  if (state.doc) {
    restoreWork(state.doc, id, f);
    expandAll();
    logInfo('app', t('app.formatSwitched', { format: f.label, doc: state.doc.id }));
  }
  fillFormatSelect();          // the "has work" markers moved
  set({ selectedNode: null, selectedPass: null }, 'format');
}

/**
 * The language picker. Every locale's own name is written in that language
 * (中文, English, 日本語) — a picker that names a language in a language you
 * cannot read is no use — and a partially-translated locale says so, so the
 * user is not surprised by English text mid-pane.
 */
/**
 * Fold a column away. Four panes on one screen is a lot when you are reading a
 * long graph, and the one you need widest changes with the task — so each is
 * foldable, and which ones are folded is remembered.
 */
function togglePane(id) {
  if (!id) return;
  const folded = new Set(state.collapsed_panes || []);
  if (folded.has(id)) folded.delete(id); else folded.add(id);
  // Never let the last pane be folded: an empty workspace is not a view.
  if (folded.size >= 4) { toast(t('pane.keepOne'), true); return; }
  set({ collapsed_panes: [...folded] });
  persist();
  applyCollapsed();
}

function applyCollapsed() {
  const ws = $('#workspace');
  if (!ws) return;
  const folded = new Set(state.collapsed_panes || []);
  for (const id of ['source', 'skills', 'annotated', 'assistant']) {
    ws.classList.toggle(`c-${id}`, folded.has(id));
    const pane = ws.querySelector(`[data-pane="${id}"]`);
    if (pane) pane.classList.toggle('collapsed', folded.has(id));
  }
}

function fillLangSelect() {
  const sel = $('#lang-select');
  if (!sel) return;
  sel.innerHTML = '';
  for (const loc of LOCALES) {
    const label = loc.coverage === 'partial' ? `${loc.name} (${t('lang.partial')})` : loc.name;
    sel.append(el('option', { value: loc.id, title: label }, loc.name));
  }
  sel.value = state.lang;
  const active = LOCALES.find((l) => l.id === state.lang);
  sel.title = active?.coverage === 'partial' ? t('lang.partial') : t('toolbar.langTitle');
}

function fillDocSelect() {
  const sel = $('#doc-select');
  if (!sel) return;                       // missing control, already reported by wire()
  sel.innerHTML = '';
  sel.append(el('option', { value: '', disabled: '' }, t('app.importedDocs')));
  for (const d of state.docIndex) {
    sel.append(el('option', { value: d.id }, t('app.demoOption', { title: d.title, n: d.sentences })));
  }
}

/**
 * The method picker. Every format is offered for whatever document is open —
 * a document is text, and any of these can be applied to it. Formats this
 * document already has work in are marked, so switching away and back is a
 * visible round trip rather than an act of faith.
 */
function fillFormatSelect() {
  const sel = $('#format-select');
  if (!sel) return;                       // missing control, already reported by wire()
  sel.innerHTML = '';
  const ids = new Set([...availableFormatIds(), ...listFormats().map((f) => f.id)]);
  const worked = new Set(state.doc ? workedFormats(state.doc) : []);
  for (const id of ids) {
    const f = getFormat(id);
    const label = f ? f.label : id;
    sel.append(el('option', { value: id },
      worked.has(id) && id !== state.formatId ? t('app.formatWorked', { label }) : label));
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
  // Deliberately no format change: an imported file is text, and the method
  // stays whatever the annotator chose. Forcing 'umr' here is what made
  // "import" mean "import as UMR".
  const doc = await importDocument(text, path.split('/').pop());
  doc.provenance = 'imported: simulated Google Drive import (unannotated file)';
  await useDoc(doc);
  toast(t('app.sampleDone'));
}

/**
 * Attach one handler, and never let a missing element take down the rest.
 *
 * These used to be bare `$('#id').onclick = …` in a row. A single element that
 * was not in the DOM — a stale cached index.html, a hand-edit, a typo — threw
 * on that line and every wiring *after* it silently never happened. The
 * language button sits near the end of the list, so the symptom was "the
 * English button does nothing" while the rest of the toolbar looked fine, with
 * nothing at all in the console. One missing button must cost exactly that one
 * button, and it must say so.
 */
function wire(selector, prop, handler) {
  const node = $(selector);
  if (!node) {
    missingNodes.push(selector);
    logError('app', t('app.missingNode', { sel: selector }));
    return null;
  }
  node[prop] = handler;
  return node;
}
const missingNodes = [];

function wireToolbar() {
  wire('#format-select', 'onchange', (e) => switchFormat(e.target.value));
  wire('#doc-select', 'onchange', (e) => { if (e.target.value) openDoc(e.target.value); });

  wire('#btn-local', 'onclick', async () => {
    try { await useDoc(await openLocalFile()); } catch (err) { logError('app', describeError(err), err); toast(err.message, true); }
  });
  wire('#btn-drive', 'onclick', async () => {
    try { await useDoc(await importFromDrive()); } catch (err) { logError('app', describeError(err), err); toast(err.message, true); }
  });
  const sample = (which) => () => importSample(which).catch((err) => { logError('app', describeError(err), err); toast(err.message, true); });
  wire('#btn-drive-demo-en', 'onclick', sample('en'));
  wire('#btn-drive-demo-zh', 'onclick', sample('zh'));
  wire('#btn-drive-demo-wiki', 'onclick', sample('wiki'));
  wire('#btn-importer', 'onclick', () => openImporterPanel(state.formatId));

  wire('#btn-export', 'onclick', () => { if (!exportDocumentFile()) toast(t('app.noDoc'), true); });
  wire('#btn-proposals', 'onclick', exportProposals);
  wire('#btn-studio', 'onclick', () => openStudio((format) => {
    fillFormatSelect();
    $('#format-select').value = format.id;
    if (state.doc) stashWork(state.doc, state.formatId);
    state.formatId = format.id;
    state.theme = format.themes?.[0]?.id;
    if (state.doc) { restoreWork(state.doc, format.id, format); expandAll(); }
    set({ selectedNode: null, selectedPass: null }, 'format');
    toast(t('studio.applied', { label: format.label }));
  }));

  for (const btn of document.querySelectorAll('.pane-toggle')) {
    btn.onclick = () => togglePane(btn.dataset.collapse);
  }
  applyCollapsed();

  const langSel = wire('#lang-select', 'onchange', async (e) => {
    await setLang(e.target.value);
    fillLangSelect();          // the option labels are themselves translated
  });
  if (langSel) fillLangSelect();

  const modeSel = wire('#mode-select', 'onchange', (e) => {
    if (e.target.value === 'live' && !state.apiKeys[state.provider]) {
      toast(t('app.needKey'), true);
      openSettings();
    }
    set({ runMode: e.target.value }, 'runMode');
  });
  if (modeSel) modeSel.value = state.runMode;

  if (missingNodes.length) toast(t('app.missingNodes', { n: missingNodes.length }), true);
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
  // banner, and name the step, rather than letting every button quietly do
  // nothing.
  const at = window.__bootStep || '(before the first step)';
  const why = document.getElementById('boot-error-why');
  if (why) {
    why.textContent = `boot() 在「${at}」这一步抛错：${err?.message || err}`
      + `  ·  boot() threw at step "${at}": ${err?.message || err}`;
  }
  console.error('[app] boot failed at step:', at, err);
});
