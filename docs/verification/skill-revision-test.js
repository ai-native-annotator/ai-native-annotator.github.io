/**
 * Browser contract for PR2: stable identities, persisted candidates, guarded
 * activation and lossless rollback all work in the static application.
 */
const { launchBrowser } = require('./_browser.js');

const BASE = process.env.BASE || 'http://localhost:8899';
let pass = 0;
let fail = 0;
const check = (label, ok, extra = '') => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? '✓' : '✖'} ${label}${extra ? `\n      ${extra}` : ''}`);
};

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 }, locale: 'en-US' });
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(`PAGEERROR: ${error.message}`));
  await page.route('https://api.anthropic.com/v1/messages', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ content: [{ type: 'text', text: '{"category":"news"}' }] }),
    }),
  );

  await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });

  console.log('\n--- 1. equal display names have different stable identities ---');
  const identity = await page.evaluate(async () => {
    const registry = await import('./js/core/registry.js');
    const sentiment = await registry.loadFormat('sentiment');
    const refine = await registry.loadFormat('refine');
    const sentimentAspect = sentiment.skills.find((skill) => skill.id === 'aspect');
    const refineAspect = refine.skills.find((skill) => skill.id === 'aspect');
    const reflection = await import('./js/core/reflection.js');
    reflection.record({
      skill: 'aspect',
      skillId: sentimentAspect.skillId,
      file: sentimentAspect.file,
      kind: 'objection',
      callId: 'call:sentiment',
      revisionId: 'rev:sentiment',
      span: 'food',
      reason: 'sentiment evidence',
    });
    reflection.record({
      skill: 'aspect',
      skillId: refineAspect.skillId,
      file: refineAspect.file,
      kind: 'objection',
      callId: 'call:refine',
      revisionId: 'rev:refine',
      span: '(e / eat-01)',
      reason: 'UMR aspect evidence',
    });
    return {
      sentimentId: sentimentAspect.skillId,
      refineId: refineAspect.skillId,
      sentimentIssues: reflection.issuesFor(sentimentAspect.skillId).length,
      refineIssues: reflection.issuesFor(refineAspect.skillId).length,
    };
  });
  check(
    'sentiment/aspect and refine/aspect do not share an id',
    identity.sentimentId !== identity.refineId,
    JSON.stringify(identity),
  );
  check(
    'each stable id sees only its own feedback',
    identity.sentimentIssues === 1 && identity.refineIssues === 1,
  );

  console.log('\n--- 2. drafting and evaluation do not mutate the active Skill ---');
  const drafted = await page.evaluate(async () => {
    const skills = await import('./js/core/skills.js');
    const reflection = await import('./js/core/reflection.js');
    const skillId = 'skill://umr/arguments';
    const file = 'skills/shared/arguments.md';
    const before = await skills.loadEffectiveText(file, skillId);
    const issue = reflection.record({
      skill: 'arguments',
      skillId,
      file,
      kind: 'edit',
      callId: 'call:arguments-1',
      revisionId: skills.getActiveRevisionId(skillId),
      span: 'on 30 August 2026 at 11:26 UTC',
      before: { span: '30 August 2026' },
      after: { span: '30 August 2026 at 11:26 UTC' },
      reason: 'keep the complete time span',
    });
    reflection.keep(issue.id);
    const proposal = await skills.proposeSkillAmendment({
      skillId,
      relPath: file,
      text: '- Preserve a complete date-and-time span.',
      feedbackEvents: reflection.keptEvidenceFor(skillId),
      createdBy: { type: 'model', model: 'verification-model' },
    });
    const afterDraft = await skills.loadEffectiveText(file, skillId);
    return {
      skillId,
      file,
      issueId: issue.id,
      before,
      afterDraft,
      candidateId: proposal.candidate.id,
      evaluationId: proposal.evaluation.id,
      decision: proposal.evaluation.decision,
      evaluationMode: proposal.evaluation.mode,
      targeted: proposal.evaluation.metrics.targetedCount,
      holdout: proposal.evaluation.metrics.holdoutCount,
    };
  });
  check(
    'candidate passes the explicit structural gate',
    drafted.decision === 'pass' && drafted.evaluationMode === 'structural',
  );
  check(
    'the gate contains targeted and holdout slices',
    drafted.targeted === 1 && drafted.holdout === 1,
  );
  check(
    'drafting leaves the active prompt byte-for-byte unchanged',
    drafted.before === drafted.afterDraft,
  );

  console.log('\n--- 3. candidate survives reload, publication changes the prompt ---');
  await page.reload({ waitUntil: 'networkidle' });
  const published = await page.evaluate(async (draft) => {
    const skills = await import('./js/core/skills.js');
    const reflection = await import('./js/core/reflection.js');
    const persisted = skills.getLatestCandidate(draft.skillId);
    const lateIssue = reflection.record({
      skill: 'arguments',
      skillId: draft.skillId,
      file: draft.file,
      kind: 'objection',
      callId: 'call:arguments-late',
      revisionId: skills.getActiveRevisionId(draft.skillId),
      span: 'a later case',
      reason: 'this was reviewed after the candidate was created',
    });
    reflection.keep(lateIssue.id);
    skills.activateSkillCandidate({
      skillId: draft.skillId,
      candidateId: draft.candidateId,
      evaluationId: draft.evaluationId,
    });
    reflection.markReflected(
      draft.skillId,
      'Preserve a complete date-and-time span.',
      draft.candidateId,
      [draft.issueId],
    );
    return {
      persisted: persisted?.candidate?.id,
      effective: await skills.loadEffectiveText(draft.file, draft.skillId),
      activeRevision: skills.getActiveRevisionId(draft.skillId),
      historySize: skills.getRevisionHistory(draft.skillId).length,
      feedbackStatus: reflection
        .issuesFor(draft.skillId)
        .find((issue) => issue.id === draft.issueId)?.status,
      lateFeedbackStatus: reflection
        .issuesFor(draft.skillId)
        .find((issue) => issue.id === lateIssue.id)?.status,
    };
  }, drafted);
  check(
    'candidate and evaluation persisted through reload',
    published.persisted === drafted.candidateId,
  );
  check(
    'publication is the moment the next prompt changes',
    published.effective.includes('Preserve a complete date-and-time span'),
  );
  check('consumed feedback remains in the audit trail', published.feedbackStatus === 'reflected');
  check(
    'feedback reviewed after drafting is not consumed by that candidate',
    published.lateFeedbackStatus === 'kept',
  );

  console.log('\n--- 4. rollback moves the pointer and keeps history ---');
  const rolledBack = await page.evaluate(async (draft) => {
    const skills = await import('./js/core/skills.js');
    const activeBefore = skills.getActiveRevisionId(draft.skillId);
    skills.rollbackSkillRevision(draft.skillId);
    return {
      activeBefore,
      activeAfter: skills.getActiveRevisionId(draft.skillId),
      effective: await skills.loadEffectiveText(draft.file, draft.skillId),
      historySize: skills.getRevisionHistory(draft.skillId).length,
    };
  }, drafted);
  check('rollback restores the original prompt', rolledBack.effective === drafted.before);
  check(
    'rollback changes only the pointer',
    rolledBack.activeAfter !== rolledBack.activeBefore &&
      rolledBack.historySize === published.historySize,
  );

  console.log('\n--- 5. a generated format owns usable inline Skill instructions ---');
  const generated = await page.evaluate(async () => {
    const { buildFormat } = await import('./js/formats/declarative.js');
    const { state } = await import('./js/core/state.js');
    const skills = await import('./js/core/skills.js');
    state.runMode = 'live';
    state.provider = 'anthropic';
    state.apiKeys.anthropic = 'test-key';
    const format = buildFormat({
      id: 'generated-review',
      label: 'Generated review',
      artifact: { fields: [{ key: 'category', label: 'Category', type: 'badge' }] },
      skills: [{ id: 'category', label: 'Category', describes: 'Classify the document category.' }],
    });
    const sentence = {
      text: 'A museum opened a new exhibit.',
      tokens: [],
      annotation: {},
      tree: [],
    };
    const node = await format.runSkill('category', sentence, 'en');
    const skill = format.skills[0];
    return {
      output: node.output,
      skillId: skill.skillId,
      revisionId: node.revisionId,
      effective: await skills.loadEffectiveText(skill.file, skill.skillId, skill.instructions),
    };
  });
  check(
    'generated Skill executes without a repository markdown file',
    generated.output?.category === 'news',
    JSON.stringify(generated),
  );
  check(
    'generated Skill gets a stable identity and versioned inline instructions',
    generated.skillId === 'skill://runtime/generated-review/category' &&
      Boolean(generated.revisionId) &&
      generated.effective.includes('Classify the document category'),
  );

  console.log(`\n=== ${pass} passed, ${fail} failed`);
  console.log(`=== console errors: ${errors.length}`);
  errors.forEach((error) => console.log(`   ${error.slice(0, 180)}`));
  await browser.close();
  process.exit(fail || errors.length ? 1 : 0);
})().catch((error) => {
  console.error('FAILED:', error.stack || error.message);
  process.exit(1);
});
