/**
 * Application service for versioned Skill artifacts.
 *
 * It owns persistence and use-case sequencing; the rules themselves live in
 * js/domain. UI and runners never mutate revision records directly.
 */
import { createLocalJsonStore } from '../adapters/storage/local-json-store.js';
import { fingerprint } from '../domain/_value.js';
import {
  activeRevision,
  addRevision,
  createCandidate,
  createSkillLifecycle,
  createSkillRevision,
  promoteCandidate,
  rollbackSkill,
  transitionCandidate,
} from '../domain/skills.js';
import { createEvaluationReport } from '../domain/evaluation.js';

export const SKILL_WORKSPACE_SCHEMA_VERSION = 1;
export const SKILL_WORKSPACE_KEY = 'annotator_skill_workspace_v1';

const emptyWorkspace = () => ({
  schemaVersion: SKILL_WORKSPACE_SCHEMA_VERSION,
  skills: {},
});

const defaultStore =
  typeof localStorage === 'undefined' ? null : createLocalJsonStore(SKILL_WORKSPACE_KEY);

let store = defaultStore;
let workspace = loadWorkspace();

function loadWorkspace() {
  if (!store) return emptyWorkspace();
  try {
    return hydrateWorkspace(store.read(emptyWorkspace()));
  } catch {
    return emptyWorkspace();
  }
}

function persist() {
  if (!store) return;
  store.write(workspace);
}

/** Dependency-injection seam used by unit tests and future storage adapters. */
export function useSkillWorkspaceStore(nextStore) {
  store = nextStore || null;
  workspace = loadWorkspace();
}

export function exportSkillWorkspace(skillIds = null) {
  const snapshot = structuredClone(workspace);
  if (skillIds === null) return snapshot;
  const selected = new Set(skillIds);
  snapshot.skills = Object.fromEntries(
    Object.entries(snapshot.skills).filter(([skillId]) => selected.has(skillId)),
  );
  return snapshot;
}

export function importSkillWorkspace(snapshot) {
  workspace = hydrateWorkspace(snapshot);
  persist();
}

function hydrateWorkspace(snapshot) {
  if (
    snapshot?.schemaVersion !== SKILL_WORKSPACE_SCHEMA_VERSION ||
    !snapshot.skills ||
    typeof snapshot.skills !== 'object' ||
    Array.isArray(snapshot.skills)
  ) {
    throw new TypeError('Unsupported skill workspace');
  }
  const skills = {};
  for (const [skillId, raw] of Object.entries(snapshot.skills)) {
    if (!raw || raw.skillId !== skillId || raw.lifecycle?.skillId !== skillId) {
      throw new TypeError(`Invalid workspace entry: ${skillId}`);
    }
    const revisions = Object.values(raw.lifecycle.revisions || {}).map((revision) =>
      createSkillRevision(revision),
    );
    const lifecycle = createSkillLifecycle({
      skillId,
      revisions,
      activeRevisionId: raw.lifecycle.activeRevisionId,
      events: raw.lifecycle.events || [],
    });
    validateRevisionGraph(lifecycle);
    if (!lifecycle.revisions[raw.baseRevisionId]) {
      throw new TypeError(`Missing base revision for ${skillId}`);
    }
    const candidates = Object.fromEntries(
      Object.entries(raw.candidates || {}).map(([id, candidate]) => {
        const restored = createCandidate(candidate);
        if (restored.id !== id || restored.skillId !== skillId) {
          throw new TypeError(`Invalid candidate ${id} for ${skillId}`);
        }
        if (
          !lifecycle.revisions[restored.proposedRevisionId] ||
          (restored.baseRevisionId && !lifecycle.revisions[restored.baseRevisionId])
        ) {
          throw new TypeError(`Candidate ${id} references a missing revision`);
        }
        return [id, restored];
      }),
    );
    const evaluations = Object.fromEntries(
      Object.entries(raw.evaluations || {}).map(([id, report]) => {
        const restored = createEvaluationReport({
          id: report.id,
          mode: report.mode,
          candidateId: report.candidateId,
          skillId: report.skillId,
          baseRevisionId: report.baseRevisionId,
          proposedRevisionId: report.proposedRevisionId,
          evaluatedAt: report.evaluatedAt,
          targetedCases: report.results?.targeted,
          holdoutCases: report.results?.holdout,
          schemaPass: report.metrics?.schemaPass,
          policy: report.policy,
        });
        if (
          restored.id !== id ||
          restored.skillId !== skillId ||
          !candidates[restored.candidateId]
        ) {
          throw new TypeError(`Invalid evaluation ${id} for ${skillId}`);
        }
        return [id, restored];
      }),
    );
    for (const event of lifecycle.events) {
      if (event.candidateId && !candidates[event.candidateId]) {
        throw new TypeError(`Activation event references missing candidate ${event.candidateId}`);
      }
      if (event.evaluationReportId && !evaluations[event.evaluationReportId]) {
        throw new TypeError(
          `Activation event references missing evaluation ${event.evaluationReportId}`,
        );
      }
    }
    skills[skillId] = {
      skillId,
      file: String(raw.file || ''),
      artifactKind: raw.artifactKind || 'prompt',
      baseRevisionId: raw.baseRevisionId,
      lifecycle,
      candidates,
      evaluations,
    };
  }
  return { schemaVersion: SKILL_WORKSPACE_SCHEMA_VERSION, skills };
}

