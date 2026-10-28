/** Settings, import, export, and answering Jev's questions by hand. */

import { h, openModal, closeModal, toast, download } from './ui.js';
import { S, SKILLSETS, assembled, loadDocs, open, warm } from './core.js';
import { settings, saveSettings, keys, saveKey, ROLES, PROVIDERS, shapeAnswers } from './models.js';
import { bundle } from './store.js';
import { py } from './py.js';
import { t } from './i18n.js';

export function openSettings() {
  const cfg = settings();
  const k = keys();
  const keyInputs = PROVIDERS.map((p) => {
    const inp = h('input', { type: 'password', value: k[p] || '', placeholder: { openrouter: 'sk-or-…', anthropic: 'sk-ant-…', openai: 'sk-…' }[p], autocomplete: 'off' });
    return [p, inp];
  });
  const roleInputs = Object.keys(ROLES).map((r) => {
    const prov = h('select', {}, PROVIDERS.map((p) => h('option', { value: p, text: p, selected: cfg.roles[r].provider === p })));
    const model = h('input', { type: 'text', value: cfg.roles[r].model });
    return [r, prov, model];
  });
  const backend = h('select', {},
    [['route', t('byRoute')], ['jev', t('allJev')], ['haiku', t('allHaiku')], ['manual', t('jevManual')]].map(([v, l]) => h('option', { value: v, text: l, selected: cfg.jev.backend === v })));
  const routeInputs = Object.keys(DEFAULT_ROUTE).map((skill) => [skill, h('select', {},
    [['jev', 'Jev'], ['haiku', 'Haiku']].map(([v, l]) => h('option', { value: v, text: l, selected: cfg.jev.route[skill] === v })))]);
  const url = h('input', { type: 'text', value: cfg.jev.url });
  const jmodel = h('input', { type: 'text', value: cfg.jev.model });
  const jkey = h('input', { type: 'password', value: cfg.jev.key || '', autocomplete: 'off', placeholder: t('jevKeyHint') });
  const conc = h('input', { type: 'number', min: 1, max: 20, value: cfg.concurrency, style: 'width:5em' });

  const body = h('div', { style: 'display:grid;gap:12px' },
    h('h4', { text: t('keys') }),
    h('div', { class: 'form-grid', style: 'grid-template-columns:max-content 1fr' }, keyInputs.map(([p, inp]) => [h('label', { text: p }), inp])),
    h('h4', { text: t('roles') }),
    h('div', { class: 'form-grid' }, roleInputs.map(([r, prov, model]) => [h('label', { text: t(`roleNames.${r}`) }), prov, model])),
    h('h4', { text: t('jevBackend') }),
    h('div', { class: 'form-grid', style: 'grid-template-columns:max-content 1fr' },
      h('label', { text: t('jevBackend') }), backend,
      h('label', { text: t('jevUrl') }), url,
      h('label', { text: t('jevModel') }), jmodel,
      h('label', { text: t('jevKey') }), jkey,
      h('label', { text: t('concurrency') }), conc),

    h('div', { class: 'row' }, h('button', { class: 'btn primary', text: t('saveSettings'), onclick: () => {
      keyInputs.forEach(([p, inp]) => saveKey(p, inp.value));
      saveSettings({
        roles: Object.fromEntries(roleInputs.map(([r, prov, model]) => [r, { provider: prov.value, model: model.value.trim() }])),
        jev: { ...cfg.jev, backend: backend.value, url: url.value.trim(), model: jmodel.value.trim(), key: jkey.value.trim() },
        concurrency: Math.max(1, Number(conc.value) || 6),
      });
      closeModal();
      toast(t('saveSettings'));
    } })));
  openModal(t('settingsTitle'), body, { wide: false });
}

