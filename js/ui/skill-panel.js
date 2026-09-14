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

import { el, mount } from '../core/dom.js';
import { state, set } from '../core/state.js';
import { t } from '../core/i18n.js';
import {
  loadBaseText, loadEffectiveText, getOverride, getOverrideInfo,
  activateSkillCandidate, clearOverride, getActiveRevisionId, getRevisionHistory,
  proposeSkillAmendment, rollbackSkillRevision, setFullText,
} from '../core/skills.js';
import {
  issuesFor, openFor, keptFor, keptEvidenceFor, pendingCounts, keep, dismiss, markReflected,
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
    const n = counts[def.skillId] || 0;
    const amended = Boolean(getOverride(def.file, def.skillId));
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
  const issues = issuesFor(def.skillId);
  const open = openFor(def.skillId);
  const kept = keptFor(def.skillId);

  const tabs = el('div', { class: 'edit-tabs' });
  const mk = (id, label, badge) => el('button', {
    class: `btn sm${tab === id ? '' : ' ghost'}`,
    onclick: () => renderDetail(body, def, format, id),
  }, label, badge ? el('span', { class: 'thread-count' }, String(badge)) : null);
  tabs.append(
    mk('about', t('skills.tabAbout')),
    mk('file', t('skills.tabFile')),
    // The instructions say what to do; the implementation they came from says
    // what that meant. Showing only the prose was showing half the skill.
    (def.reference || def.code) ? mk('code', def.code ? t('skills.tabCodeRuns') : t('skills.tabCode')) : null,
    mk('issues', t('skills.tabIssues'), issues.filter((i) => i.status === 'open' || i.status === 'kept').length),
  );
  body.append(tabs);

  if (tab === 'about') {
    await loadEffectiveText(def.file, def.skillId);
    const history = getRevisionHistory(def.skillId);
    const activeRevisionId = getActiveRevisionId(def.skillId);
    mount(body,
      def.describes ? el('p', { class: 'skill-desc' }, def.describes) : null,
      el('div', { class: 'settings-row' }, el('label', { class: 'settings-label' }, t('skills.fileLabel')),
        el('code', {}, def.file)),
      el('div', { class: 'settings-row' }, el('label', { class: 'settings-label' }, t('skills.identity')),
        el('code', {}, def.skillId)),
      el('div', { class: 'settings-row' }, el('label', { class: 'settings-label' }, t('skills.revision')),
        el('code', {}, activeRevisionId || '—')),
      el('div', { class: 'hint' }, t('skills.aboutHint')),
    );
    const amendment = getOverride(def.file, def.skillId);
    if (amendment) {
      body.append(el('div', { class: 'amendment' },
        el('div', { class: 'amendment-head' },
          el('span', { class: 'amendment-badge' }, t('skills.liveBadge')),
          el('button', {
            class: 'btn sm ghost',
            disabled: history.length > 1 ? undefined : '',
            onclick: async () => {
              rollbackSkillRevision(def.skillId);
              await renderDetail(body, def, format, tab);
              toast(t('skills.rolledBack'));
            },
          }, t('skills.rollback')),
          el('button', {
            class: 'btn sm ghost',
            onclick: async () => {
              await clearOverride(def.file, def.skillId);
              await renderDetail(body, def, format, tab);
              toast(t('skills.revertedToast'));
            },
          }, t('assist.revert'))),
        el('pre', { class: 'amendment-text' }, amendment)));
    } else {
      body.append(el('div', { class: 'hint' }, t('skills.noAmendment')));
    }
    return;
  }

  // The instructions, editable. A skill file is the method; a tool that shows
  // it read-only is asking you to file a bug against your own prompt.
  if (tab === 'file') {
    await fileEditor(body, def, format, tab, def.file, t('skills.fileHint'));
    return;
  }

  if (tab === 'code') {
    if (def.code) {
      // A step that runs. Editing it changes what the pass does, so it is the
      // same editor as the instructions — including the revert.
      await fileEditor(body, def, format, tab, def.code, t('skills.codeRunsHint'));
      return;
    }
    const pre = el('pre', { class: 'code skill-file-text' }, t('common.loading'));
    const provenance = el('div', { class: 'skill-file' }, '');
    body.append(el('div', { class: 'hint' }, t('skills.codeHint')), provenance, pre);
    const text = await loadBaseText(`reference/${def.reference}`);
    pre.textContent = text || t('skills.fileMissing', { file: def.reference });
    // The last NON-EMPTY line: the file ends with a newline, and `.pop()` on a
    // raw split hands you the empty string after it.
    const src = (await loadBaseText('reference/umr/SOURCE.txt') || '')
      .split('\n').map((l) => l.trim()).filter(Boolean).pop();
    provenance.textContent = `data/reference/${def.reference}${src ? ` · ${src}` : ''}`;
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
    disabled: readyToReflect(def.skillId) ? undefined : '',
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
 * Edit a skill file in place — the instructions, or the code of a step that
 * runs. Both are "what this skill is", and both were read-only until now: the
 * only way to change a skill was to argue with it in the chat and wait for
 * reflection to draft an amendment. That is the right loop for a rule you
 * discovered by annotating, and the wrong one for a typo.
 *
 * Saving stores a full replacement (core/skills.js), so the next call runs what
 * is on screen. Saving it back unchanged reverts instead of storing a copy.
 */
async function fileEditor(body, def, format, tab, path, hint) {
  const stableSkillId = path === def.code ? `${def.skillId}/code` : def.skillId;
  const inlineBase = path === def.file ? String(def.instructions || '') : '';
  const status = el('span', { class: 'edit-status' });
  const ta = el('textarea', { class: 'edit-box code-box', spellcheck: 'false', rows: 20 });
  const head = el('div', { class: 'skill-file' }, `data/${path}`);
  body.append(el('div', { class: 'hint' }, hint), head, ta);

  ta.value = t('common.loading');
  const effective = await loadEffectiveText(path, stableSkillId, inlineBase || null);
  const base = inlineBase || await loadBaseText(path);
  ta.value = effective || t('skills.fileMissing', { file: path });
  const info = getOverrideInfo(path, stableSkillId);
  if (info) head.textContent = `data/${path} · ${t(info.mode === 'replace' ? 'skills.editedBadge' : 'skills.liveBadge')}`;

  body.append(el('div', { class: 'modal-actions' },
    el('button', {
      class: 'btn sm',
      onclick: async () => {
        const changed = await setFullText(path, ta.value, stableSkillId, inlineBase || null);
        toast(changed ? t('skills.savedToast', { file: path }) : t('skills.revertedToast'));
        await renderDetail(body, def, format, tab);
      },
    }, t('skills.saveFile')),
    el('button', {
      class: 'btn sm ghost',
      disabled: info ? undefined : '',
      onclick: async () => {
        await clearOverride(path, stableSkillId);
        toast(t('skills.revertedToast'));
        await renderDetail(body, def, format, tab);
      },
    }, t('skills.restoreOriginal')),
    status));
  if (!base) body.append(el('div', { class: 'hint' }, t('skills.fileMissing', { file: path })));
}

/**
 * Reflect over the whole reviewed batch and propose ONE amendment. Even here
 * it is not applied automatically: the text is shown, and a human presses
 * apply. Reflection proposes; a person decides.
 */
async function runReflection(body, def, format, tab, status) {
  const kept = keptFor(def.skillId);
  if (!kept.length) return;
  status.textContent = t('reflect.thinking'); status.className = 'edit-status';

  const provider = state.provider;
  const key = (state.apiKeys[provider] || '').trim();
  const currentInstructions = await loadEffectiveText(def.file, def.skillId);
  let text;
  let createdBy = { type: 'local-template' };
  if (state.runMode === 'live' && key) {
    try {
      const prompt = reflectionPrompt(def.id, kept, state.lang, currentInstructions);
      logInfo('reflect', `live: reflecting over ${kept.length} issue(s) on ${def.id}`);
      text = await callProvider(provider, {
        apiKey: key,
        model: state.models[provider] || PROVIDERS[provider]?.defaultModel,
        prompt,
      });
      createdBy = {
        type: 'model',
        model: state.models[provider] || PROVIDERS[provider]?.defaultModel || provider,
      };
    } catch (err) {
      logError('reflect', t('reflect.liveFailed', { err: describeError(err) }), err);
      text = `${localReflection(def.id, kept, state.lang)}\n\n_${t('reflect.liveFailed', { err: describeError(err) })}_`;
    }
  } else {
    text = localReflection(def.id, kept, state.lang);
  }

  const rule = extractRule(text) || text.trim();
  let proposed;
  try {
    proposed = await proposeSkillAmendment({
      skillId: def.skillId,
      relPath: def.file,
      text: rule,
      feedbackEvents: keptEvidenceFor(def.skillId),
      createdBy,
    });
  } catch (err) {
    status.textContent = describeError(err); status.className = 'edit-status err';
    return;
  }

  const passed = proposed.evaluation.decision === 'pass';
  status.textContent = '';
  const box = el('div', { class: 'amendment' },
    el('div', { class: 'amendment-head' },
      el('span', { class: 'amendment-badge' }, t('reflect.proposed', { n: kept.length }))),
    el('pre', { class: 'amendment-text' }, text),
    el('div', { class: `edit-status ${passed ? 'ok' : 'err'}` },
      t(passed ? 'reflect.evalPassed' : 'reflect.evalFailed', {
        targeted: proposed.evaluation.metrics.targetedCount,
        holdout: proposed.evaluation.metrics.holdoutCount,
      })),
    el('div', { class: 'hint' }, t('reflect.evalStructural')),
    el('div', { class: 'hint' }, t('reflect.applyHint')),
    el('div', { class: 'modal-actions' },
      el('button', {
        class: 'btn sm',
        disabled: passed ? undefined : '',
        onclick: async () => {
          activateSkillCandidate({
            skillId: def.skillId,
            candidateId: proposed.candidate.id,
            evaluationId: proposed.evaluation.id,
          });
          markReflected(
            def.skillId,
            rule,
            proposed.candidate.id,
            proposed.candidate.feedbackIds,
          );
          toast(t('reflect.applied', { skill: def.id }));
          await renderDetail(body, def, format, 'about');
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