function validateRevisionGraph(lifecycle) {
  for (const revision of Object.values(lifecycle.revisions)) {
    if (revision.parentRevisionId && !lifecycle.revisions[revision.parentRevisionId]) {
      throw new TypeError(`Revision ${revision.id} has a missing parent`);
    }
    const seen = new Set([revision.id]);
    let cursor = revision.parentRevisionId;
    while (cursor) {
      if (seen.has(cursor)) throw new TypeError(`Revision cycle detected at ${cursor}`);
      seen.add(cursor);
      cursor = lifecycle.revisions[cursor]?.parentRevisionId || null;
    }
  }
}

/** Ensure a repository-backed base revision exists for one stable Skill. */
export function ensureSkill({
  skillId,
  file,
  baseText,
  legacyOverride = null,
  artifactKind = 'prompt',
}) {
  if (artifactKind !== 'prompt' && artifactKind !== 'code') {
    throw new TypeError(`Unsupported skill artifact kind: ${artifactKind}`);
  }
  const existing = workspace.skills[skillId];
  if (existing) {
    return synchronizeRepositoryBase(existing, {
      file,
      baseText: String(baseText || ''),
      artifactKind,
    });
  }

  const base = createSkillRevision({
    id: `rev:${fingerprint({ skillId, artifactKind, baseText })}`,
    skillId,
    skillKind: artifactKind,
    content: artifactContent(artifactKind, baseText, 'base', ''),
    createdAt: 'repository',
    createdBy: { type: 'repository', file },
  });
  let lifecycle = createSkillLifecycle({
    skillId,
    revisions: [base],
    activeRevisionId: base.id,
  });
  const candidates = {};
  const evaluations = {};

  if (legacyOverride?.text) {
    const mode = legacyOverride.mode === 'replace' ? 'replace' : 'amend';
    const amendment = mode === 'amend' ? String(legacyOverride.text) : '';
    const text =
      mode === 'replace'
        ? String(legacyOverride.text)
        : artifactKind === 'code'
          ? `${String(baseText || '').trimEnd()}\n\n${amendment}`
          : appendAmendment(base.content.instructions, amendment, '## Human amendments');
    const migrated = createSkillRevision({
      skillId,
      parentRevisionId: base.id,
      skillKind: artifactKind,
      content: artifactContent(artifactKind, text, mode, amendment),
      createdAt: legacyOverride.updatedAt || 'legacy-local-storage',
      createdBy: { type: 'migration', from: 'annotator_skill_overrides' },
      changeSummary: 'Migrated local override',
    });
    lifecycle = addRevision(lifecycle, migrated);
    const activation = activateWithoutQualityGate(lifecycle, migrated, 'migration');
    lifecycle = activation.lifecycle;
    candidates[activation.candidate.id] = activation.candidate;
    evaluations[activation.evaluation.id] = activation.evaluation;
  }

  const entry = {
    skillId,
    file,
    artifactKind,
    baseRevisionId: base.id,
    lifecycle,
    candidates,
    evaluations,
  };
  workspace.skills[skillId] = entry;
  persist();
  return entry;
}

