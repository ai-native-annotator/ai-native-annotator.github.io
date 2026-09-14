/**
 * Human feedback as immutable evidence tied to one exact skill revision/call.
 *
 * A SkillDef's short `id` remains useful for display and execution. It is not
 * an identity: two formats may both have a skill named `aspect`. Feedback is
 * therefore queried only by the stable `skillId` created by makeSkillId().
 */

import { immutable, invariant, nonEmpty } from './_value.js';

export const FEEDBACK_TYPES = Object.freeze([
  'correction',
  'rerun-result',
  'routing-error',
  'objection',
  'acceptance',
]);

export const FEEDBACK_STATUSES = Object.freeze(['open', 'kept', 'dismissed', 'consumed']);

/** Exact-match guard for the canonical skill://<namespace>/<id> identity. */
export function assertSkillId(skillId) {
  const value = nonEmpty(skillId, 'skillId');
  invariant(
    /^skill:\/\/[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)+$/.test(value),
    'skillId must have the form skill://<namespace>/<id>',
  );
  return value;
}

/**
 * Create a canonical identity without conflating equal local ids in different
 * formats: makeSkillId('sentiment', 'aspect') !== makeSkillId('refine', 'aspect').
 */
export function makeSkillId(namespace, id) {
  const segments = nonEmpty(namespace, 'namespace').split('/');
  const localId = nonEmpty(id, 'id');
  for (const [index, segment] of [...segments, localId].entries()) {
    invariant(
      /^[a-z0-9][a-z0-9._-]*$/.test(segment),
      `${index < segments.length ? 'namespace' : 'id'} must use lowercase letters, digits, dot, underscore, or hyphen`,
    );
  }
  return `skill://${segments.join('/')}/${localId}`;
}

/**
 * @param {object} input
 * @returns {Readonly<object>} an immutable FeedbackEvent
 */
export function createFeedbackEvent(input) {
  invariant(input && typeof input === 'object', 'feedback input is required');
  const type = nonEmpty(input.type, 'feedback.type');
  invariant(FEEDBACK_TYPES.includes(type), `unsupported feedback type: ${type}`);
  const status = input.status || 'open';
  invariant(FEEDBACK_STATUSES.includes(status), `unsupported feedback status: ${status}`);

  const document = input.document;
  invariant(document && typeof document === 'object', 'feedback.document is required');

  return immutable(
    {
      kind: 'feedback-event',
      id: nonEmpty(input.id, 'feedback.id'),
      skillId: assertSkillId(input.skillId),
      revisionId: nonEmpty(input.revisionId, 'feedback.revisionId'),
      callId: nonEmpty(input.callId, 'feedback.callId'),
      type,
      document: {
        id: nonEmpty(document.id, 'feedback.document.id'),
        sourceHash: nonEmpty(document.sourceHash, 'feedback.document.sourceHash'),
        sentenceId: nonEmpty(document.sentenceId, 'feedback.document.sentenceId'),
        span: String(document.span ?? ''),
        context: String(document.context ?? ''),
      },
      originalOutput: input.originalOutput ?? null,
      humanOutput: input.humanOutput ?? null,
      rationale: String(input.rationale ?? '').trim(),
      severity: input.severity || 'normal',
      tags: Array.isArray(input.tags) ? [...new Set(input.tags.map(String))] : [],
      status,
      createdAt: nonEmpty(input.createdAt, 'feedback.createdAt'),
      annotatorId: input.annotatorId ? String(input.annotatorId) : null,
      consumedByCandidateId: input.consumedByCandidateId || null,
      evidence: {
        localSkillId: String(input.evidence?.localSkillId ?? ''),
        skillFile: String(input.evidence?.skillFile ?? ''),
        formatId: String(input.evidence?.formatId ?? ''),
        sentenceIndex: Number.isInteger(input.evidence?.sentenceIndex)
          ? input.evidence.sentenceIndex
          : null,
        path:
          input.evidence?.path === null || input.evidence?.path === undefined
            ? null
            : String(input.evidence.path),
        action: String(input.evidence?.action ?? input.type),
        detail: String(input.evidence?.detail ?? ''),
      },
    },
    'feedback',
  );
}

/** Return a new event after the explicit human review transition. */
export function reviewFeedback(event, decision) {
  invariant(event?.kind === 'feedback-event', 'a FeedbackEvent is required');
  invariant(event.status === 'open', 'only open feedback can be reviewed');
  invariant(decision === 'kept' || decision === 'dismissed', 'decision must be kept or dismissed');
  return immutable({ ...event, status: decision }, 'feedback');
}

/** Mark kept evidence as consumed by one candidate without mutating the issue. */
export function consumeFeedback(event, candidateId) {
  invariant(event?.kind === 'feedback-event', 'a FeedbackEvent is required');
  invariant(event.status === 'kept', 'only kept feedback can be consumed');
  return immutable(
    {
      ...event,
      status: 'consumed',
      consumedByCandidateId: nonEmpty(candidateId, 'candidateId'),
    },
    'feedback',
  );
}

/** Exact stable-identity lookup; optional status keeps review code simple. */
export function feedbackForSkill(events, skillId, { status } = {}) {
  const stableId = assertSkillId(skillId);
  invariant(Array.isArray(events), 'events must be an array');
  if (status !== undefined)
    invariant(FEEDBACK_STATUSES.includes(status), `unsupported feedback status: ${status}`);
  return events.filter(
    (event) => event?.skillId === stableId && (status === undefined || event.status === status),
  );
}
