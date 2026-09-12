/**
 * "Takes effect on the spot" has to mean the next call, not the next reload.
 *
 * Two loops, both checked against the only standard that matters — what the
 * pipeline actually sends and shows next, not what a status line claims:
 *
 *   1. A human correction is the annotation immediately: the artifact repaints,
 *      AND the corrected value is what the NEXT skill call downstream receives
 *      as its input. A correction the next step does not see is not applied.
 *
 *   2. A skill amendment accepted in the chat is in the very next prompt for
 *      that skill, and the pane says so on the spot rather than asking the
 *      annotator to take it on trust.
 *
 * Run: npm run test:browser -- live-effect-test.js
 */
const { launchBrowser } = require('./_browser');
const { promptOf } = require('./_prompt.js');
const BASE = process.env.BASE || 'http://localhost:8899';
const body = (o) => JSON.stringify({ content: [{ type: 'text', text: typeof o === 'string' ? o : JSON.stringify(o) }] });
const S1 = 'The museum opened a new exhibit last week.';
let pass = 0, fail = 0;
const check = (label, ok, extra = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? '✓' : '✖'} ${label}${extra ? '\n      ' + extra : ''}`); };

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, locale: 'zh-CN' });
  const errs = [];
  const prompts = [];                       // every prompt the pipeline sent, in order
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));

  await page.route('https://api.anthropic.com/v1/messages', async (route) => {
    const p = promptOf(route.request().postData());
    prompts.push(p);
    const reply = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: body(o) });
    if (p.includes('annotation guidelines') || p.includes('标注规范维护者'))
      return reply('The model dropped the modifier.\n\n> Always keep the full noun phrase.');
    if (p.includes(`Sentence (English):\n${S1}`)) return reply({ has_discourse: false });
    if (p.includes(`Clause to analyse: ${S1}`) && !p.includes('## PropBank'))
      return reply({ predicate_kind: 'verb', lemmas: ['open'], predicate_text: 'opened' });
    if (p.includes(`Clause to analyse: ${S1}`))
      return reply({ concept: 'open-01', phrase: S1, note: 'sense -01',
        relations: [[':ARG0', { expand: true, phrase: 'The museum', kind: 'np' }],
          [':ARG1', { expand: true, phrase: 'a new exhibit', kind: 'np' }], [':aspect', 'performance']] });
    if (p.includes('Noun phrase to analyse: The museum'))
      return reply({ concept: 'museum', relations: [], phrase: 'The museum', note: 'common noun' });
    if (p.includes('Noun phrase to analyse: a new exhibit'))
      return reply({ concept: 'exhibit', relations: [[':mod', { concept: 'new' }]], phrase: 'a new exhibit', note: 'modified' });
    return reply({ concept: 'thing', relations: [] });
  });

  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  if ((await page.getAttribute('html', 'lang')) !== 'zh') { await page.selectOption('#lang-select', 'zh'); await page.waitForTimeout(300); }

  await page.click('#btn-settings'); await page.waitForTimeout(200);
  await (await page.$$('.provider-row .settings-input[type=password]'))[0].fill('sk-ant-demo');
  await (await page.$$('.provider-row .btn.sm'))[0].click();
  await page.click('.modal-head .btn.ghost');
  await page.selectOption('#mode-select', 'live');
  await page.click('[data-menu="menu-import"]');
  await page.click('#btn-drive-demo-en');
  await page.waitForTimeout(500);

  console.log('\n--- 1. a human correction must reach the NEXT call, not just the screen ---');
  // run only as far as the arguments node, leaving its children unresolved
  for (let i = 0; i < 2; i++) {
    const row = await page.$('.pending-row:not(.blocked)');
    if (!row) break;
    await row.click(); await page.waitForTimeout(350);
  }
  const argNode = await page.$$('.node-row:not(.pending-row)');
  await argNode[1].click(); await page.waitForTimeout(300);

  const before = await page.inputValue('.edit-box');
  check('editing the arguments node in Penman', before.includes('open-01'), before.split('\n')[0]);
  await page.fill('.edit-box', before.replace('open-01', 'inaugurate-01'));
  await page.click('.edit-actions .btn:not(.ghost)');
  await page.waitForTimeout(400);

  check('artifact repaints at once', (await page.textContent('#pane-annotated')).includes('inaugurate-01'));

  // Run the rest of the sentence and read what the pipeline actually sent. The
  // step to check is one whose task input is built FROM upstream output —
  // reentrancy lists every resolved node as "id: concept". np_phrase would
  // prove nothing: its prompt is built from the sentence text, so the parent's
  // concept never appears in it either way.
  const nBefore = prompts.length;
  for (let i = 0; i < 8; i++) {
    const row = await page.$('.pending-row:not(.blocked)');
    if (!row) break;
    await row.click(); await page.waitForTimeout(320);
  }
  const later = prompts.slice(nBefore);
  check('more calls really went out', later.length > 0, `${later.length} call(s)`);
  // anchor on the prompt's own section header rather than guessing the id
  // format (they are e1, e2, … — see assignIds in pipeline.js)
  const nodeListing = later.filter((p) => p.includes('Nodes in the parsed graph:'));
  check('reached a step whose input is built from upstream output', nodeListing.length > 0);
  const listing = nodeListing.join('\n');
  check('that step sees the corrected concept',
    listing.includes('inaugurate-01'),
    (listing.match(/^- \w+: \S+/gm) || []).join('  |  ').slice(0, 160));
  check('and no longer sees the model original',
    !/^- \w+: open-01/m.test(listing),
    /^- \w+: open-01/m.test(listing) ? 'STILL LISTING open-01' : '');

  console.log('\n--- 2. an objection is FILED, not applied (see reflection-test.js) ---');
  // finish the sentence so an np_phrase node exists to argue about
  for (let i = 0; i < 6; i++) {
    const row = await page.$('.pending-row:not(.blocked)');
    if (!row) break;
    await row.click(); await page.waitForTimeout(300);
  }
  const rows = await page.$$('.node-row:not(.pending-row)');
  let target = null;
  for (const r of rows) { if ((await r.textContent()).includes('np_phrase')) { target = r; break; } }
  await target.click(); await page.waitForTimeout(300);

  check('no amendment shown before one is accepted', !(await page.$('.amendment')));

  await page.fill('.chat-input', '这里应该保留完整的名词短语，不能只留中心词。');
  await page.click('.chat-bar button:has-text("发送")');
  await page.waitForTimeout(700);
  const recordBtn = await page.$('button:has-text("记入问题记录")');
  check('the proposal offers to FILE the issue, not apply it', Boolean(recordBtn));
  await recordBtn.click();
  await page.waitForTimeout(400);
  const filed = await page.evaluate(async () => {
    const rf = await import('./js/core/reflection.js');
    const sk = await import('./js/core/skills.js');
    return {
      issues: rf.issuesFor('np_phrase').length,
      amendment: sk.getOverride('skills/shared/np_phrase.md') || '',
    };
  });
  check('the issue is on the journal', filed.issues > 0, `${filed.issues} issue(s)`);
  check('and the skill file is deliberately untouched', filed.amendment === '', filed.amendment || '(empty)');

  console.log('\n--- 2b. once an amendment IS in force it reaches the very next prompt ---');
  const rule = await page.evaluate(async () => {
    const sk = await import('./js/core/skills.js');
    await sk.addAmendment('skills/shared/np_phrase.md', '- Always keep the full noun phrase.');
    return sk.getOverride('skills/shared/np_phrase.md');
  });
  check('stored against the key the pipeline fetches', Boolean(rule), rule ? rule.slice(0, 60) : '(nothing)');
  const effective = await page.evaluate(async () => {
    const sk = await import('./js/core/skills.js');
    return sk.loadEffectiveText('skills/shared/np_phrase.md');
  });
  check('the next np_phrase prompt carries the rule', effective.includes('Always keep the full noun phrase'));
  check('the amendment shows on the skill it changes, without a reload',
    Boolean(await page.$('.amendment')));

  console.log('\n--- 3. reverting it is equally immediate ---');
  await page.click('.amendment .btn.ghost');
  await page.waitForTimeout(400);
  check('amendment gone from the pane', !(await page.$('.amendment')));
  const afterRevert = await page.evaluate(async () => {
    const sk = await import('./js/core/skills.js');
    return sk.getOverride('skills/shared/np_phrase.md');
  });
  check('and gone from what the next call would send', !afterRevert);

  console.log(`\n=== ${pass} passed, ${fail} failed`);
  console.log('=== console errors:', errs.length);
  errs.forEach((e) => console.log('   ' + e.slice(0, 160)));
  await browser.close();
  process.exit(fail || errs.length ? 1 : 0);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
