/**
 * Compatibility facade for Skill text used by the existing runners and UI.
 *
 * The versioning rules and persistence workflow live outside core:
 *   domain/       immutable revisions, candidates and promotion invariants
 *   application/  propose, evaluate, promote, rollback use cases
 *
 * This module only loads repository files and translates the old path-based
 * calls while the rest of the app migrates to stable `skill://` identities.
 */
import { logInfo, logWarn } from './log.js';
import { set } from './state.js';
import { t } from './i18n.js';
import { fetchAsset } from './net.js';
import { makeSkillId } from '../domain/feedback.js';
import {
  activeSkillRevision,
  applyAmendmentDirectly,
  ensureSkill,
  exportSkillWorkspace,
  latestSkillCandidate,
  promoteSkillCandidate,
  proposeAmendment,
  replaceSkillText,
  restoreBaseSkill,
  revisionHistory,
  rollbackActiveSkill,
  skillEntry,
} from '../application/skill-revisions.js';

const LEGACY_STORE_KEY = 'annotator_skill_overrides';
const baseCache = new Map();
const legacyOverrides = loadLegacyOverrides();

function loadLegacyOverrides() {
  let raw;
  try {
    raw = JSON.parse(localStorage.getItem(LEGACY_STORE_KEY) || '{}');
  } catch {
    return {};
  }
  const out = {};
  for (const [path, value] of Object.entries(raw)) {
    out[path] = typeof value === 'string' ? { mode: 'amend', text: value } : value;
  }
  return out;
}

/** The unmodified file as shipped in data/. */
export async function loadBaseText(relPath) {
  if (baseCache.has(relPath)) return baseCache.get(relPath);
  const res = await fetchAsset(`data/${relPath}`);
  const text = res.ok ? await res.text() : '';
  if (!res.ok) logWarn('skills', t('pipe.skillMissing', { path: relPath }));
  baseCache.set(relPath, text);
  return text;
}

/**
 * What a runner should send. `skillId` is optional only for legacy callers;
 * built-in file paths can be inferred without merging equal display names.
 */
export async function loadEffectiveText(
  relPath,
  skillId = '',
  inlineBaseText = null,
  artifactKind = inferArtifactKind(relPath),
) {
  const base = inlineBaseText === null ? await loadBaseText(relPath) : String(inlineBaseText);
  const stableId = skillId || inferSkillId(relPath);
  if (!stableId) return legacyEffectiveText(relPath, base);
  ensureSkill({
    skillId: stableId,
    file: relPath,
    baseText: base,
    legacyOverride: legacyOverrides[relPath] || null,
    artifactKind,
  });
  forgetMigratedLegacyOverride(relPath);
  return revisionText(activeSkillRevision(stableId), artifactKind) || base;
}

/** The accepted amendment in force, or an empty string for base/rewrite. */
export function getOverride(relPath, skillId = '') {
  const info = getOverrideInfo(relPath, skillId);
  return info?.mode === 'amend' ? info.text : '';
}

export function getOverrideInfo(relPath, skillId = '') {
  const stableId = skillId || inferSkillId(relPath);
  const active = stableId ? activeSkillRevision(stableId) : null;
  if (active && active.content.mode !== 'base') {
    return {
      mode: active.content.mode,
      text: active.content.mode === 'amend'
        ? String(active.content.amendment || '')
        : revisionText(active, inferArtifactKind(relPath)),
      revisionId: active.id,
    };
  }
  // Once a versioned lifecycle exists it is authoritative. Falling back to
  // the legacy path map here resurrects an already-migrated amendment after
  // the user restores the repository revision.
  if (stableId && skillEntry(stableId)) return null;
  return legacyOverrides[relPath] || null;
}

/** A deliberate human rewrite is a revision and becomes active immediately. */
export async function setFullText(relPath, text, skillId = '', inlineBaseText = null) {
  const base = inlineBaseText === null ? await loadBaseText(relPath) : String(inlineBaseText);
  const stableId = requiredSkillId(relPath, skillId);
  const artifactKind = inferArtifactKind(relPath);
  ensureSkill({
    skillId: stableId,
    file: relPath,
    baseText: base,
    legacyOverride: legacyOverrides[relPath] || null,
    artifactKind,
  });
  const active = activeSkillRevision(stableId);
  if (String(text).trim() === revisionText(active, artifactKind).trim()) {
    return active?.content.mode !== 'base';
  }
  if (String(text).trim() === String(base).trim()) {
    await clearOverride(relPath, stableId);
    return false;
  }
  replaceSkillText({
    skillId: stableId,
    file: relPath,
    baseText: base,
    text: String(text),
    actor: 'local-annotator',
    at: new Date().toISOString(),
    artifactKind,
  });
  logInfo('skills', t('skills.rewritten', { file: relPath }));
  set({}, 'skills');
  return true;
}

/**
 * Compatibility helper for tests/tools. The reviewed UI uses the explicit
 * propose → evaluate → promote functions below.
 */
