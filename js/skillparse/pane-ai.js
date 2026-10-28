/**
 * Right pane: reflection on the selected step, three ways.
 *
 *   ① edit the skill yourself      -> the step's files open in the editor
 *   ② correct the output           -> the AI compares the machine output with the correction
 *                                     and proposes the skill edit that would have produced it
 *   ③ say what is wrong            -> the AI edits the skill from the description
 *
 * Proposed edits are shown as diffs and applied only when chosen; then the step can be
 * re-run to check that the skill now does what the person wanted.
 */

import { h, clear, toast, diffView } from './ui.js';
import { S, onRender, render, nodeKey, runNode, saveOutput, selectNode, assembled } from './core.js';
import { reflect, applyToFiles } from './reflect.js';
import { openEditor } from './pane-skills.js';
import { py } from './py.js';
import { lineDiff, hunks, stable } from './diff.js';
import { t } from './i18n.js';

let open = 2;
const drafts = new Map();          // node key -> text typed in ③

function slot() {
  const k = nodeKey();
  if (!S.ai[k]) S.ai[k] = { history: [], proposal: null, verify: null, busy: false };
  return S.ai[k];
}

function asText(o) {
  if (o == null) return '';
  return stable(o);
}

async function filesFor(d) {
  const out = {};
  const list = [...(d.files || [])];
  // a jev skill's helpers are shared; send them with it (an agent skill's files already include
  // its reference/example.md and tools)
  if (d.kind === 'jev') list.push(...S.desc.shared_files.filter((f) => f.endsWith('jevlib.py')));
  for (const f of list) {
    if (f.endsWith('.md') || f.endsWith('.py') || f.endsWith('.yaml') || f.endsWith('.txt')) {
      try { out[f] = await py('read_file', { path: f }); } catch { /* skip */ }
    }
  }
  return out;
}

async function ask(mode, feedback = '') {
  const d = S.detail;
  const s = slot();
  s.busy = true;
  s.proposal = null;
  s.verify = null;
  render();
  try {
    let graph = null;
    try {
      const u = await assembled(true);
      graph = (u.sentences.find((x) => x.index === S.item + 1) || {}).text || null;
    } catch { /* optional */ }
    const files = await filesFor(d);
    const corrected = mode === 'corrected' ? d.output : null;
    const res = await reflect({
      skillset: S.skillset, node: d, context: S.episode?.context, mode, feedback, corrected, files, graph,
    });
    s.proposal = { ...res, mode, target: corrected, picked: (res.edits || []).map(() => true), report: null };
    s.history.push({ at: new Date().toISOString(), mode, feedback, diagnosis: res.diagnosis, layer: res.layer, edits: (res.edits || []).length });
  } catch (err) {
    toast(`${t('error')}: ${err.message}`);
    s.history.push({ at: new Date().toISOString(), mode, feedback, diagnosis: `${t('error')}: ${err.message}` });
  } finally {
    s.busy = false;
    render();
  }
}

async function applyPicked() {
  const s = slot();
  const p = s.proposal;
  const chosen = p.edits.filter((_, k) => p.picked[k]);
  if (!chosen.length) return;
  const report = await applyToFiles(S.skillset, chosen, `AI (${p.mode}): ${p.diagnosis.slice(0, 120)}`);
  p.report = new Map();
  let k2 = 0;
  p.edits.forEach((_, k) => { if (p.picked[k]) p.report.set(k, report[k2++]); });
  const ok = report.filter((r) => r.ok).length;
  toast(t('applied', { ok, n: chosen.length }));
  S.desc = await py('describe');
  s.history.push({ at: new Date().toISOString(), mode: 'apply', diagnosis: t('applied', { ok, n: chosen.length }) });
  render();
}

async function verify() {
  const s = slot();
  const target = s.proposal?.target;
  const nid = S.node;
  await runNode(nid);
  const d = await py('node', { w: S.wave, i: S.item, nid });
  if (target) {
    const a = asText(target);
    const b = asText(d.output);
    s.verify = a === b ? { ok: true } : { ok: false, diff: hunks(lineDiff(b, a), 2) };
  } else {
    s.verify = { ok: null };
  }
  s.history.push({ at: new Date().toISOString(), mode: 'verify', diagnosis: s.verify.ok ? t('verifyOk') : s.verify.ok === false ? t('verifyDiff') : t('doneRun', { n: 1 }) });
  render();
}

function modeCard(n, title, desc, body) {
  return h('div', { class: 'mode', 'aria-expanded': String(open === n) },
    h('button', { class: 'mode-head', onclick: () => { open = open === n ? 0 : n; render(); } },
      h('span', { class: 'num', text: ['', '①', '②', '③'][n] }), h('span', { text: title })),
    open === n ? h('div', { class: 'mode-body' }, h('div', { class: 'note', text: desc }), body) : null);
}

