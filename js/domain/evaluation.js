/**
 * Deterministic promotion gates for a proposed skill revision.
 *
 * Targeted cases prove that the feedback which motivated a change is fixed.
 * Holdout cases were not used to write the change and protect the rest of the
 * task from regression. A candidate must pass both; a good average may never
 * hide an explicitly severe regression.
 */

import { immutable, invariant, nonEmpty, fingerprint, uniqueStrings } from './_value.js';
import { assertSkillId } from './feedback.js';

export const DEFAULT_EVALUATION_POLICY = immutable(
  {
    minTargetedCases: 1,
    minHoldoutCases: 1,
    minTargetedPassRate: 1,
    minHoldoutScoreDelta: 0,
    maxSevereRegressions: 0,
    requireSchemaPass: true,
  },
  'default evaluation policy',
);

export function createEvaluationPolicy(overrides = {}) {
  const policy = { ...DEFAULT_EVALUATION_POLICY, ...overrides };
  for (const key of ['minTargetedCases', 'minHoldoutCases', 'maxSevereRegressions']) {
    invariant(
      Number.isInteger(policy[key]) && policy[key] >= 0,
      `${key} must be a non-negative integer`,
    );
  }
  invariant(
    inUnitInterval(policy.minTargetedPassRate),
    'minTargetedPassRate must be between 0 and 1',
  );
  invariant(Number.isFinite(policy.minHoldoutScoreDelta), 'minHoldoutScoreDelta must be finite');
  invariant(typeof policy.requireSchemaPass === 'boolean', 'requireSchemaPass must be boolean');
  return immutable(policy, 'evaluation policy');
}

/**
 * Build a complete report and its pass/fail decision from frozen case results.
 * Targeted cases: {id, passed}. Holdout cases:
 * {id, baselineScore, candidateScore, severeRegression?}.
 */
export function createEvaluationReport(input) {
  invariant(input && typeof input === 'object', 'evaluation input is required');
  const candidateId = nonEmpty(input.candidateId, 'evaluation.candidateId');
  const skillId = assertSkillId(input.skillId);
  const baseRevisionId =
    input.baseRevisionId === null
      ? null
      : nonEmpty(input.baseRevisionId, 'evaluation.baseRevisionId');
  const proposedRevisionId = nonEmpty(input.proposedRevisionId, 'evaluation.proposedRevisionId');
  const policy = createEvaluationPolicy(input.policy || {});
  const targeted = normalizeTargeted(input.targetedCases || []);
  const holdout = normalizeHoldout(input.holdoutCases || []);

  const targetedIds = uniqueStrings(
    targeted.map((item) => item.id),
    'targeted case ids',
  );
  const holdoutIds = uniqueStrings(
    holdout.map((item) => item.id),
    'holdout case ids',
  );
  const holdoutIdSet = new Set(holdoutIds);
  const overlap = targetedIds.filter((id) => holdoutIdSet.has(id));
  invariant(!overlap.length, `targeted and holdout cases must be disjoint: ${overlap.join(', ')}`);

  const targetedPassRate =
    targeted.filter((item) => item.passed).length / Math.max(1, targeted.length);
  const holdoutBaselineMean = mean(holdout.map((item) => item.baselineScore));
  const holdoutCandidateMean = mean(holdout.map((item) => item.candidateScore));
  const holdoutScoreDelta = holdoutCandidateMean - holdoutBaselineMean;
  const severeRegressions = holdout.filter((item) => item.severeRegression).length;
  // A missing validator result is not a successful validator result. Callers
  // that deliberately have no schema can opt out in the explicit policy.
  const schemaPass = input.schemaPass === true;

  const failedChecks = [];
  if (targeted.length < policy.minTargetedCases) failedChecks.push('targeted-case-count');
  if (holdout.length < policy.minHoldoutCases) failedChecks.push('holdout-case-count');
  if (targetedPassRate < policy.minTargetedPassRate) failedChecks.push('targeted-pass-rate');
  if (holdoutScoreDelta < policy.minHoldoutScoreDelta) failedChecks.push('holdout-score-delta');
  if (severeRegressions > policy.maxSevereRegressions) failedChecks.push('severe-regressions');
  if (policy.requireSchemaPass && !schemaPass) failedChecks.push('schema');

  const core = {
    kind: 'evaluation-report',
    mode: input.mode || 'task-output',
    candidateId,
    skillId,
    baseRevisionId,
    proposedRevisionId,
    evaluatedAt: nonEmpty(input.evaluatedAt, 'evaluation.evaluatedAt'),
    policy,
    caseIds: { targeted: targetedIds, holdout: holdoutIds },
    results: { targeted, holdout },
    metrics: {
      targetedCount: targeted.length,
      targetedPassRate,
      holdoutCount: holdout.length,
      holdoutBaselineMean,
      holdoutCandidateMean,
      holdoutScoreDelta,
      severeRegressions,
      schemaPass,
    },
    failedChecks,
    decision: failedChecks.length ? 'fail' : 'pass',
  };
  const id = input.id || `eval:${fingerprint(core)}`;
  return immutable({ ...core, id: nonEmpty(id, 'evaluation.id') }, 'evaluation report');
}

export function evaluationPasses(report) {
  return (
    report?.kind === 'evaluation-report' &&
    report.decision === 'pass' &&
    Array.isArray(report.failedChecks) &&
    report.failedChecks.length === 0
  );
}

function normalizeTargeted(cases) {
  invariant(Array.isArray(cases), 'targetedCases must be an array');
  return cases.map((item, index) => {
    invariant(item && typeof item === 'object', `targetedCases[${index}] must be an object`);
    invariant(typeof item.passed === 'boolean', `targetedCases[${index}].passed must be boolean`);
    return { id: nonEmpty(item.id, `targetedCases[${index}].id`), passed: item.passed };
  });
}

function normalizeHoldout(cases) {
  invariant(Array.isArray(cases), 'holdoutCases must be an array');
  return cases.map((item, index) => {
    invariant(item && typeof item === 'object', `holdoutCases[${index}] must be an object`);
    const baselineScore = Number(item.baselineScore);
    const candidateScore = Number(item.candidateScore);
    invariant(
      inUnitInterval(baselineScore),
      `holdoutCases[${index}].baselineScore must be between 0 and 1`,
    );
    invariant(
      inUnitInterval(candidateScore),
      `holdoutCases[${index}].candidateScore must be between 0 and 1`,
    );
    return {
      id: nonEmpty(item.id, `holdoutCases[${index}].id`),
      baselineScore,
      candidateScore,
      severeRegression: item.severeRegression === true,
    };
  });
}

function inUnitInterval(value) {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}
