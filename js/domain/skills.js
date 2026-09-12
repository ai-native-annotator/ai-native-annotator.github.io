/**
 * Immutable skill revisions and their active pointer.
 *
 * A SkillDef's existing `id` remains the local execution/display name. The
 * stable `skillId` is separate and names the actual evolving method. Revisions
 * are immutable snapshots; promotion and rollback return a new lifecycle whose
 * active pointer changed, preserving every previous state for audit/recovery.
 */

import {
  fingerprint,
  immutable,
  invariant,
  nonEmpty,
  stableStringify,
  uniqueStrings,
} from './_value.js';
import { assertSkillId, makeSkillId } from './feedback.js';
import { evaluationPasses } from './evaluation.js';

export { makeSkillId };

export const SKILL_KINDS = Object.freeze(['prompt', 'code', 'composite']);
export const CANDIDATE_STATUSES = Object.freeze([
  'draft',
  'evaluating',
  'passed',
  'failed',
  'approved',
  'rejected',
]);

/** Create one immutable snapshot of everything that makes a skill behave. */
export function createSkillRevision(input) {
  invariant(input && typeof input === 'object', 'revision input is required');
  const skillId = assertSkillId(input.skillId);
  const content = input.content;
  invariant(content && typeof content === 'object', 'revision.content is required');
  invariant(
    String(content.instructions ?? '').trim() || String(content.code ?? '').trim(),
    'revision.content must contain instructions or code',
  );
  const skillKind =
    input.skillKind ||
    (String(content.code ?? '').trim()
      ? String(content.instructions ?? '').trim()
        ? 'composite'
        : 'code'
      : 'prompt');
  invariant(SKILL_KINDS.includes(skillKind), `unsupported skill kind: ${skillKind}`);

  const core = {
    kind: 'skill-revision',
    skillId,
    skillKind,
    parentRevisionId:
      input.parentRevisionId === null || input.parentRevisionId === undefined
        ? null
        : nonEmpty(input.parentRevisionId, 'revision.parentRevisionId'),
    content,
    dependencyHashes: input.dependencyHashes || {},
    createdAt: nonEmpty(input.createdAt, 'revision.createdAt'),
    createdBy: input.createdBy || { type: 'human' },
    sourceFeedbackIds: uniqueStrings(input.sourceFeedbackIds || [], 'revision.sourceFeedbackIds'),
    changeSummary: String(input.changeSummary ?? ''),
  };
  const id = input.id || `rev:${fingerprint(core)}`;
  return immutable({ ...core, id: nonEmpty(id, 'revision.id') }, 'skill revision');
}

/** A persisted candidate links evidence and evaluation to a proposed revision. */
export function createCandidate(input) {
  invariant(input && typeof input === 'object', 'candidate input is required');
  const core = {
    kind: 'skill-candidate',
    skillId: assertSkillId(input.skillId),
    baseRevisionId:
      input.baseRevisionId === null || input.baseRevisionId === undefined
        ? null
        : nonEmpty(input.baseRevisionId, 'candidate.baseRevisionId'),
    proposedRevisionId: nonEmpty(input.proposedRevisionId, 'candidate.proposedRevisionId'),
    feedbackIds: uniqueStrings(input.feedbackIds || [], 'candidate.feedbackIds'),
    diagnosis: input.diagnosis || { cause: 'instruction', confidence: 0 },
    patch: input.patch || {},
    status: input.status || 'draft',
    createdAt: nonEmpty(input.createdAt, 'candidate.createdAt'),
  };
  invariant(
    CANDIDATE_STATUSES.includes(core.status),
    `unsupported candidate status: ${core.status}`,
  );
  invariant(
    core.baseRevisionId !== core.proposedRevisionId,
    'candidate must point to a revision different from its base',
  );
  const id = input.id || `candidate:${fingerprint(core)}`;
  return immutable({ ...core, id: nonEmpty(id, 'candidate.id') }, 'skill candidate');
}

