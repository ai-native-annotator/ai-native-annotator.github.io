/**
 * The skill column (where the legend used to be) and the skill detail view.
 *
 * The legend was a colour key: it told you a purple dot meant `discourse` and
 * nothing else. But the skills ARE the method — each one is a file of
 * instructions that decides what the model does — so the column that lists
 * them should be the way into them, not a static caption. Each card is now a
 * button: it opens what that skill is, the instructions actually being sent,
 * any local amendment in force, and the issues recorded against it.
 *
 * The detail view is also where reflection happens, deliberately in the same
 * place: you review the problems recorded against a skill and write the
 * amendment while looking at the instructions you are amending.
 */

import { el, esc, mount } from '../core/dom.js';
import { state, set } from '../core/state.js';
import { t } from '../core/i18n.js';
import { loadBaseText, getOverride, clearOverride, addAmendment } from '../core/skills.js';
import {
  issuesFor, openFor, keptFor, pendingCounts, keep, dismiss, markReflected,
  reflectionPrompt, localReflection, readyToReflect,
} from '../core/reflection.js';
import { callProvider, PROVIDERS } from '../core/providers.js';
import { logInfo, logError, describeError } from '../core/log.js';
import { toast } from './toast.js';

/* ------------------------------------------------------------ the column */

export function renderSkillPanel(container, format) {
  container.innerHTML = '';
  const skills = format.skills || [];
  const counts = pendingCounts();

  container.append(el('div', { class: 'legend-title' }, t('skills.panelTitle')));

  for (const def of skills) {
    const n = counts[def.id] || 0;
    const amended = Boolean(getOverride(def.file));
    container.append(el('button', {
      class: `skill-card${state.openSkill === def.id ? ' on' : ''}`,
      title: def.describes || def.label,
      onclick: () => openSkillDetail(def, format),
    },
      el('span', { class: 'legend-dot', style: `background:${format.skillColor?.(def.id) || '#8a8f98'}` }),
      el('span', { class: 'skill-card-body' },
        el('span', { class: 'legend-label' }, def.id),
        el('span', { class: 'skill-card-name' }, def.label)),
      amended ? el('span', { class: 'skill-flag amended', title: t('skills.liveBadge') }, '✎') : null,
      n ? el('span', { class: 'skill-flag issues', title: t('reflect.pending', { n }) }, String(n)) : null));
  }

  // Values that are annotation vocabulary rather than skills (sentiment
  // polarities, for instance) still need their colour key, so keep it below.
  const legend = format.legend?.() || [];
  if (legend.length) {
    container.append(el('div', { class: 'legend-title mt' }, t('panes.legend')));
    for (const it of legend) {
      container.append(el('div', { class: 'legend-item', title: it.note || '' },
        el('span', { class: 'legend-dot', style: `background:${it.color}` }),
        el('span', { class: 'legend-label' }, it.label),
        it.note ? el('span', { class: 'legend-note' }, it.note) : null));
    }
  }

  container.append(el('div', { class: 'legend-foot' },
    t(format.chain ? 'panes.chainHint' : format.serial ? 'panes.serialHint' : 'panes.parallelHint')));
}

/* ------------------------------------------------------------ the detail */

export async function openSkillDetail(def, format, tab = 'about') {
  set({ openSkill: def.id }, 'skills');
  const overlay = el('div', { class: 'overlay', onclick: (e) => { if (e.target === overlay) close(); } });
  const close = () => { overlay.remove(); set({ openSkill: null }, 'skills'); };
  const body = el('div', { class: 'modal-body skill-detail-body' });
  overlay.append(el('div', { class: 'modal skill-modal' },
    el('div', { class: 'modal-head' },
      el('h3', {},
        el('span', { class: 'skill-chip lg', style: `--c:${format.skillColor?.(def.id) || '#888'}` }, def.id),
        ' ', def.label),
      el('button', { class: 'btn sm ghost', onclick: close }, t('common.close'))),
    body));
  document.body.append(overlay);
  await renderDetail(body, def, format, tab);
}