export function openImport() {
  const name = h('input', { type: 'text', value: 'my-document' });
  const area = h('textarea', { rows: 10, style: 'font-family:var(--sans)' });
  const file = h('input', { type: 'file', accept: '.txt,.umr,text/plain' });
  file.addEventListener('change', async () => {
    const f = file.files[0];
    if (!f) return;
    area.value = await f.text();
    name.value = f.name.replace(/\.(txt|umr)$/i, '');
  });
  const body = h('div', { style: 'display:grid;gap:8px' },
    h('div', { class: 'note', text: t('importDesc') }), file,
    h('label', { text: t('paste') }), area,
    h('label', { class: 'row' }, h('span', { text: t('docName') }), name),
    h('div', {}, h('button', { class: 'btn primary', text: t('importGo'), onclick: async () => {
      const text = area.value.trim();
      if (!text) return;
      if (/[一-鿿]/.test(text)) await warm();
      const res = await py('import_text', { name: name.value.trim(), text });
      await loadDocs();
      closeModal();
      toast(t('imported', { id: res.id }));
      document.dispatchEvent(new CustomEvent('docs-changed', { detail: res.id }));
    } })));
  openModal(t('importTitle'), body, { wide: false });
}

export async function exportAs(kind) {
  const base = `${S.doc}.${S.skillset}`;
  if (kind === 'umr' || kind === 'umr-raw') {
    S.umrStale = true;
    const u = await assembled(kind === 'umr');
    download(`${base}.umr`, u.text);
    toast(`${t('exported')} ${base}.umr${kind === 'umr' ? ` · ${t('alignAdded', { n: u.added.length })}` : ''}`);
  } else if (kind === 'json') {
    const rec = await py('export');
    download(`${base}.work.json`, JSON.stringify(rec, null, 1), 'application/json');
    toast(`${t('exported')} ${base}.work.json`);
  } else if (kind === 'skills') {
    const files = bundle(S.skillset);
    if (!Object.keys(files).length) { toast(t('nothing')); return; }
    download(`${S.skillset}.edited-skills.json`, JSON.stringify({ skillset: S.skillset, files }, null, 1), 'application/json');
    toast(`${t('exported')} ${Object.keys(files).length} files`);
  }
}

/** Jev's questions put to the person: returns answers in Jev's shape. */
export function answerByHand(state, questions) {
  return new Promise((resolve, reject) => {
    const picks = {};
    const rows = Object.entries(questions).map(([id, q]) => {
      const ins = typeof q.instructions === 'string' ? q.instructions : Object.entries(q.instructions || {}).map(([a, b]) => `${a}: ${b}`).join(' · ');
      let control;
      if (q.type === 'choice') {
        const opts = Object.keys(q.criteria || {});
        picks[id] = opts[0];
        control = h('select', { onchange: (e) => { picks[id] = e.target.value; } },
          opts.map((o) => h('option', { value: o, text: `${o}${q.criteria[o] ? ` — ${String(q.criteria[o]).slice(0, 90)}` : ''}` })));
      } else if (q.type === 'noul') {
        picks[id] = 'no';
        control = h('select', { onchange: (e) => { picks[id] = e.target.value; } }, h('option', { value: 'no', text: t('no') }), h('option', { value: 'yes', text: t('yes') }));
      } else {
        picks[id] = '0';
        control = h('select', { onchange: (e) => { picks[id] = e.target.value; } }, (q.criteria || []).map((d, n) => h('option', { value: String(n), text: `${n}: ${d}` })));
      }
      return h('div', { class: 'qa' }, h('div', { class: 'q' }, h('code', { text: id }), ` ${ins}`), control);
    });
    let done = false;
    const body = h('div', { style: 'display:grid;gap:6px' },
      h('details', {}, h('summary', { text: 'state' }), h('pre', { class: 'block', text: JSON.stringify(state, null, 1) })),
      rows,
      h('div', {}, h('button', { class: 'btn primary', text: t('manualGo'), onclick: () => { done = true; closeModal(); resolve(shapeAnswers(questions, picks)); } })));
    openModal(t('manualTitle', { n: rows.length }), body, { close: () => { if (!done) reject(new Error(t('stopped'))); } });
  });
}

export function fillSelectors() {
  const ss = document.getElementById('skillset');
  ss.replaceChildren(...SKILLSETS.map((s) => h('option', { value: s.id, text: s.label, selected: s.id === S.skillset })));
  const ds = document.getElementById('doc');
  ds.replaceChildren(...S.docs.map((d) => h('option', { value: d.id, text: `${d.id} (${d.lang}, ${d.sentences})`, selected: d.id === S.doc })));
}

export async function reopen(skillset, doc) {
  await open(skillset, doc);
  fillSelectors();
}