function synchronizeRepositoryBase(entry, { file, baseText, artifactKind }) {
  const shipped = entry.lifecycle.revisions[entry.baseRevisionId];
  if (!shipped) throw new TypeError(`Missing repository base for ${entry.skillId}`);
  const sameBase = artifactText(shipped) === baseText && shipped.skillKind === artifactKind;
  if (sameBase) {
    if (entry.file !== file) {
      entry.file = file;
      persist();
    }
    return entry;
  }

  const previous = activeRevision(entry.lifecycle);
  const repositoryRevision = createSkillRevision({
    id: `rev:repo:${fingerprint({
      skillId: entry.skillId,
      artifactKind,
      baseText,
      parentRevisionId: previous.id,
    })}`,
    skillId: entry.skillId,
    skillKind: artifactKind,
    parentRevisionId: previous.id,
    content: artifactContent(artifactKind, baseText, 'base', ''),
    createdAt: `repository:${fingerprint(baseText)}`,
    createdBy: { type: 'repository', file },
    changeSummary: 'Repository base updated',
  });
  entry.lifecycle = addRevision(entry.lifecycle, repositoryRevision);
  let activation = activateWithoutQualityGate(
    entry.lifecycle,
    repositoryRevision,
    'repository-update',
  );
  entry.lifecycle = activation.lifecycle;
  entry.candidates[activation.candidate.id] = activation.candidate;
  entry.evaluations[activation.evaluation.id] = activation.evaluation;
  entry.baseRevisionId = repositoryRevision.id;
  entry.file = file;
  entry.artifactKind = artifactKind;

  if (previous.content.mode !== 'base') {
    const amendment = String(previous.content.amendment || '');
    const rebasedText =
      previous.content.mode === 'amend'
        ? artifactKind === 'code'
          ? `${baseText.trimEnd()}\n\n${amendment}`
          : appendAmendment(baseText, amendment, '## Human amendments')
        : artifactText(previous);
    const rebased = createSkillRevision({
      skillId: entry.skillId,
      skillKind: artifactKind,
      parentRevisionId: repositoryRevision.id,
      content: artifactContent(artifactKind, rebasedText, previous.content.mode, amendment),
      createdAt: `repository-rebase:${fingerprint({ baseText, from: previous.id })}`,
      createdBy: { type: 'rebase', fromRevisionId: previous.id },
      sourceFeedbackIds: previous.sourceFeedbackIds,
      changeSummary: 'Rebased local revision onto updated repository base',
    });
    entry.lifecycle = addRevision(entry.lifecycle, rebased);
    activation = activateWithoutQualityGate(entry.lifecycle, rebased, 'repository-rebase');
    entry.lifecycle = activation.lifecycle;
    entry.candidates[activation.candidate.id] = activation.candidate;
    entry.evaluations[activation.evaluation.id] = activation.evaluation;
  }
  persist();
  return entry;
}

export function skillEntry(skillId) {
  return workspace.skills[skillId] || null;
}

export function activeSkillRevision(skillId) {
  const entry = skillEntry(skillId);
  return entry ? activeRevision(entry.lifecycle) : null;
}

export function revisionHistory(skillId) {
  const entry = skillEntry(skillId);
  if (!entry) return [];
  return Object.values(entry.lifecycle.revisions);
}

/**
 * Persist a candidate amendment and a conservative structural evaluation.
 * This does not claim semantic improvement: it proves evidence linkage,
 * non-empty instructions, and that an amendment preserved the active text.
 * A human must still promote it; semantic evaluators can replace this adapter.
 */
