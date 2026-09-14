import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./helpers/browser-esm-loader.mjs', import.meta.url);

const { createFeedbackEvent, makeSkillId, reviewFeedback } = await import(
  '../js/domain/feedback.js'
);
const {
  activeSkillRevision,
  applyAmendmentDirectly,
  ensureSkill,
  exportSkillWorkspace,
  importSkillWorkspace,
  promoteSkillCandidate,
  proposeAmendment,
  restoreBaseSkill,
  rollbackActiveSkill,
  useSkillWorkspaceStore,
} = await import('../js/application/skill-revisions.js');
const { createRunRecord } = await import('../js/domain/runs.js');

const AT = '2026-09-10T12:00:00.000Z';

function memoryStore(initial = null) {
  let value = initial;
  return {
    read(fallback) {
      return value === null ? structuredClone(fallback) : structuredClone(value);
    },
    write(next) {
      value = structuredClone(next);
    },
    snapshot() {
      return structuredClone(value);
    },
  };
}

function keptFeedback(id, skillId, revisionId) {
  const event = createFeedbackEvent({
    id,
    skillId,
    revisionId,
    callId: `call:${id}`,
    type: 'correction',
    document: {
      id: 'doc-1',
      sourceHash: 'source:doc-1',
      sentenceId: 'sentence:1',
      span: 'example',
      context: 'Example.',
    },
    originalOutput: { value: 'old' },
    humanOutput: { value: 'new' },
    rationale: 'The output violates the instruction.',
    createdAt: AT,
  });
  return reviewFeedback(event, 'kept');
}

test('application flow persists a candidate without activating it, then promotes and rolls back', () => {
  const store = memoryStore();
  useSkillWorkspaceStore(store);
  const skillId = makeSkillId('umr', 'arguments');
  const entry = ensureSkill({
    skillId,
    file: 'skills/shared/arguments.md',
    baseText: 'Base instructions.',
  });
  const baseId = entry.lifecycle.activeRevisionId;

  const proposal = proposeAmendment({
    skillId,
    file: 'skills/shared/arguments.md',
    baseText: 'Base instructions.',
    amendment: '- Keep temporal spans intact.',
    feedbackEvents: [keptFeedback('feedback-1', skillId, baseId)],
    heading: '## Human amendments',
    createdAt: AT,
    createdBy: { type: 'model', model: 'test-model' },
  });

  assert.equal(
    activeSkillRevision(skillId).id,
    baseId,
    'drafting cannot change the active pointer',
  );
  assert.equal(proposal.evaluation.mode, 'structural');
  assert.equal(proposal.evaluation.decision, 'pass');
  assert.equal(
    exportSkillWorkspace().skills[skillId].candidates[proposal.candidate.id].id,
    proposal.candidate.id,
  );

  const active = promoteSkillCandidate({
    skillId,
    candidateId: proposal.candidate.id,
    evaluationId: proposal.evaluation.id,
    actor: 'human:test',
    at: '2026-09-10T12:01:00.000Z',
  });
  assert.match(active.content.instructions, /Keep temporal spans intact/);
  assert.notEqual(active.id, baseId);
  assert.equal(
    exportSkillWorkspace().skills[skillId].candidates[proposal.candidate.id].status,
    'approved',
  );

  const rolledBack = rollbackActiveSkill({
    skillId,
    actor: 'human:test',
    reason: 'regression found',
    at: '2026-09-10T12:02:00.000Z',
  });
  assert.equal(rolledBack.id, baseId);
  assert.ok(
    store.snapshot().skills[skillId].lifecycle.revisions[active.id],
    'rollback preserves the rejected revision',
  );

  useSkillWorkspaceStore(store);
  assert.ok(
    Object.isFrozen(activeSkillRevision(skillId)),
    'JSON persistence is rehydrated through immutable domain constructors',
  );
});

test('workspace import rejects a broken revision graph', () => {
  useSkillWorkspaceStore(memoryStore());
  const skillId = makeSkillId('sentiment', 'polarity');
  ensureSkill({ skillId, file: 'skills/sentiment/polarity.md', baseText: 'Classify polarity.' });
  const corrupt = exportSkillWorkspace();
  const entry = corrupt.skills[skillId];
  const base = entry.lifecycle.revisions[entry.baseRevisionId];
  base.parentRevisionId = 'rev:missing';
  assert.throws(() => importSkillWorkspace(corrupt), /missing parent/);
});

test('generated candidates reject unreviewed or revision-mismatched evidence', () => {
  useSkillWorkspaceStore(memoryStore());
  const skillId = makeSkillId('umr', 'arguments');
  const entry = ensureSkill({
    skillId,
    file: 'skills/shared/arguments.md',
    baseText: 'Base.',
  });
  const open = createFeedbackEvent({
    ...keptFeedback('feedback-open-template', skillId, entry.baseRevisionId),
    id: 'feedback-open',
    status: 'open',
  });
  const input = {
    skillId,
    file: 'skills/shared/arguments.md',
    baseText: 'Base.',
    amendment: '- A rule.',
    heading: '## Human amendments',
    createdAt: AT,
    createdBy: { type: 'model', model: 'test-model' },
  };
  assert.throws(() => proposeAmendment({ ...input, feedbackEvents: [open] }), /has not been kept/);
  assert.throws(
    () =>
      proposeAmendment({
        ...input,
        feedbackEvents: [keptFeedback('feedback-old', skillId, 'rev:other')],
      }),
    /different skill revision/,
  );
});