async function renderDetail(body, def, format, tab) {
  body.innerHTML = '';
  const issues = issuesFor(def.id);
  const open = openFor(def.id);
  const kept = keptFor(def.id);

  const tabs = el('div', { class: 'edit-tabs' });
  const mk = (id, label, badge) => el('button', {
    class: `btn sm${tab === id ? '' : ' ghost'}`,
    onclick: () => renderDetail(body, def, format, id),
  }, label, badge ? el('span', { class: 'thread-count' }, String(badge)) : null);
  tabs.append(
    mk('about', t('skills.tabAbout')),
    mk('file', t('skills.tabFile')),
    mk('issues', t('skills.tabIssues'), issues.filter((i) => i.status === 'open' || i.status === 'kept').length),
  );
  body.append(tabs);

  if (tab === 'about') {
    mount(body,
      def.describes ? el('p', { class: 'skill-desc' }, def.describes) : null,
      el('div', { class: 'settings-row' }, el('label', { class: 'settings-label' }, t('skills.fileLabel')),
        el('code', {}, def.file)),
      el('div', { class: 'hint' }, t('skills.aboutHint')),
    );
    const amendment = getOverride(def.file);
    if (amendment) {
      body.append(el('div', { class: 'amendment' },
        el('div', { class: 'amendment-head' },
          el('span', { class: 'amendment-badge' }, t('skills.liveBadge')),
          el('button', {
            class: 'btn sm ghost',
            onclick: () => { clearOverride(def.file); renderDetail(body, def, format, tab); toast(t('skills.revertedToast')); },
          }, t('assist.revert'))),
        el('pre', { class: 'amendment-text' }, amendment)));
    } else {
      body.append(el('div', { class: 'hint' }, t('skills.noAmendment')));
    }
    return;
  }

  if (tab === 'file') {
    const pre = el('pre', { class: 'code skill-file-text' }, t('common.loading'));
    body.append(el('div', { class: 'hint' }, t('skills.fileHint')), pre);
    const base = await loadBaseText(def.file);
    const amendment = getOverride(def.file);
    pre.textContent = base || t('skills.fileMissing', { file: def.file });
    if (amendment) {
      pre.append(el('span', { class: 'file-amendment' }, `\n\n${t('skills.amendHeading')}\n\n${amendment}`));
    }
    return;
  }

  /* ---- issues: review first, reflect second. Never the other way round. ---- */
  body.append(el('div', { class: 'hint' }, t('reflect.hint')));

  if (!issues.length) {
    body.append(el('div', { class: 'empty sm' }, t('reflect.none')));
    return;
  }

  const list = el('div', { class: 'issue-list' });
  for (const i of issues) {
    const actions = el('div', { class: 'issue-actions' });
    if (i.status === 'open') {
      actions.append(
        el('button', { class: 'btn sm', onclick: () => { keep(i.id); renderDetail(body, def, format, tab); } }, t('reflect.keep')),
        el('button', { class: 'btn sm ghost', onclick: () => { dismiss(i.id); renderDetail(body, def, format, tab); } }, t('reflect.dismiss')));
    } else {
      actions.append(el('span', { class: `issue-status ${i.status}` }, t(`reflect.status.${i.status}`)));
    }
    list.append(el('div', { class: `issue-row ${i.status}` },
      el('div', { class: 'issue-head' },
        el('span', { class: `issue-kind ${i.kind}` }, t(`reflect.kind.${i.kind}`)),
        el('span', { class: 'issue-span' }, i.span || t('reflect.wholeSentence')),
        el('span', { class: 'issue-ts muted sm' }, new Date(i.ts).toLocaleString())),
      i.reason ? el('div', { class: 'issue-reason' }, i.reason) : null,
      (i.before !== null || i.after !== null)
        ? el('pre', { class: 'code sm issue-diff' },
            `- ${trunc(JSON.stringify(i.before))}\n+ ${trunc(JSON.stringify(i.after))}`)
        : null,
      actions));
  }
  body.append(list);

  const status = el('span', { class: 'edit-status' });
  const reflectBtn = el('button', {
    class: 'btn',
    disabled: readyToReflect(def.id) ? undefined : '',
    onclick: () => runReflection(body, def, format, tab, status),
  }, t('reflect.reflectNow', { n: kept.length }));
  body.append(el('div', { class: 'modal-actions' }, reflectBtn, status));
  if (!kept.length) {
    body.append(el('div', { class: 'hint' },
      open.length ? t('reflect.reviewFirst', { n: open.length }) : t('reflect.nothingKept')));
  }
}

const trunc = (s, n = 200) => (String(s ?? '').length > n ? String(s).slice(0, n) + '…' : String(s ?? ''));

/**
 * Reflect over the whole reviewed batch and propose ONE amendment. Even here
 * it is not applied automatically: the text is shown, and a human presses
 * apply. Reflection proposes; a person decides.
 */
async function runReflection(body, def, format, tab, status) {
  const kept = keptFor(def.id);
  if (!kept.length) return;
  status.textContent = t('reflect.thinking'); status.className = 'edit-status';

  const provider = state.provider;
  const key = (state.apiKeys[provider] || '').trim();
  let text;
  if (state.runMode === 'live' && key) {
    try {
      const prompt = reflectionPrompt(def.id, kept, state.lang);
      logInfo('reflect', `live: reflecting over ${kept.length} issue(s) on ${def.id}`);
      text = await callProvider(provider, {
        apiKey: key,
        model: state.models[provider] || PROVIDERS[provider]?.defaultModel,
        prompt,
      });
    } catch (err) {
      logError('reflect', t('reflect.liveFailed', { err: describeError(err) }), err);
      text = `${localReflection(def.id, kept, state.lang)}\n\n_${t('reflect.liveFailed', { err: describeError(err) })}_`;
    }
  } else {
    text = localReflection(def.id, kept, state.lang);
  }

  status.textContent = '';
  const box = el('div', { class: 'amendment' },
    el('div', { class: 'amendment-head' },
      el('span', { class: 'amendment-badge' }, t('reflect.proposed', { n: kept.length }))),
    el('pre', { class: 'amendment-text' }, text),
    el('div', { class: 'hint' }, t('reflect.applyHint')),
    el('div', { class: 'modal-actions' },
      el('button', {
        class: 'btn sm',
        onclick: () => {
          const rule = extractRule(text) || text.trim();
          addAmendment(def.file, rule);
          markReflected(def.id, rule);
          toast(t('reflect.applied', { skill: def.id }));
          renderDetail(body, def, format, 'about');
        },
      }, t('reflect.applyToSkill')),
      el('button', { class: 'btn sm ghost', onclick: () => box.remove() }, t('common.cancel'))));
  body.append(box);
  box.scrollIntoView({ block: 'nearest' });
}

/** Pull the `>` quoted rule out of a reflection, same convention as the chat. */
function extractRule(text) {
  const quoted = String(text || '').split('\n').filter((l) => l.trim().startsWith('>'));
  if (quoted.length) return quoted.map((l) => l.replace(/^\s*>\s?/, '- ')).join('\n');
  return '';
}

void esc;
