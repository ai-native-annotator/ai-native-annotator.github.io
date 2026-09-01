/**
 * Skills must NOT update on the strength of one correction.
 *
 * The old behaviour applied an accepted proposal straight to the skill file, so
 * a rule generalised from a single case was in the prompts before anyone looked
 * at it. This pins the replacement:
 *
 *   1. every intervention — hand edit, re-run, skill swap, chat objection —
 *      files an issue against the skill, and files it in the log
 *   2. NOTHING reaches the skill file at that point
 *   3. reflection is refused until a human has reviewed the batch
 *   4. dismissed issues do not feed reflection; kept ones do
 *   5. reflection reads the kept issues TOGETHER and drafts one amendment,
 *      and even that is not applied until a person presses apply
 *
 * Run: NODE_PATH=<playwright> node docs/verification/reflection-test.js
 */
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8899';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const body = (o) => JSON.stringify({ content: [{ type: 'text', text: typeof o === 'string' ? o : JSON.stringify(o) }] });
const S1 = 'The museum opened a new exhibit last week.';
let pass = 0, fail = 0;
const check = (label, ok, extra = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? '✓' : '✖'} ${label}${extra ? '\n      ' + extra : ''}`); };

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1700, height: 1000 }, locale: 'zh-CN' });
  const errs = [];
  const prompts = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));

  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(BASE) || url.startsWith('https://api.anthropic.com')) return route.fallback();
    return route.abort();
  });
  await page.route('https://api.anthropic.com/**', (route) => {
    const p = JSON.parse(route.request().postData()).messages[0].content;
    prompts.push(p);
    const reply = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: body(o) });
    if (p.includes('标注规范的维护者') || p.includes('You maintain annotation guidelines'))
      return reply('These cases share one shape.\n\n> Always keep the modifier with its head noun.');
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
      return reply({ concept: 'exhibit', relations: [], phrase: 'a new exhibit', note: 'head only' });
    return reply({ concept: 'thing', relations: [] });
  });

  await page.goto(BASE + '/index.html', { waitUntil: 'load' });
  await page.waitForTimeout(900);
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(900);
  if ((await page.getAttribute('html', 'lang')) !== 'zh') { await page.selectOption('#lang-select', 'zh'); await page.waitForTimeout(300); }
  await page.click('#btn-settings'); await page.waitForTimeout(250);
  await (await page.$$('.provider-row .settings-input[type=password]'))[0].fill('sk-ant-demo');
  await (await page.$$('.provider-row .btn.sm'))[0].click();
  await page.click('.modal-head .btn.ghost');
  await page.selectOption('#mode-select', 'live');
  await page.click('[data-menu="menu-import"]');
  await page.click('#btn-drive-demo-en');
  await page.waitForTimeout(600);
  for (let i = 0; i < 6; i++) {
    const row = await page.$('.pending-row:not(.blocked)');
    if (!row) break;
    await row.click(); await page.waitForTimeout(320);
  }

  const skillState = () => page.evaluate(async () => {
    const sk = await import('./js/core/skills.js');
    const rf = await import('./js/core/reflection.js');
    return {
      amendment: sk.getOverride('skills/shared/np_phrase.md') || '',
      issues: rf.issuesFor('np_phrase').map((i) => ({ kind: i.kind, status: i.status })),
    };
  });

  console.log('\n--- 1. a hand edit files an issue and changes NO skill ---');
  const rows = await page.$$('.node-row:not(.pending-row)');
  let np = null;
  for (const r of rows) { if ((await r.textContent()).includes('np_phrase')) { np = r; break; } }
  await np.click(); await page.waitForTimeout(300);
  const box = await page.inputValue('.edit-box');
  await page.fill('.edit-box', box.replace(/\/ \w+/, '/ exhibit-new'));
  await page.click('.edit-actions .btn:not(.ghost)');
  await page.waitForTimeout(400);
  let st = await skillState();
  check('an issue was filed', st.issues.some((i) => i.kind === 'edit'), JSON.stringify(st.issues));
  check('the skill file is untouched', st.amendment === '', st.amendment || '(empty)');
  check('it is awaiting review', st.issues.every((i) => i.status === 'open'));

  console.log('\n--- 2. a re-run and a skill swap file issues too ---');
  await (await page.$('.node-row.selected .node-act')).click();
  await page.waitForTimeout(600);
  st = await skillState();
  check('re-run filed', st.issues.some((i) => i.kind === 'rerun'), JSON.stringify(st.issues));
  check('still nothing in the skill file', st.amendment === '');

  console.log('\n--- 3. the panel shows the backlog and refuses to reflect yet ---');
  const cards = await page.$$('.skill-card');
  let card = null;
  for (const c of cards) { if ((await c.textContent()).includes('np_phrase')) { card = c; break; } }
  check('the skill card carries an issue badge', Boolean(await card.$('.skill-flag.issues')));
  await card.click(); await page.waitForTimeout(400);
  await page.click('.skill-detail-body .edit-tabs .btn:last-child'); await page.waitForTimeout(350);
  check('the issues tab lists them', (await page.$$('.issue-row')).length >= 2,
    `${(await page.$$('.issue-row')).length} rows`);
  const reflectBtn = await page.$('.skill-detail-body .modal-actions .btn');
  check('reflect is disabled before review', await reflectBtn.isDisabled());
  check('and it says why', (await page.textContent('.skill-detail-body')).includes('先决定保留还是忽略'));

  console.log('\n--- 4. review: keep one, dismiss one ---');
  const keepBtns = await page.$$('.issue-row.open .issue-actions .btn:not(.ghost)');
  await keepBtns[0].click(); await page.waitForTimeout(300);
  const dismissBtns = await page.$$('.issue-row.open .issue-actions .btn.ghost');
  if (dismissBtns.length) { await dismissBtns[0].click(); await page.waitForTimeout(300); }
  st = await skillState();
  check('one kept, one dismissed', st.issues.some((i) => i.status === 'kept') && st.issues.some((i) => i.status === 'dismissed'),
    JSON.stringify(st.issues));
  check('STILL nothing in the skill file', st.amendment === '');

  console.log('\n--- 5. reflection reads the kept batch and drafts, but does not apply ---');
  const nBefore = prompts.length;
  await page.click('.skill-detail-body .modal-actions .btn');
  await page.waitForTimeout(900);
  const reflectPrompt = prompts.slice(nBefore).find((p) => p.includes('维护者') || p.includes('maintain annotation'));
  check('a reflection prompt went out', Boolean(reflectPrompt));
  check('it was given only the KEPT issue', Boolean(reflectPrompt) && !reflectPrompt.includes('dismissed'));
  check('a draft amendment is shown', (await page.textContent('.skill-detail-body')).includes('Always keep the modifier'));
  st = await skillState();
  check('and it is STILL not applied until a person presses apply', st.amendment === '', st.amendment || '(empty)');

  console.log('\n--- 6. applying it is the moment it enters the next prompt ---');
  const applyBtn = await page.$('.amendment .modal-actions .btn:not(.ghost)');
  await applyBtn.click();
  await page.waitForTimeout(600);
  st = await skillState();
  check('now the skill file carries the rule', st.amendment.includes('Always keep the modifier'), st.amendment.slice(0, 70));
  check('the kept issue is marked reflected', st.issues.some((i) => i.status === 'reflected'), JSON.stringify(st.issues));
  const effective = await page.evaluate(async () => {
    const sk = await import('./js/core/skills.js');
    return sk.loadEffectiveText('skills/shared/np_phrase.md');
  });
  check('and the next np_phrase prompt would carry it', effective.includes('Always keep the modifier'));

  console.log(`\n=== ${pass} passed, ${fail} failed`);
  console.log('=== console errors:', errs.length);
  errs.forEach((e) => console.log('   ' + e.slice(0, 160)));
  await browser.close();
  process.exit(fail || errs.length ? 1 : 0);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