test('legacy path override is migrated once into a versioned lifecycle', () => {
  useSkillWorkspaceStore(memoryStore());
  const skillId = makeSkillId('sentiment', 'aspect');
  const entry = ensureSkill({
    skillId,
    file: 'skills/sentiment/aspect.md',
    baseText: 'Find aspects.',
    legacyOverride: { mode: 'amend', text: '- Keep quoted product names.' },
  });
  assert.equal(Object.keys(entry.lifecycle.revisions).length, 2);
  assert.match(activeSkillRevision(skillId).content.instructions, /Keep quoted product names/);
  assert.equal(activeSkillRevision(skillId).content.mode, 'amend');
  const activation = entry.lifecycle.events.at(-1);
  assert.ok(entry.candidates[activation.candidateId]);
  assert.ok(entry.evaluations[activation.evaluationReportId]);
});

test('an explicit human amendment can be activated without linked feedback', () => {
  useSkillWorkspaceStore(memoryStore());
  const skillId = makeSkillId('umr', 'discourse');
  const active = applyAmendmentDirectly({
    skillId,
    file: 'skills/shared/discourse.md',
    baseText: 'Base.',
    amendment: '- Preserve paragraph boundaries.',
    heading: '## Human amendments',
    at: AT,
  });
  assert.match(active.content.instructions, /Preserve paragraph boundaries/);
  const entry = exportSkillWorkspace().skills[skillId];
  for (const event of entry.lifecycle.events) {
    if (event.candidateId) assert.ok(entry.candidates[event.candidateId]);
    if (event.evaluationReportId) assert.ok(entry.evaluations[event.evaluationReportId]);
  }
});

test('a repository update rebases amendments and restore targets the new base', () => {
  useSkillWorkspaceStore(memoryStore());
  const skillId = makeSkillId('umr', 'discourse');
  const file = 'skills/shared/discourse.md';
  applyAmendmentDirectly({
    skillId,
    file,
    baseText: 'Repository version one.',
    amendment: '- Preserve paragraph boundaries.',
    heading: '## Human amendments',
    at: AT,
  });

  const updated = ensureSkill({
    skillId,
    file,
    baseText: 'Repository version two.',
  });
  assert.match(activeSkillRevision(skillId).content.instructions, /Repository version two/);
  assert.match(activeSkillRevision(skillId).content.instructions, /Preserve paragraph boundaries/);

  const restored = restoreBaseSkill({
    skillId,
    actor: 'human:test',
    at: '2026-09-10T12:10:00.000Z',
  });
  assert.equal(restored.id, updated.baseRevisionId);
  assert.equal(restored.content.instructions, 'Repository version two.');
});

test('repeated rollback follows revision ancestry instead of toggling pointers', () => {
  useSkillWorkspaceStore(memoryStore());
  const skillId = makeSkillId('umr', 'np-phrase');
  const file = 'skills/shared/np_phrase.md';
  const base = ensureSkill({ skillId, file, baseText: 'Base.' });
  const baseId = base.lifecycle.activeRevisionId;

  const first = proposeAmendment({
    skillId,
    file,
    baseText: 'Base.',
    amendment: '- Preserve modifiers.',
    feedbackEvents: [keptFeedback('feedback-1', skillId, baseId)],
    heading: '## Human amendments',
    createdAt: AT,
    createdBy: { type: 'model', model: 'test-model' },
  });
  const firstRevision = promoteSkillCandidate({
    skillId,
    candidateId: first.candidate.id,
    evaluationId: first.evaluation.id,
    actor: 'human:test',
    at: '2026-09-10T12:01:00.000Z',
  });

  const second = proposeAmendment({
    skillId,
    file,
    baseText: 'Base.',
    amendment: '- Preserve determiners.',
    feedbackEvents: [keptFeedback('feedback-2', skillId, firstRevision.id)],
    heading: '## Human amendments',
    createdAt: '2026-09-10T12:02:00.000Z',
    createdBy: { type: 'model', model: 'test-model' },
  });
  promoteSkillCandidate({
    skillId,
    candidateId: second.candidate.id,
    evaluationId: second.evaluation.id,
    actor: 'human:test',
    at: '2026-09-10T12:03:00.000Z',
  });

  const firstRollback = rollbackActiveSkill({
    skillId,
    actor: 'human:test',
    reason: 'latest rule regressed',
    at: '2026-09-10T12:04:00.000Z',
  });
  const secondRollback = rollbackActiveSkill({
    skillId,
    actor: 'human:test',
    reason: 'previous rule also regressed',
    at: '2026-09-10T12:05:00.000Z',
  });

  assert.equal(firstRollback.id, firstRevision.id);
  assert.equal(secondRollback.id, baseId);
});

test('RunRecord fixes a call to a stable skill revision and prompt fingerprint', () => {
  const run = createRunRecord({
    id: 'call:1',
    skillId: makeSkillId('refine', 'aspect'),
    localSkillId: 'aspect',
    revisionId: 'rev:aspect-1',
    source: 'live',
    request: {
      prompt: 'annotate this',
      language: 'en',
      provider: 'test',
      model: 'deterministic',
      effectivePromptHash: 'hash:prompt',
      componentHashes: { system: 'hash:system', prompt: 'hash:input' },
    },
    response: { rawText: '{}', parsedOutput: {}, rationale: '' },
    startedAt: AT,
    latencyMs: 4,
  });
  assert.equal(run.skillId, 'skill://refine/aspect');
  assert.equal(run.revisionId, 'rev:aspect-1');
  assert.ok(Object.isFrozen(run.request.componentHashes));
});