function proposalView(s) {
  const p = s.proposal;
  if (!p) return null;
  const edits = p.edits || [];
  return h('div', { class: 'proposal' },
    h('h4', { text: t('diagnosis') }),
    h('div', { text: p.diagnosis }),
    h('div', { class: 'note', text: t('layer', { layer: p.layer }) }),
    p.layer === 'upstream' && S.detail?.parent ? h('button', { class: 'btn sm', text: t('jumpUp'), onclick: () => selectNode(S.detail.parent) }) : null,
    h('h4', { style: 'margin-top:8px', text: edits.length ? t('edits', { n: edits.length }) : t('noEdits') }),
    edits.map((e, k) => {
      const box = h('input', { type: 'checkbox', checked: p.picked[k] });
      box.addEventListener('change', () => { p.picked[k] = box.checked; });
      const rep = p.report?.get(k);
      const before = e.find;
      const after = e.op === 'modify' ? e.replace : e.op === 'add' ? `${e.find}${e.replace || ''}` : '';
      return h('div', { class: 'edit' },
        h('label', {}, box, h('span', { class: 'mono', text: `${e.op} · ${e.file.split('/').pop()}` })),
        h('div', { class: 'note', text: e.why }),
        diffView(lineDiff(before || '', after || '').filter((x) => !(x.op === '-' && x.text === '' && !before))),
        rep ? h('div', { class: rep.ok ? 'ok' : 'err', text: rep.ok ? '✓' : t('failed', { why: rep.why }) }) : null);
    }),
    edits.length ? h('div', { class: 'row', style: 'margin-top:8px' },
      h('button', { class: 'btn primary', text: t('apply'), disabled: !!p.report, onclick: applyPicked }),
      p.report ? h('button', { class: 'btn', text: t('verify'), disabled: S.running > 0, onclick: verify }) : null) : null,
    s.verify ? h('div', { style: 'margin-top:6px' },
      s.verify.ok === true ? h('div', { class: 'ok', text: t('verifyOk') }) : null,
      s.verify.ok === false ? [h('div', { class: 'warn', text: t('verifyDiff') }), diffView(s.verify.diff)] : null,
      p.target && s.verify.ok === false ? h('button', { class: 'btn sm', text: t('reapply'), onclick: () => saveOutput(p.target) }) : null) : null);
}

function draw() {
  const el = document.getElementById('ai');
  if (!S.desc) { clear(el); return; }
  const d = S.detail;
  if (!d) { clear(el, h('div', { class: 'empty', text: t('aiNone') })); return; }
  const s = slot();
  const k = nodeKey();
  // a redraw while the person types in ③ must not take the cursor away
  const typing = document.activeElement;
  if (typing?.tagName === 'TEXTAREA' && el.contains(typing) && el.dataset.key === k && !s.busy && el.dataset.busy !== 'true') return;
  el.dataset.key = k;
  el.dataset.busy = String(s.busy);

  const m1 = h('div', { class: 'row' }, (d.files || []).map((f) => h('button', { class: 'btn sm', text: t('openFile', { f: f.split('/').pop() }), onclick: () => openEditor(f) })),
    h('button', { class: 'btn sm', text: t('rerun'), disabled: S.running > 0, onclick: () => runNode(d.id) }));

  let m2;
  if (d.human && d.machine_output) {
    m2 = h('div', { style: 'display:grid;gap:6px' }, h('div', { class: 'note', text: t('m2Ready') }),
      diffView(hunks(lineDiff(asText(d.machine_output), asText(d.output)), 2)),
      h('button', { class: 'btn primary', disabled: s.busy, text: t('m2Go'), onclick: () => ask('corrected', drafts.get(k) || '') }));
  } else {
    m2 = h('div', { style: 'display:grid;gap:6px' }, h('div', { class: 'warn', text: t('m2None') }),
      d.output ? h('button', { class: 'btn sm', text: t('edit'), onclick: () => { S.tab = 'output'; S.editing = true; render(); } }) : null);
  }

  const area = h('textarea', { rows: 3, placeholder: t('m3Placeholder'), style: 'font-family:var(--sans);font-size:13px' });
  area.value = drafts.get(k) || '';
  area.addEventListener('input', () => drafts.set(k, area.value));
  const m3 = h('div', { style: 'display:grid;gap:6px' }, area,
    h('div', { class: 'row' },
      h('button', { class: 'btn primary', disabled: s.busy, text: t('m3Go'), onclick: () => { if (area.value.trim()) ask('told', area.value.trim()); else area.focus(); } }),
      h('button', { class: 'btn', disabled: s.busy, text: t('selfGo'), onclick: () => ask('self') })));

  clear(el,
    h('div', { class: 'note', style: 'margin-bottom:6px', text: t('aiHead', { node: `#${S.item + 1} · ${d.id} · ${d.skill} (${d.kind})` }) }),
    h('div', { class: 'modes' },
      modeCard(1, t('m1'), t('m1Desc'), m1),
      modeCard(2, t('m2'), t('m2Desc'), m2),
      modeCard(3, t('m3'), t('m3Desc'), m3)),
    s.busy ? h('div', { class: 'loading' }, h('span', { class: 'spinner' }), t('thinking')) : null,
    proposalView(s),
    s.history.length ? h('div', { class: 'history' }, h('h4', { text: t('history') }),
      s.history.slice().reverse().map((x) => h('div', { class: 'turn' },
        h('div', { class: 'note', text: `${x.at.slice(11, 19)} · ${x.mode}${x.layer ? ` · ${x.layer}` : ''}` }),
        x.feedback ? h('div', { text: `“${x.feedback}”` }) : null,
        h('div', { text: x.diagnosis })))) : null);
}

onRender(draw);
