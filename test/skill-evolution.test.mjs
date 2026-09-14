import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// Browser `.js` modules are ESM even though this static-site repository does
// not set a package-wide Node module type.
register('./helpers/browser-esm-loader.mjs', import.meta.url);

const { createFeedbackEvent, feedbackForSkill, makeSkillId } = await import(
  '../js/domain/feedback.js'
);
const {
  activeRevision,
  addRevision,
  createCandidate,
  createSkillLifecycle,
  createSkillRevision,
  promoteCandidate,
  rollbackSkill,
} = await import('../js/domain/skills.js');
const { createEvaluationReport, evaluationPasses } = await import('../js/domain/evaluation.js');

const AT = '2026-09-10T12:00:00.000Z';

function feedback(id, skillId) {
  return createFeedbackEvent({
    id,
    skillId,
    revisionId: 'rev:base',
    callId: `call:${id}`,
    type: 'correction',
    document: {
      id: 'doc-1',
      sourceHash: 'sha256:doc',
      sentenceId: 's1',
      span: 'example',
      context: 'an example sentence',
    },
    originalOutput: { label: 'wrong' },
    humanOutput: { label: 'right' },
    rationale: 'the label violates the guideline',
    createdAt: AT,
  });
}

test('stable skill identity isolates equal display ids in different namespaces', () => {
  const sentimentAspect = makeSkillId('sentiment', 'aspect');
  const refineAspect = makeSkillId('refine', 'aspect');
  assert.equal(sentimentAspect, 'skill://sentiment/aspect');
  assert.equal(refineAspect, 'skill://refine/aspect');
  assert.notEqual(sentimentAspect, refineAspect);

  const events = [feedback('f1', sentimentAspect), feedback('f2', refineAspect)];
  assert.deepEqual(
    feedbackForSkill(events, sentimentAspect).map((event) => event.id),
    ['f1'],
  );
  assert.deepEqual(
    feedbackForSkill(events, refineAspect).map((event) => event.id),
    ['f2'],
  );
});

test('SkillRevision snapshots its content and is deeply immutable', () => {
  const skillId = makeSkillId('umr', 'arguments');
  const input = {
    instructions: 'Use the correct role.',
    outputSchema: { type: 'object', required: ['concept'] },
  };
  const revision = createSkillRevision({
    id: 'rev:base',
    skillId,
    content: input,
    createdAt: AT,
    createdBy: { type: 'human', id: 'annotator-1' },
  });

  input.instructions = 'mutated outside';
  input.outputSchema.required.push('bad');
  assert.equal(revision.content.instructions, 'Use the correct role.');
  assert.deepEqual(revision.content.outputSchema.required, ['concept']);
  assert.ok(Object.isFrozen(revision));
  assert.ok(Object.isFrozen(revision.content.outputSchema.required));
  assert.throws(() => {
    revision.content.instructions = 'mutated inside';
  }, TypeError);
});

test('a passing candidate promotes immutably and rollback only moves the active pointer', () => {
  const skillId = makeSkillId('umr', 'arguments');
  const base = createSkillRevision({
    id: 'rev:base',
    skillId,
    content: { instructions: 'Base rule.' },
    createdAt: AT,
    createdBy: { type: 'human' },
  });
  const proposed = createSkillRevision({
    id: 'rev:candidate',
    skillId,
    parentRevisionId: base.id,
    content: { instructions: 'Base rule.\n\nNew general rule.' },
    sourceFeedbackIds: ['f1'],
    createdAt: AT,
    createdBy: { type: 'model', model: 'test-model' },
  });
  const candidate = createCandidate({
    id: 'candidate:1',
    skillId,
    baseRevisionId: base.id,
    proposedRevisionId: proposed.id,
    feedbackIds: ['f1'],
    patch: { append: 'New general rule.' },
    status: 'passed',
    createdAt: AT,
  });
  const evaluation = createEvaluationReport({
    id: 'eval:1',
    candidateId: candidate.id,
    skillId,
    baseRevisionId: base.id,
    proposedRevisionId: proposed.id,
    evaluatedAt: AT,
    targetedCases: [{ id: 'target-1', passed: true }],
    holdoutCases: [{ id: 'holdout-1', baselineScore: 0.8, candidateScore: 0.8 }],
    schemaPass: true,
  });

  const initial = createSkillLifecycle({ skillId, revisions: [base], activeRevisionId: base.id });
  const withCandidate = addRevision(initial, proposed);
  const promoted = promoteCandidate(withCandidate, candidate, evaluation, {
    actor: 'human:maintainer',
    policy: 'manual-after-eval',
    at: AT,
  });
  assert.equal(initial.activeRevisionId, base.id);
  assert.equal(withCandidate.activeRevisionId, base.id);
  assert.equal(activeRevision(promoted).id, proposed.id);
  assert.equal(promoted.events.at(-1).type, 'promote');

  const rolledBack = rollbackSkill(promoted, {
    actor: 'human:maintainer',
    reason: 'canary regression',
    at: '2026-09-10T13:00:00.000Z',
  });
  assert.equal(activeRevision(rolledBack).id, base.id);
  assert.equal(activeRevision(promoted).id, proposed.id);
  assert.ok(rolledBack.revisions[proposed.id]);
  assert.equal(rolledBack.events.at(-1).type, 'rollback');
});