/** Advance candidate review state without changing its stable identity. */
export function transitionCandidate(candidate, status) {
  invariant(candidate?.kind === 'skill-candidate', 'a SkillCandidate is required');
  invariant(CANDIDATE_STATUSES.includes(status), `unsupported candidate status: ${status}`);
  const allowed = {
    draft: ['evaluating', 'rejected'],
    evaluating: ['passed', 'failed', 'rejected'],
    passed: ['approved', 'rejected'],
    failed: ['rejected'],
    approved: [],
    rejected: [],
  };
  invariant(
    allowed[candidate.status].includes(status),
    `candidate cannot transition from ${candidate.status} to ${status}`,
  );
  return immutable({ ...candidate, status }, 'skill candidate');
}

/** Create the aggregate that owns revisions and the one active pointer. */
export function createSkillLifecycle({
  skillId,
  revisions = [],
  activeRevisionId = null,
  events = [],
}) {
  const stableId = assertSkillId(skillId);
  invariant(Array.isArray(revisions), 'revisions must be an array');
  const byId = {};
  for (const revision of revisions) {
    assertRevisionFor(revision, stableId);
    invariant(!byId[revision.id], `duplicate revision id: ${revision.id}`);
    byId[revision.id] = revision;
  }
  if (activeRevisionId !== null) {
    nonEmpty(activeRevisionId, 'activeRevisionId');
    invariant(
      Boolean(byId[activeRevisionId]),
      `active revision is not in the lifecycle: ${activeRevisionId}`,
    );
  }
  invariant(Array.isArray(events), 'events must be an array');
  return immutable(
    {
      kind: 'skill-lifecycle',
      skillId: stableId,
      revisions: byId,
      activeRevisionId,
      events,
    },
    'skill lifecycle',
  );
}

/** Add a branchable immutable revision; the active pointer is unchanged. */
export function addRevision(lifecycle, revision) {
  assertLifecycle(lifecycle);
  assertRevisionFor(revision, lifecycle.skillId);
  const existing = lifecycle.revisions[revision.id];
  if (existing) {
    invariant(
      stableStringify(existing) === stableStringify(revision),
      `revision id collision: ${revision.id}`,
    );
    return lifecycle;
  }
  if (Object.keys(lifecycle.revisions).length) {
    invariant(
      revision.parentRevisionId && lifecycle.revisions[revision.parentRevisionId],
      'a non-initial revision must name a parent in the lifecycle',
    );
  }
  return createSkillLifecycle({
    skillId: lifecycle.skillId,
    revisions: [...Object.values(lifecycle.revisions), revision],
    activeRevisionId: lifecycle.activeRevisionId,
    events: lifecycle.events,
  });
}

/** Return the active immutable revision, or null for a not-yet-published skill. */
export function activeRevision(lifecycle) {
  assertLifecycle(lifecycle);
  return lifecycle.activeRevisionId ? lifecycle.revisions[lifecycle.activeRevisionId] : null;
}

/**
 * Promote only a candidate evaluated against the currently active base.
 * In-flight/stale candidates cannot overwrite a newer active revision.
 */
export function promoteCandidate(lifecycle, candidate, evaluation, decision) {
  assertLifecycle(lifecycle);
  invariant(candidate?.kind === 'skill-candidate', 'a SkillCandidate is required');
  invariant(candidate.status === 'passed', 'only a passed candidate can be promoted');
  invariant(candidate.skillId === lifecycle.skillId, 'candidate belongs to a different skill');
  invariant(
    candidate.baseRevisionId === lifecycle.activeRevisionId,
    'candidate base is stale; evaluate it against the active revision again',
  );
  invariant(
    Boolean(lifecycle.revisions[candidate.proposedRevisionId]),
    'candidate proposed revision is not in the lifecycle',
  );
  const revision = lifecycle.revisions[candidate.proposedRevisionId];
  invariant(
    revision.parentRevisionId === candidate.baseRevisionId,
    'candidate revision parent does not match its base',
  );
  invariant(
    candidate.feedbackIds.every((id) => revision.sourceFeedbackIds.includes(id)),
    'candidate evidence must be recorded on its proposed revision',
  );

  invariant(evaluationPasses(evaluation), 'candidate evaluation did not pass');
  invariant(evaluation.candidateId === candidate.id, 'evaluation belongs to a different candidate');
  invariant(evaluation.skillId === lifecycle.skillId, 'evaluation belongs to a different skill');
  invariant(
    evaluation.baseRevisionId === candidate.baseRevisionId &&
      evaluation.proposedRevisionId === candidate.proposedRevisionId,
    'evaluation revision pair does not match the candidate',
  );

  invariant(decision && typeof decision === 'object', 'promotion decision is required');
  const eventCore = {
    kind: 'promotion-event',
    type: 'promote',
    skillId: lifecycle.skillId,
    fromRevisionId: lifecycle.activeRevisionId,
    toRevisionId: candidate.proposedRevisionId,
    candidateId: candidate.id,
    evaluationReportId: evaluation.id,
    policy: nonEmpty(decision.policy, 'promotion.policy'),
    actor: nonEmpty(decision.actor, 'promotion.actor'),
    at: nonEmpty(decision.at, 'promotion.at'),
    reason: String(decision.reason ?? ''),
  };
  const event = immutable(
    { ...eventCore, id: decision.id || `promotion:${fingerprint(eventCore)}` },
    'promotion event',
  );
  return createSkillLifecycle({
    skillId: lifecycle.skillId,
    revisions: Object.values(lifecycle.revisions),
    activeRevisionId: candidate.proposedRevisionId,
    events: [...lifecycle.events, event],
  });
}

