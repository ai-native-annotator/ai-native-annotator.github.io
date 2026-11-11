/**
 * index.html: SkillParseUMR's decision-orchestration procedures (Jev + Haiku), run one step at a
 * time in the browser; each step is confirmed by the person before its sentence runs the next.
 *
 *   py-worker.js  Pyodide with the SkillParseUMR sources (data/skillparse/) and bridge/sp_bridge.py
 *   core.js       state, running steps (Jev rounds, LLM calls with tools), corrections
 *   pane-*.js     context (waves, for_each, windows) · skills · generated + steps · AI reflection
 *   reflect.js    skill problems from a correction or a description, and the edits that fix them
 */

import { bootPython, onProgress } from './py.js';
import { S, SKILLSETS, loadDocs, render, onRender, setRestoreAsker, status, stop, runNextAll, saveNow } from './core.js';
import { openSettings, openImport, exportAs, askRestore, fillSelectors, reopen } from './dialogs.js';
import { allImports, lastOpen } from './save.js';
import { py } from './py.js';
import { MODEL_CHOICES, DEFAULT_CHOICE, currentChoice, pickModel, route } from './models.js';
import { closeModal, openModal, toast, h } from './ui.js';
import { renderMarkdown } from './md.js';
import { setupFolding, relabelFolding } from './layout.js';
import { applyStatic, getLang, setLang, t } from './i18n.js';
import './pane-context.js';
import './pane-skills.js';
import './pane-work.js';
import './pane-ai.js';
import './timer.js';

function wire() {
  setupFolding();
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !document.getElementById('modal').hidden) closeModal(); });
  document.getElementById('btn-settings').addEventListener('click', openSettings);
  // what the workbench does, for its users (data/skillparse/FEATURES.<lang>.md)
  document.getElementById('btn-features').addEventListener('click', async () => {
    try {
      const res = await fetch(`data/skillparse/FEATURES.${getLang() === 'en' ? 'en' : 'zh'}.md`, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      openModal(t('features'), h('div', { class: 'md-view features' }, renderMarkdown(await res.text())));
    } catch (err) {
      toast(err.message);
    }
  });
  document.getElementById('model-pick').addEventListener('change', (e) => {
    const r = pickModel(e.target.value, pickRole());
    fillModels();
    render();
    toast(r ? t('modelPicked', { model: r.model, via: t(`via.${r.provider}`) }) : t('modelNoKey'));
  });
  document.addEventListener('settings-changed', fillModels);
  onRender(() => { if (document.getElementById('model-pick').dataset.role !== pickRole()) fillModels(); });
  document.getElementById('btn-import').addEventListener('click', openImport);
  document.getElementById('btn-stop').addEventListener('click', stop);
  document.getElementById('btn-next-all').addEventListener('click', () => runNextAll().catch(fail));
  document.getElementById('btn-export-umr').addEventListener('click', () => exportAs('umr').catch(fail));
  const menu = document.getElementById('menu-export');
  document.getElementById('btn-export').addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; });
  document.addEventListener('click', () => { menu.hidden = true; });
  menu.querySelectorAll('[data-export]').forEach((b) => b.addEventListener('click', () => exportAs(b.dataset.export).catch((err) => toast(err.message))));
  const lang = document.getElementById('btn-lang');
  lang.textContent = getLang() === 'zh' ? 'EN' : '中文';
  lang.addEventListener('click', () => {
    setLang(getLang() === 'zh' ? 'en' : 'zh');
    lang.textContent = getLang() === 'zh' ? 'EN' : '中文';
    applyStatic();
    relabelFolding();
    fillModels();
    render();
  });
  document.getElementById('skillset').addEventListener('change', async (e) => {
    const meta = SKILLSETS.find((s) => s.id === e.target.value);
    const doc = S.docs.find((d) => d.lang === meta.lang && d.id === S.doc) ? S.doc : (S.docs.find((d) => d.lang === meta.lang) || S.docs[0]).id;
    await reopen(e.target.value, doc).catch(fail);
  });
  // a document in the other language opens with that language's procedure
  document.getElementById('doc').addEventListener('change', (e) => {
    const lang = S.docs.find((d) => d.id === e.target.value)?.lang;
    const meta = SKILLSETS.find((s) => s.id === S.skillset);
    const skillset = lang && meta.lang !== lang ? (SKILLSETS.find((s) => s.lang === lang) || meta).id : S.skillset;
    reopen(skillset, e.target.value).catch(fail);
  });
  document.addEventListener('docs-changed', (e) => {
    const lang = S.docs.find((d) => d.id === e.detail)?.lang;
    const skillset = (SKILLSETS.find((s) => s.lang === lang) || SKILLSETS.find((s) => s.id === S.skillset)).id;
    reopen(skillset, e.detail).catch(fail);
  });
}

