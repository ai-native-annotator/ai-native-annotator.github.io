/**
 * The original acceptance test, in the repo where it cannot be lost.
 *
 * Import an unannotated file (the shape a Google Drive import produces) and
 * annotate it by CLICKING each step — not by generating the whole thing at
 * once. Every click is one real skill call; the next pending row appears only
 * once the previous one resolves. Covers both a sentence with no discourse
 * relation and one with subordination, plus a parallel (flat) format, which is
 * a completely different code path through the tree.
 *
 * Two guards that matter as much as the assertions:
 *   - every skill that ran must SHOW in the tree. The whole project started
 *     from calls happening but not appearing.
 *   - no console errors, and no model prompt left unanswered by the mocks: an
 *     unmatched prompt means the pipeline asked for something this test does
 *     not know about, which is a silent gap in the test, not a pass.
 *
 * Run: NODE_PATH=<playwright> node docs/verification/pipeline-test.js
 */
const { chromium } = require('playwright');
const { promptOf } = require('./_prompt.js');
const BASE = process.env.BASE || 'http://localhost:8899';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const body = (o) => JSON.stringify({ content: [{ type: 'text', text: typeof o === 'string' ? o : JSON.stringify(o) }] });

const S1 = 'The museum opened a new exhibit last week.';
const S3 = 'If they arrive before noon, they avoid the crowds.';
let pass = 0, fail = 0;
const check = (label, ok, extra = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? '✓' : '✖'} ${label}${extra ? '  ' + extra : ''}`); };

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, locale: 'zh-CN' });
  const errs = [];
  const unmatched = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));

  await page.route('https://api.anthropic.com/v1/messages', async (route) => {
    const p = promptOf(route.request().postData());
    const reply = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: body(o) });

    // ---- sentence 1: no discourse relation
    if (p.includes(`Sentence (English):\n${S1}`)) return reply({ has_discourse: false });
    if (p.includes(`Clause to analyse: ${S1}`) && !p.includes('## PropBank'))
      return reply({ predicate_kind: 'verb', lemmas: ['open'], predicate_text: 'opened' });
    if (p.includes(`Clause to analyse: ${S1}`))
      return reply({ concept: 'open-01', phrase: S1, note: 'sense -01 fits',
        relations: [[':ARG0', { expand: true, phrase: 'The museum', kind: 'np' }],
          [':ARG1', { expand: true, phrase: 'a new exhibit', kind: 'np' }],
          [':temporal', { expand: true, phrase: 'last week', kind: 'special' }],
          [':aspect', 'performance']] });
    if (p.includes('Noun phrase to analyse: The museum'))
      return reply({ concept: 'museum', relations: [], phrase: 'The museum', note: 'common noun' });
    if (p.includes('Noun phrase to analyse: a new exhibit'))
      return reply({ concept: 'exhibit', relations: [[':mod', { concept: 'new' }]], phrase: 'a new exhibit', note: 'modified' });
    if (p.includes('last week'))
      return reply({ concept: 'date-entity', relations: [[':mod', 'last-week']], phrase: 'last week', note: 'temporal' });

    // ---- sentence 3: subordination
    if (p.includes(`Sentence (English):\n${S3}`))
      return reply({ has_discourse: true, structure: { concept: 'avoid-01', relations: [
        [':condition', { expand: true, phrase: 'they arrive before noon', kind: 'clause' }]] }, note: 'conditional' });
    if (p.includes('Clause to analyse: they avoid the crowds') && !p.includes('## PropBank'))
      return reply({ predicate_kind: 'verb', lemmas: ['avoid'], predicate_text: 'avoid' });
    if (p.includes('Clause to analyse: they avoid the crowds'))
      return reply({ concept: 'avoid-01', phrase: 'they avoid the crowds', note: 'main clause',
        relations: [[':ARG0', { expand: true, phrase: 'they', kind: 'np' }],
          [':ARG1', { expand: true, phrase: 'the crowds', kind: 'np' }], [':aspect', 'habitual']] });
    if (p.includes('Clause to analyse: they arrive before noon') && !p.includes('## PropBank'))
      return reply({ predicate_kind: 'verb', lemmas: ['arrive'], predicate_text: 'arrive' });
    if (p.includes('Clause to analyse: they arrive before noon'))
      return reply({ concept: 'arrive-01', phrase: 'they arrive before noon', note: 'condition clause',
        relations: [[':ARG1', { expand: true, phrase: 'they', kind: 'np' }], [':aspect', 'performance']] });
    if (p.includes('Noun phrase to analyse: they'))
      return reply({ concept: 'they', relations: [], phrase: 'they', note: 'pronoun' });
    if (p.includes('Noun phrase to analyse: the crowds'))
      return reply({ concept: 'crowd', relations: [[':ref-number', 'plural']], phrase: 'the crowds', note: 'plural' });

    // ---- whole-sentence closers
    if (p.includes('coreference') || p.includes('同指')) return reply({ merge: [] });
    if (p.includes('document level') || p.includes('doc_level') || p.includes('temporal') && p.includes('modal'))
      return reply({ temporal: [], modal: [], coref: [] });

    unmatched.push(p.slice(0, 120).replace(/\s+/g, ' '));
    return reply({ concept: 'thing', relations: [] });
  });

  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  if ((await page.getAttribute('html', 'lang')) !== 'zh') { await page.selectOption('#lang-select', 'zh'); await page.waitForTimeout(300); }

  console.log('\n--- 1. import an unannotated file: nothing annotated, one starter row ---');
  await page.click('#btn-settings'); await page.waitForTimeout(200);
  await (await page.$$('.provider-row .settings-input[type=password]'))[0].fill('sk-ant-demo');
  await (await page.$$('.provider-row .btn.sm'))[0].click();
  await page.click('.modal-head .btn.ghost');
  await page.selectOption('#mode-select', 'live');
  await page.click('[data-menu="menu-import"]');
  await page.click('#btn-drive-demo-en');
  await page.waitForTimeout(600);

  check('source pane holds the text', (await page.textContent('#pane-source')).includes('museum'));
  check('artifact says not annotated yet', (await page.textContent('#pane-annotated')).includes('尚未标注'));
  check('exactly one pending row to start from', (await page.$$('.pending-row')).length === 1);
  check('and it is the discourse step', (await page.textContent('.pending-row')).includes('篇章关系'));

  console.log('\n--- 2. click through sentence 1, one skill call per click ---');
  const steps = [];
  for (let i = 0; i < 10; i++) {
    const row = await page.$('.pending-row:not(.blocked)');
    if (!row) break;
    steps.push((await row.textContent()).replace(/\s+/g, ' ').trim().slice(0, 46));
    await row.click();
    await page.waitForTimeout(320);
  }
  steps.forEach((s, i) => console.log(`      ${i + 1}. ${s}`));
  check('it took several clicks, not one', steps.length >= 6, `${steps.length} clicks`);
  const tree1 = await page.textContent('#pane-annotated');
  for (const skill of ['discourse', 'predicate', 'arguments', 'np_phrase', 'special_entity', 'reentrancy', 'doc_level']) {
    check(`tree shows the ${skill} call`, tree1.includes(skill));
  }
  check('no pending rows left', (await page.$$('.pending-row')).length === 0);
  check('sentence marked done', Boolean(await page.$('.sentence-chip.done')));
  check('artifact reflects the graph', tree1.includes('open-01') && tree1.includes('museum'));

  console.log('\n--- 3. sentence 3 takes the discourse-subordination path ---');
  const chips = await page.$$('.sentence-chip');
  await chips[2].click(); await page.waitForTimeout(300);
  const steps3 = [];
  for (let i = 0; i < 10; i++) {
    const row = await page.$('.pending-row:not(.blocked)');
    if (!row) break;
    steps3.push((await row.textContent()).replace(/\s+/g, ' ').trim().slice(0, 46));
    await row.click();
    await page.waitForTimeout(320);
  }
  steps3.forEach((s, i) => console.log(`      ${i + 1}. ${s}`));
  const tree3 = await page.textContent('#pane-annotated');
  check('the conditional sub-clause was expanded', tree3.includes('avoid-01') && tree3.includes('arrive-01'));
  check('the :condition role shows in the tree', tree3.includes('condition'));

  console.log('\n--- 4. a parallel (flat) format is a different code path ---');
  // Choosing a method applies it to the document already open — it does not go
  // and fetch a different one (see format-switch-test.js). So this is the umr
  // document from section 3, now offered to a flat format: the skill tree is
  // parked and all three sentiment skills are available at once.
  await page.selectOption('#format-select', 'sentiment');
  await page.waitForTimeout(700);
  const sentRows = await page.$$('.pending-row');
  check('the flat method offers every skill at once, on the same document',
    sentRows.length === 3, `${sentRows.length} rows`);
  const sentTree = await page.textContent('#pane-annotated');
  check('the umr tree is parked, not mixed in', !sentTree.includes('np_phrase'));

  // The same path from a BLANK document, which is where a named-vs-default
  // export bug once broke flat formats completely while the pre-filled demo
  // hid it.
  await page.evaluate(async () => {
    const st = await import('./js/core/state.js');
    const src = await import('./js/io/sources.js');
    const doc = src.parseDocument('这家店的招牌菜非常好吃，但价格实在太贵了。\n第二句也要能标。', 'blank-sentiment');
    doc.format = 'sentiment';
    st.set({ doc, selectedSentence: 0, selectedNode: null }, 'doc');
  });
  await page.waitForTimeout(600);
  const flatPending = (await page.$$('.pending-row')).length;
  check('a blank flat document offers every skill at once', flatPending >= 3, `${flatPending} rows`);
  const flatRows = await page.$$eval('.pending-row', (rows) => rows.map((r) => r.textContent.replace(/\s+/g, ' ').trim().slice(0, 30)));
  flatRows.forEach((r) => console.log(`      ${r}`));
  check('second sentence has its own slots too', await page.evaluate(async () => {
    const st = await import('./js/core/state.js');
    st.set({ selectedSentence: 1, selectedNode: null }, 'sentence');
    await new Promise((r) => setTimeout(r, 300));
    return document.querySelectorAll('.pending-row').length >= 3;
  }));

  console.log(`\n=== ${pass} passed, ${fail} failed`);
  console.log('=== unanswered model prompts (must be 0):', unmatched.length);
  unmatched.forEach((u) => console.log('   ' + u));
  console.log('=== console errors:', errs.length);
  errs.forEach((e) => console.log('   ' + e.slice(0, 160)));
  await browser.close();
  process.exit(fail || errs.length || unmatched.length ? 1 : 0);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