/** Roll back by moving the active pointer; no revision or prior event is erased. */
export function rollbackSkill(lifecycle, decision) {
  assertLifecycle(lifecycle);
  invariant(lifecycle.activeRevisionId, 'cannot roll back a skill with no active revision');
  invariant(decision && typeof decision === 'object', 'rollback decision is required');
  const current = lifecycle.revisions[lifecycle.activeRevisionId];
  const activationEvent = [...lifecycle.events]
    .reverse()
    .find((event) => event.type === 'promote' && event.toRevisionId === lifecycle.activeRevisionId);
  // Revision ancestry is the source of truth for "one version back". Using
  // the latest pointer event here makes a second rollback undo the first one
  // (B -> C) instead of continuing through history (B -> A).
  const toRevisionId = decision.toRevisionId ?? current.parentRevisionId;
  invariant(toRevisionId, 'rollback target is required when no previous active revision exists');
  invariant(
    Boolean(lifecycle.revisions[toRevisionId]),
    `rollback target is not in the lifecycle: ${toRevisionId}`,
  );
  invariant(toRevisionId !== lifecycle.activeRevisionId, 'rollback target is already active');
  invariant(
    isAncestorRevision(lifecycle, current.id, toRevisionId),
    'rollback target must be an ancestor of the active revision',
  );

  const eventCore = {
    kind: 'promotion-event',
    type: 'rollback',
    skillId: lifecycle.skillId,
    fromRevisionId: lifecycle.activeRevisionId,
    toRevisionId,
    rollbackOf: activationEvent?.id || null,
    actor: nonEmpty(decision.actor, 'rollback.actor'),
    at: nonEmpty(decision.at, 'rollback.at'),
    reason: nonEmpty(decision.reason, 'rollback.reason'),
  };
  const event = immutable(
    { ...eventCore, id: decision.id || `rollback:${fingerprint(eventCore)}` },
    'rollback event',
  );
  return createSkillLifecycle({
    skillId: lifecycle.skillId,
    revisions: Object.values(lifecycle.revisions),
    activeRevisionId: toRevisionId,
    events: [...lifecycle.events, event],
  });
}

function isAncestorRevision(lifecycle, fromRevisionId, targetRevisionId) {
  let cursor = lifecycle.revisions[fromRevisionId]?.parentRevisionId || null;
  while (cursor) {
    if (cursor === targetRevisionId) return true;
    cursor = lifecycle.revisions[cursor]?.parentRevisionId || null;
  }
  return false;
}

function assertLifecycle(lifecycle) {
  invariant(lifecycle?.kind === 'skill-lifecycle', 'a SkillLifecycle is required');
  assertSkillId(lifecycle.skillId);
}

function assertRevisionFor(revision, skillId) {
  invariant(revision?.kind === 'skill-revision', 'a SkillRevision is required');
  invariant(revision.skillId === skillId, 'revision belongs to a different skill');
}
