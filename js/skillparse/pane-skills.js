/**
 * Second pane: the skills of the registry, what each one starts next
 * (the dispatcher), and their files. A file opens in the editor; saving makes a new version
 * that the next run uses (store.js keeps the versions in this browser).
 */

import { h, clear, openModal, closeModal, toast, diffView, download } from './ui.js';
import { S, onRender, render } from './core.js';
import { py } from './py.js';
import { addVersion, versions, forget, original, edited } from './store.js';
import { lineDiff, hunks } from './diff.js';
import { settings, saveSettings, answererOf } from './models.js';
import { t } from './i18n.js';

const root = () => document.getElementById('skills');

function fileChip(path) {
  const name = path.split('/').pop();
  const isEdited = (edited(S.skillset)[path] || []).length > 0;
  return h('button', { class: `file${isEdited ? ' edited' : ''}`, title: path, text: name, onclick: (e) => { e.stopPropagation(); openEditor(path); } });
}

/** Who answers this skill's questions; a click switches Jev <-> Haiku (Settings keeps it). */
function answererBadge(skill) {
  const who = answererOf(skill);
  const label = { jev: 'Jev', haiku: 'Haiku', manual: t('jevManual') }[who];
  const switchable = settings().jev.backend === 'route';
  return h('button', {
    class: `badge answerer by-${who}`, text: `→ ${label}`, title: t('answeredBy', { who: label }), disabled: !switchable,
    onclick: (e) => {
      e.stopPropagation();
      const cfg = settings();
      cfg.jev.route[skill] = who === 'jev' ? 'haiku' : 'jev';
      saveSettings(cfg);
      render();
    },
  });
}

function draw() {
  const el = root();
  if (!S.desc) { clear(el); return; }
  const currentSkill = S.episode?.nodes.find((n) => n.id === S.node)?.skill;
  const files = edited(S.skillset);
  clear(el,
    S.desc.skills.map((s) => {
      const anyEdited = s.files.some((f) => (files[f] || []).length);
      return h('div', { class: `skill${s.name === currentSkill ? ' current' : ''}`, onclick: () => s.files[0] && openEditor(s.files[0]) },
        h('div', {}, h('span', { class: 'name', text: s.name }), h('span', { class: `badge ${s.kind}`, text: t(`kinds.${s.kind}`) }),
          s.kind === 'jev' ? answererBadge(s.name) : null,
          s.model ? h('span', { class: 'badge', text: s.model }) : null,
          anyEdited ? h('span', { class: 'badge edited', text: '✎' }) : null),
        s.rules.length ? h('ul', { class: 'rules' }, s.rules.map((r) => h('li', { title: r.text, text: r.short || r.text }))) : null,
        h('div', { class: 'files' }, s.files.map(fileChip)));
    }),
    h('div', { class: 'card' }, h('h4', { text: t('shared') }), h('div', { class: 'files' }, S.desc.shared_files.map(fileChip))));
}

export async function openEditor(path) {
  const name = path.split('/').pop();
  let text;
  try {
    text = await py('read_file', { path });
  } catch (err) {
    toast(err.message);
    return;
  }
  const area = h('textarea', { class: 'code', spellcheck: 'false' });
  area.value = text;
  const msg = h('div', { class: 'note' });
  const vs = versions(S.skillset, path);
  const diffBox = h('div', { class: 'block' });
  diffBox.hidden = true;
  const hist = h('details', {}, h('summary', { text: t('versions', { n: vs.length }) }),
    h('ul', {}, vs.map((v, k) => h('li', {},
      h('span', { text: `${k + 1}. ${v.at.replace('T', ' ').slice(0, 19)} · ${v.source}${v.note ? ` · ${v.note.slice(0, 80)}` : ''} ` }),
      h('button', { class: 'btn link sm', text: t('diffWithPrev'), onclick: async () => {
        const prev = k ? vs[k - 1].content : await original(path);
        clear(diffBox, h('div', { class: 'note', text: `v${k + 1}` }), diffView(hunks(lineDiff(prev, v.content), 3)));
        diffBox.hidden = false;
      } }),
      ' ', h('button', { class: 'btn link sm', text: '↺', title: 'restore', onclick: () => { area.value = v.content; } })))));

  async function save(content, note, source = 'manual') {
    const res = await py('write_file', { path, content });
    addVersion(S.skillset, path, content, note, source);
    msg.textContent = res.ok ? t('savedVersion') : t('syntax', { p: res.problem });
    msg.className = res.ok ? 'note ok' : 'note err';
    S.desc = await py('describe');
    render();
  }

  const body = h('div', { style: 'display:grid;gap:8px' },
    h('div', { class: 'note mono', text: path }),
    area,
    h('div', { class: 'row' },
      h('button', { class: 'btn primary', text: t('save'), onclick: () => save(area.value, '') }),
      h('button', { class: 'btn', text: t('revert'), onclick: async () => {
        const orig = await original(path);
        await py('write_file', { path, content: orig });
        forget(S.skillset, path);
        area.value = orig;
        msg.textContent = t('original');
        S.desc = await py('describe');
        render();
      } }),
      h('button', { class: 'btn ghost', text: '⬇', title: 'download', onclick: () => download(name, area.value) }),
      h('span', { class: 'grow' }),
      msg),
    hist, diffBox);
  openModal(t('editorTitle', { f: name }), body);
  area.focus();
}

export function closeEditor() {
  closeModal();
}

onRender(draw);
