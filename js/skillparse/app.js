/**
 * index.html: SkillParseUMR's decision-orchestration procedures (Jev + Haiku), run one step at a
 * time in the browser.
 *
 *   py-worker.js  Pyodide with the SkillParseUMR sources (data/skillparse/) and bridge/sp_bridge.py
 *   core.js       state, running steps (Jev rounds, LLM calls with tools), corrections
 *   pane-*.js     context (waves, for_each, windows) · skills · generated + steps · AI reflection
 *   reflect.js    skill problems from a correction or a description, and the edits that fix them
 */

import { bootPython, onProgress } from './py.js';
import { S, SKILLSETS, loadDocs, render, setManualAnswerer, status, stop, runDocument } from './core.js';
import { openSettings, openImport, exportAs, answerByHand, fillSelectors, reopen } from './dialogs.js';
import { closeModal, toast } from './ui.js';
import { applyStatic, getLang, setLang, t } from './i18n.js';
import './pane-context.js';
import './pane-skills.js';
import './pane-work.js';
import './pane-ai.js';

function wire() {
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !document.getElementById('modal').hidden) closeModal(); });
  document.getElementById('btn-settings').addEventListener('click', openSettings);
  document.getElementById('btn-import').addEventListener('click', openImport);
  document.getElementById('btn-stop').addEventListener('click', stop);
  document.getElementById('btn-run-doc').addEventListener('click', () => runDocument().catch(fail));
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
  setManualAnswerer(answerByHand);
  status(t('booting'));
  onProgress((text) => status(text));
  const info = await bootPython();
  console.info('SkillParse Python ready', info);
  await loadDocs();
  const params = new URLSearchParams(location.search);
  const skillset = SKILLSETS.some((s) => s.id === params.get('skills')) ? params.get('skills') : SKILLSETS[0].id;
  const want = params.get('doc');
  const lang = SKILLSETS.find((s) => s.id === skillset).lang;
  const doc = (S.docs.find((d) => d.id === want) || S.docs.find((d) => d.lang === lang) || S.docs[0]).id;
  await reopen(skillset, doc);
}

boot().catch(fail);