export function proposeAmendment({
  skillId,
  file,
  baseText,
  amendment,
  feedbackEvents = [],
  heading,
  createdAt,
  createdBy,
  allowNoFeedback = false,
}) {
  const entry = ensureSkill({ skillId, file, baseText });
  const current = activeRevision(entry.lifecycle);
  if (!Array.isArray(feedbackEvents)) throw new TypeError('feedbackEvents must be an array');
  if (!feedbackEvents.length && !allowNoFeedback) {
    throw new TypeError('A generated candidate requires reviewed feedback evidence');
  }
  for (const event of feedbackEvents) {
    if (event?.kind !== 'feedback-event')
      throw new TypeError('Candidate evidence must be a FeedbackEvent');
    if (event.status !== 'kept') throw new TypeError(`Feedback ${event.id} has not been kept`);
    if (event.skillId !== skillId)
      throw new TypeError(`Feedback ${event.id} belongs to another skill`);
    if (event.revisionId !== current.id) {
      throw new TypeError(`Feedback ${event.id} was recorded against a different skill revision`);
    }
  }
  const feedbackIds = feedbackEvents.map((event) => event.id);
  if (new Set(feedbackIds).size !== feedbackIds.length) {
    throw new TypeError('Candidate feedback evidence must not contain duplicates');
  }
  const rule = String(amendment || '').trim();
  if (!rule) throw new TypeError('An amendment cannot be empty');
  const previousAmendment = String(current.content.amendment || '').trim();
  const allAmendments = previousAmendment ? `${previousAmendment}\n\n${rule}` : rule;
  const instructions = appendAmendment(
    current.content.instructions,
    rule,
    previousAmendment ? '' : heading,
  );
  const revision = createSkillRevision({
    skillId,
    parentRevisionId: current.id,
    content: {
      instructions,
      mode: current.content.mode === 'replace' ? 'replace' : 'amend',
      amendment: allAmendments,
    },
    createdAt,
    createdBy,
    sourceFeedbackIds: feedbackIds,
    changeSummary: rule.slice(0, 160),
  });
  const lifecycle = addRevision(entry.lifecycle, revision);
  const candidate = createCandidate({
    skillId,
    baseRevisionId: current.id,
    proposedRevisionId: revision.id,
    feedbackIds,
    diagnosis: { cause: 'instruction', confidence: 1 },
    patch: { mode: 'append', text: rule },
    status: 'passed',
    createdAt,
  });
  const preserved = instructions.startsWith(current.content.instructions);
  const evaluation = createEvaluationReport({
    candidateId: candidate.id,
    skillId,
    baseRevisionId: current.id,
    proposedRevisionId: revision.id,
    evaluatedAt: createdAt,
    mode: 'structural',
    targetedCases: feedbackIds.map((id) => ({ id: `feedback:${id}`, passed: true })),
    holdoutCases: [
      {
        id: `invariant:preserve:${current.id}`,
        baselineScore: 1,
        candidateScore: preserved ? 1 : 0,
        severeRegression: !preserved,
      },
    ],
    schemaPass: Boolean(instructions.trim()),
    policy: {
      minTargetedCases: feedbackIds.length ? 1 : 0,
      minTargetedPassRate: feedbackIds.length ? 1 : 0,
    },
  });

  entry.lifecycle = lifecycle;
  entry.candidates[candidate.id] = candidate;
  entry.evaluations[evaluation.id] = evaluation;
  persist();
  return { revision, candidate, evaluation };
}

export function promoteSkillCandidate({ skillId, candidateId, evaluationId, actor, at }) {
  const entry = requiredEntry(skillId);
  const candidate = entry.candidates[candidateId];
  const evaluation = entry.evaluations[evaluationId];
  if (!candidate || !evaluation) throw new TypeError('Candidate or evaluation was not found');
  entry.lifecycle = promoteCandidate(entry.lifecycle, candidate, evaluation, {
    actor,
    policy: 'manual-after-structural-eval',
    at,
  });
  entry.candidates[candidate.id] = transitionCandidate(candidate, 'approved');
  persist();
  return activeRevision(entry.lifecycle);
}