test('promotion rejects a draft candidate and rollback cannot activate a side branch', () => {
  const skillId = makeSkillId('umr', 'arguments');
  const base = createSkillRevision({
    id: 'rev:base',
    skillId,
    content: { instructions: 'Base.' },
    createdAt: AT,
    createdBy: { type: 'repository' },
  });
  const active = createSkillRevision({
    id: 'rev:active',
    skillId,
    parentRevisionId: base.id,
    content: { instructions: 'Base.\nActive.' },
    sourceFeedbackIds: ['f1'],
    createdAt: AT,
    createdBy: { type: 'model' },
  });
  const side = createSkillRevision({
    id: 'rev:side',
    skillId,
    parentRevisionId: base.id,
    content: { instructions: 'Base.\nSide.' },
    sourceFeedbackIds: ['f2'],
    createdAt: AT,
    createdBy: { type: 'model' },
  });
  const draft = createCandidate({
    id: 'candidate:draft',
    skillId,
    baseRevisionId: base.id,
    proposedRevisionId: active.id,
    feedbackIds: ['f1'],
    createdAt: AT,
  });
  const evaluation = createEvaluationReport({
    id: 'eval:draft',
    candidateId: draft.id,
    skillId,
    baseRevisionId: base.id,
    proposedRevisionId: active.id,
    evaluatedAt: AT,
    targetedCases: [{ id: 'target', passed: true }],
    holdoutCases: [{ id: 'holdout', baselineScore: 1, candidateScore: 1 }],
    schemaPass: true,
  });
  const lifecycle = createSkillLifecycle({
    skillId,
    revisions: [base, active, side],
    activeRevisionId: base.id,
  });
  assert.throws(
    () =>
      promoteCandidate(lifecycle, draft, evaluation, {
        actor: 'human:test',
        policy: 'manual-after-eval',
        at: AT,
      }),
    /only a passed candidate/,
  );

  const passed = createCandidate({ ...draft, status: 'passed' });
  const promoted = promoteCandidate(lifecycle, passed, evaluation, {
    actor: 'human:test',
    policy: 'manual-after-eval',
    at: AT,
  });
  assert.throws(
    () =>
      rollbackSkill(promoted, {
        actor: 'human:test',
        reason: 'try side branch',
        at: AT,
        toRevisionId: side.id,
      }),
    /must be an ancestor/,
  );
});

test('promotion gate requires both targeted fixes and non-regressing holdout cases', async (t) => {
  const skillId = makeSkillId('sentiment', 'polarity');
  const common = {
    candidateId: 'candidate:polarity',
    skillId,
    baseRevisionId: 'rev:base',
    proposedRevisionId: 'rev:new',
    evaluatedAt: AT,
    schemaPass: true,
  };

  await t.test('passes when targeted and holdout gates both pass', () => {
    const report = createEvaluationReport({
      ...common,
      targetedCases: [
        { id: 't1', passed: true },
        { id: 't2', passed: true },
      ],
      holdoutCases: [
        { id: 'h1', baselineScore: 0.8, candidateScore: 0.9 },
        { id: 'h2', baselineScore: 0.7, candidateScore: 0.7 },
      ],
    });
    assert.equal(evaluationPasses(report), true);
    assert.equal(report.decision, 'pass');
  });

  await t.test('fails even with a good holdout when a targeted case remains broken', () => {
    const report = createEvaluationReport({
      ...common,
      targetedCases: [
        { id: 't1', passed: true },
        { id: 't2', passed: false },
      ],
      holdoutCases: [{ id: 'h1', baselineScore: 0.7, candidateScore: 0.9 }],
    });
    assert.equal(evaluationPasses(report), false);
    assert.ok(report.failedChecks.includes('targeted-pass-rate'));
  });

  await t.test('fails even after targeted fixes when holdout regresses', () => {
    const report = createEvaluationReport({
      ...common,
      targetedCases: [{ id: 't1', passed: true }],
      holdoutCases: [
        {
          id: 'h1',
          baselineScore: 0.9,
          candidateScore: 0.6,
          severeRegression: true,
        },
      ],
    });
    assert.equal(evaluationPasses(report), false);
    assert.ok(report.failedChecks.includes('holdout-score-delta'));
    assert.ok(report.failedChecks.includes('severe-regressions'));
  });

  await t.test('refuses leakage between targeted and holdout sets', () => {
    assert.throws(
      () =>
        createEvaluationReport({
          ...common,
          targetedCases: [{ id: 'same-case', passed: true }],
          holdoutCases: [{ id: 'same-case', baselineScore: 1, candidateScore: 1 }],
        }),
      /must be disjoint/,
    );
  });
});