export async function addAmendment(relPath, text, skillId = '') {
  const base = await loadBaseText(relPath);
  const stableId = requiredSkillId(relPath, skillId);
  ensureSkill({
    skillId: stableId,
    file: relPath,
    baseText: base,
    legacyOverride: legacyOverrides[relPath] || null,
  });
  applyAmendmentDirectly({
    skillId: stableId,
    file: relPath,
    baseText: base,
    amendment: String(text || '').trim(),
    heading: t('skills.amendHeading'),
    at: new Date().toISOString(),
  });
  logInfo('skills', t('skills.applied', { file: relPath }));
  set({}, 'skills');
  return getOverride(relPath, stableId);
}

/** Create and persist an evaluated candidate without changing active text. */
export async function proposeSkillAmendment({ skillId, relPath, text, feedbackEvents, createdBy }) {
  const base = await loadBaseText(relPath);
  ensureSkill({
    skillId,
    file: relPath,
    baseText: base,
    legacyOverride: legacyOverrides[relPath] || null,
  });
  const proposed = proposeAmendment({
    skillId,
    file: relPath,
    baseText: base,
    amendment: text,
    feedbackEvents,
    heading: t('skills.amendHeading'),
    createdAt: new Date().toISOString(),
    createdBy,
  });
  set({}, 'skills');
  return proposed;
}

/** Publish a previously persisted candidate that passed its evaluation. */
export function activateSkillCandidate({ skillId, candidateId, evaluationId }) {
  const revision = promoteSkillCandidate({
    skillId,
    candidateId,
    evaluationId,
    actor: 'human:local-annotator',
    at: new Date().toISOString(),
  });
  logInfo('skills', `activated ${revision.id} for ${skillId}`);
  set({}, 'skills');
  return revision;
}

/** Move back one active revision, retaining the complete history. */
export function rollbackSkillRevision(skillId) {
  const revision = rollbackActiveSkill({
    skillId,
    actor: 'human:local-annotator',
    reason: 'User requested rollback',
    at: new Date().toISOString(),
  });
  set({}, 'skills');
  return revision;
}

/** Restore the repository version while preserving revision/audit history. */
export async function clearOverride(relPath, skillId = '') {
  const base = await loadBaseText(relPath);
  const stableId = requiredSkillId(relPath, skillId);
  ensureSkill({
    skillId: stableId,
    file: relPath,
    baseText: base,
    legacyOverride: legacyOverrides[relPath] || null,
  });
  restoreBaseSkill({
    skillId: stableId,
    actor: 'human:local-annotator',
    at: new Date().toISOString(),
  });
  forgetMigratedLegacyOverride(relPath);
  logInfo('skills', t('skills.reverted', { file: relPath }));
  set({}, 'skills');
}

function forgetMigratedLegacyOverride(relPath) {
  if (!Object.prototype.hasOwnProperty.call(legacyOverrides, relPath)) return;
  delete legacyOverrides[relPath];
  try {
    if (Object.keys(legacyOverrides).length) {
      localStorage.setItem(LEGACY_STORE_KEY, JSON.stringify(legacyOverrides));
    } else {
      localStorage.removeItem(LEGACY_STORE_KEY);
    }
  } catch {
    // The versioned workspace was already persisted; stale compatibility data
    // is ignored by getOverrideInfo even if quota/privacy mode blocks cleanup.
  }
}

export function getRevisionHistory(skillId) {
  return revisionHistory(skillId);
}

export function getActiveRevisionId(skillId) {
  return activeSkillRevision(skillId)?.id || '';
}

export function getLatestCandidate(skillId) {
  const candidate = latestSkillCandidate(skillId);
  if (!candidate) return null;
  const entry = skillEntry(skillId);
  const evaluation = Object.values(entry?.evaluations || {})
    .find((item) => item.candidateId === candidate.id) || null;
  return { candidate, evaluation };
}

export function exportSkillArtifacts(skillIds = null) {
  return exportSkillWorkspace(skillIds);
}

function legacyEffectiveText(relPath, base) {
  const override = legacyOverrides[relPath];
  if (!override) return base;
  if (override.mode === 'replace') return override.text;
  return `${base}\n\n${t('skills.amendHeading')}\n\n${override.text}`;
}

function requiredSkillId(relPath, supplied) {
  const skillId = supplied || inferSkillId(relPath);
  if (!skillId) throw new TypeError(`No stable skillId for ${relPath}`);
  return skillId;
}

function inferArtifactKind(relPath) {
  return String(relPath).endsWith('.js') ? 'code' : 'prompt';
}

function revisionText(revision, artifactKind) {
  if (!revision?.content) return '';
  return String(artifactKind === 'code' ? revision.content.code || '' : revision.content.instructions || '');
}

/** Compatibility mapping for the built-in packs during the gradual migration. */
export function inferSkillId(relPath) {
  let match = /^skills\/(shared|sentiment|refine)\/([a-z0-9][a-z0-9._-]*)\.md$/.exec(relPath);
  if (match) {
    const namespace = match[1] === 'shared' ? 'umr' : match[1];
    return makeSkillId(namespace, match[2]);
  }
  match = /^reference\/refine\/([a-z0-9][a-z0-9._-]*)\.js$/.exec(relPath);
  return match ? makeSkillId('refine', match[1]) : '';
}