/** The toolbar's model menu: which model runs the agent skills from the next step on. */
/** The model picker is for the wave shown: wave 0's own model (umr_generate), else the agent skills'. */
const pickRole = () => (S.desc?.waves?.[0]?.name === S.wave && S.wave === 'generate' ? 'generate' : 'haiku');
function fillModels() {
  const sel = document.getElementById('model-pick');
  const role = pickRole();
  const now = currentChoice(role);
  // every model, by maker; one no key reaches says so (it can still be picked, for a key to come)
  const opt = (c) => h('option', { value: c.id, selected: now?.id === c.id,
    text: `${c.label}${c.id === DEFAULT_CHOICE[role] ? `（${t('defaultTag')}）` : ''}${route(c.id) ? '' : ` · ${t('needsKey')}`}` });
  sel.replaceChildren(
    h('optgroup', { label: 'Anthropic' }, MODEL_CHOICES.filter((c) => c.maker === 'anthropic').map(opt)),
    h('optgroup', { label: 'OpenAI' }, MODEL_CHOICES.filter((c) => c.maker === 'openai').map(opt)));
  const r = now && route(now.id);
  sel.title = `${t(role === 'generate' ? 'modelPickGen' : 'modelPickTitle')} · ${r ? `${r.model} · ${t(`via.${r.provider}`)}` : t('needsKey')}`;
  sel.dataset.role = role;
}

function fail(err) {
  console.error(err);
  status(`${t('error')}: ${err.message}`);
  toast(err.message, 8000);
}

async function boot() {
  document.body.classList.add('booted');
  setLang(getLang());
  applyStatic();
  wire();
  fillModels();
  setRestoreAsker(askRestore);
  // keep the work when the page is left or hidden (a pending save would otherwise be lost)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(); });
  window.addEventListener('pagehide', () => saveNow());
  status(t('booting'));
  onProgress((text) => status(text));
  const info = await bootPython();
  console.info('SkillParse Python ready', info);
  // the documents imported in this browser: the page's Python starts with only the samples
  for (const rec of await allImports()) {
    await py('import_doc', { name: rec.name, text: rec.text, fmt: rec.fmt, ...(rec.lang ? { lang: rec.lang } : {}) })
      .catch((err) => console.warn('re-import', rec.name, err));
  }
  await loadDocs();
  const params = new URLSearchParams(location.search);
  const last = lastOpen();
  const skillset = SKILLSETS.some((s) => s.id === params.get('skills')) ? params.get('skills')
    : SKILLSETS.some((s) => s.id === last?.skillset) && !params.get('doc') ? last.skillset : SKILLSETS[0].id;
  const want = params.get('doc') || last?.doc;
  const lang = SKILLSETS.find((s) => s.id === skillset).lang;
  const doc = (S.docs.find((d) => d.id === want) || S.docs.find((d) => d.lang === lang) || S.docs[0]).id;
  // a document asked for in the address opens with the procedure of its language (unless one is asked for too)
  const docLang = S.docs.find((d) => d.id === doc)?.lang;
  const fits = params.get('skills') || !params.get('doc') || !docLang ? skillset
    : (SKILLSETS.find((s) => s.lang === docLang) || SKILLSETS.find((s) => s.id === skillset)).id;
  await reopen(fits, doc);
}

boot().catch(fail);