/** Human file edits are explicit authority, recorded as revisions, not candidates. */
export function replaceSkillText({
  skillId,
  file,
  baseText,
  text,
  actor,
  at,
  artifactKind = 'prompt',
}) {
  const entry = ensureSkill({ skillId, file, baseText, artifactKind });
  const current = activeRevision(entry.lifecycle);
  const revision = createSkillRevision({
    skillId,
    parentRevisionId: current.id,
    skillKind: artifactKind,
    content: artifactContent(artifactKind, text, 'replace', ''),
    createdAt: at,
    createdBy: { type: 'human', id: actor },
    changeSummary: 'Direct human rewrite',
  });
  entry.lifecycle = addRevision(entry.lifecycle, revision);
  const activation = activateWithoutQualityGate(entry.lifecycle, revision, 'human-direct-edit');
  entry.lifecycle = activation.lifecycle;
  entry.candidates[activation.candidate.id] = activation.candidate;
  entry.evaluations[activation.evaluation.id] = activation.evaluation;
  persist();
  return revision;
}

/** Compatibility API for deliberate, programmatic amendments in tests/tools. */
export function applyAmendmentDirectly({ skillId, file, baseText, amendment, heading, at }) {
  const proposed = proposeAmendment({
    skillId,
    file,
    baseText,
    amendment,
    feedbackEvents: [],
    heading,
    createdAt: at,
    createdBy: { type: 'human', id: 'direct-api' },
    allowNoFeedback: true,
  });
  return promoteSkillCandidate({
    skillId,
    candidateId: proposed.candidate.id,
    evaluationId: proposed.evaluation.id,
    actor: 'human:direct-api',
    at,
  });
}

export function rollbackActiveSkill({ skillId, actor, reason, at, toRevisionId }) {
  const entry = requiredEntry(skillId);
  entry.lifecycle = rollbackSkill(entry.lifecycle, { actor, reason, at, toRevisionId });
  persist();
  return activeRevision(entry.lifecycle);
}

export function restoreBaseSkill({ skillId, actor, at }) {
  const entry = requiredEntry(skillId);
  if (entry.lifecycle.activeRevisionId === entry.baseRevisionId)
    return activeRevision(entry.lifecycle);
  return rollbackActiveSkill({
    skillId,
    actor,
    reason: 'Restore repository version',
    at,
    toRevisionId: entry.baseRevisionId,
  });
}

export function latestSkillCandidate(skillId) {
  const entry = skillEntry(skillId);
  if (!entry) return null;
  return Object.values(entry.candidates).at(-1) || null;
}

function activateWithoutQualityGate(lifecycle, revision, policy) {
  const passedCandidate = createCandidate({
    id: `candidate:${policy}:${revision.id}`,
    skillId: lifecycle.skillId,
    baseRevisionId: lifecycle.activeRevisionId,
    proposedRevisionId: revision.id,
    feedbackIds: [],
    status: 'passed',
    createdAt: revision.createdAt,
  });
  const evaluation = createEvaluationReport({
    id: `eval:${policy}:${revision.id}`,
    candidateId: passedCandidate.id,
    skillId: lifecycle.skillId,
    baseRevisionId: lifecycle.activeRevisionId,
    proposedRevisionId: revision.id,
    evaluatedAt: revision.createdAt,
    mode: policy,
    targetedCases: [],
    holdoutCases: [],
    schemaPass: true,
    policy: {
      minTargetedCases: 0,
      minHoldoutCases: 0,
      minTargetedPassRate: 0,
      requireSchemaPass: true,
    },
  });
  const promotedLifecycle = promoteCandidate(lifecycle, passedCandidate, evaluation, {
    actor: policy,
    policy,
    at: revision.createdAt,
  });
  return {
    lifecycle: promotedLifecycle,
    candidate: transitionCandidate(passedCandidate, 'approved'),
    evaluation,
  };
}

function appendAmendment(instructions, amendment, heading) {
  return [String(instructions || '').trimEnd(), String(heading || '').trim(), amendment]
    .filter(Boolean)
    .join('\n\n');
}

function artifactContent(kind, text, mode, amendment) {
  const common = { mode, amendment: String(amendment || '') };
  return kind === 'code'
    ? { ...common, code: String(text || '') }
    : { ...common, instructions: String(text || '') };
}

function artifactText(revision) {
  return String(
    revision?.skillKind === 'code'
      ? revision.content.code || ''
      : revision?.content.instructions || '',
  );
}

function requiredEntry(skillId) {
  const entry = skillEntry(skillId);
  if (!entry) throw new TypeError(`Unknown skill: ${skillId}`);
  return entry;
}
