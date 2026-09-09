/**
 * A document is text. How you annotate it is a separate choice.
 *
 * Imports used to arrive welded to UMR: `parseDocument` stamped the active
 * format onto the file, importing a sample forced 'umr' first, and the format
 * picker answered a change of method by *opening a different document* — so
 * choosing 精修 threw away the text you had just imported.
 *
 * What this pins:
 *   1. importing while a different method is selected does NOT flip to UMR;
 *   2. changing the method keeps the document — same id, same sentences, and
 *      the document picker does not move;
 *   3. each method's work is kept: refine passes survive a trip through the
 *      skill tree and back, and the skill tree survives a trip through refine;
 *   4. work does not bleed between methods — the refine graph is not visible
 *      as skill-tree nodes, and vice versa;
 *   5. a document that ships with a recorded annotation still opens in the
 *      method that produced it.
 *
 * Run: NODE_PATH=<playwright> node docs/verification/format-switch-test.js
 */
const { chromium } = require('playwright');
const { promptOf } = require('./_prompt.js');
const BASE = process.env.BASE || 'http://localhost:8899';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const body = (o) => JSON.stringify({ content: [{ type: 'text', text: typeof o === 'string' ? o : JSON.stringify(o) }] });

const S1 = 'The museum opened a new exhibit last week.';
const DRAFT = '(o / open-01\n    :ARG0 (m / museum)\n    :ARG1 (e / exhibit))';

let pass = 0, fail = 0;
const check = (label, ok, extra = '') => {
  (ok ? pass++ : fail++);
  console.log(`  ${ok ? '✓' : '✖'} ${label}${extra ? '\n      ' + extra : ''}`);
};

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1700, height: 1000 }, locale: 'zh-CN' });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));

  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(BASE) || url.startsWith('https://api.anthropic.com')) return route.fallback();
    return route.abort();
  });
  await page.route('https://api.anthropic.com/**', (route) => {
    const p = promptOf(route.request().postData());
    const reply = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: body(o) });
    // refine passes
    if (p.includes('one-shot UMR draft'))
      return reply({ graph: DRAFT, changes: ['drafted the whole graph'], note: 'first draft' });
    if (p.includes('Current UMR graph'))
      return reply({ graph: DRAFT, changes: [], note: 'nothing to change' });
    // umr skills
    if (p.includes(`Sentence (English):\n${S1}`)) return reply({ has_discourse: false });
    if (p.includes(`Clause to analyse: ${S1}`) && !p.includes('## PropBank'))
      return reply({ predicate_kind: 'verb', lemmas: ['open'], predicate_text: 'opened' });
    if (p.includes(`Clause to analyse: ${S1}`))
      return reply({ concept: 'open-01', phrase: S1,
        relations: [[':ARG0', { expand: true, phrase: 'The museum', kind: 'np' }], [':aspect', 'performance']] });
    if (p.includes('Noun phrase to analyse: The museum'))
      return reply({ concept: 'museum', relations: [], phrase: 'The museum' });
    return reply({ concept: 'thing', relations: [] });
  });

  await page.goto(BASE + '/index.html', { waitUntil: 'load' });
  await page.waitForTimeout(900);
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(700);
  if ((await page.getAttribute('html', 'lang')) !== 'zh') { await page.selectOption('#lang-select', 'zh'); await page.waitForTimeout(300); }

  await page.click('#btn-settings'); await page.waitForTimeout(200);
  await (await page.$$('.provider-row .settings-input[type=password]'))[0].fill('sk-ant-demo');
  await (await page.$$('.provider-row .btn.sm'))[0].click();
  await page.click('.modal-head .btn.ghost');
  await page.selectOption('#mode-select', 'live');

  const info = () => page.evaluate(async () => {
    const st = await import('./js/core/state.js');
    const s = st.state.doc?.sentences?.[st.state.selectedSentence];
    // count the WHOLE tree: a clause resolves into an arguments node with a
    // predicate child, so top-level entries undercount the calls made
    const count = (nodes, pending) => (nodes || []).reduce((n, x) =>
      n + (Boolean(x.pending) === pending ? 1 : 0) + (x.pending ? 0 : count(x.children, pending)), 0);
    return {
      doc: st.state.doc?.id, format: st.state.formatId,
      docSel: document.querySelector('#doc-select')?.value,
      text: s?.text || '',
      treeNodes: count(s?.tree, false),
      pendingRows: count(s?.tree, true),
      passes: (s?.passes || []).filter(Boolean).length,
      graph: (s?.graph || '').slice(0, 24),
    };
  });

  console.log('\n--- 1. importing while 精修 is selected must not flip to UMR ---');
  await page.selectOption('#format-select', 'refine');
  await page.waitForTimeout(700);
  await page.click('[data-menu="menu-import"]');
  await page.click('#btn-drive-demo-en');
  await page.waitForTimeout(800);
  let st = await info();
  check('the file was imported', st.text.includes('museum'), st.text);
  check('and the method is still refine', st.format === 'refine', `format=${st.format}`);
  check('the pane shows the pass pipeline', (await page.$$('.chain-row')).length === 8,
    `${(await page.$$('.chain-row')).length} chain rows`);
  check('no skill-tree rows in a chained method', (await page.$$('.node-row')).length === 0);

  console.log('\n--- 2. run one pass, then switch method: the document stays ---');
  await page.click('.chain-row.next .btn.xs');
  await page.waitForTimeout(600);
  st = await info();
  check('pass 1 produced a graph', st.passes === 1 && st.graph.includes('open-01'), st.graph);

  const docBefore = st.doc;
  const selBefore = st.docSel;
  await page.selectOption('#format-select', 'umr');
  await page.waitForTimeout(700);
  st = await info();
  check('same document', st.doc === docBefore, `${docBefore} -> ${st.doc}`);
  check('same sentence text', st.text.includes('museum'));
  check('the document picker did not move', st.docSel === selBefore,
    `"${selBefore}" -> "${st.docSel}"  (an imported file is not in the demo list, so both are empty)`);
  check('now it is a skill tree, seeded with one row to click',
    st.pendingRows === 1 && st.treeNodes === 0, `${st.treeNodes} resolved / ${st.pendingRows} pending`);
  check('the refine graph is not showing as skill work', st.graph === '', st.graph || '(empty)');
  check('the artifact says this method has not annotated it yet',
    (await page.textContent('.artifact')).includes('尚未标注'));
  check('and no stray "null" got appended to the pane',
    !(await page.textContent('#pane-annotated')).includes('null'));

  console.log('\n--- 3. annotate with skills, then go back: the passes are still there ---');
  for (let i = 0; i < 3; i++) {
    const row = await page.$('.pending-row:not(.blocked)');
    if (!row) break;
    await row.click(); await page.waitForTimeout(400);
  }
  st = await info();
  check('skill calls landed on the tree', st.treeNodes >= 3, `${st.treeNodes} calls`);

  await page.selectOption('#format-select', 'refine');
  await page.waitForTimeout(700);
  st = await info();
  check('the pass survived the round trip', st.passes === 1, `${st.passes} passes`);
  check('and so did its graph', st.graph.includes('open-01'), st.graph);
  check('the finished pass is still marked done', (await page.$$('.chain-row.done')).length === 1);
  check('the skill tree is not leaking into the chain view', (await page.$$('.node-row')).length === 0);

  console.log('\n--- 4. and the skill tree is still there when we come back to it ---');
  await page.selectOption('#format-select', 'umr');
  await page.waitForTimeout(700);
  st = await info();
  check('every skill call is where we left it', st.treeNodes >= 3, `${st.treeNodes} calls`);
  check('the artifact is the skill-built graph again',
    (await page.textContent('.artifact')).includes('open-01'));

  console.log('\n--- 5. the picker says which methods this document has work in ---');
  const options = await page.$$eval('#format-select option', (os) => os.map((o) => o.textContent));
  check('refine is marked as having work', options.some((o) => o.includes('已有标注')), options.join(' | '));

  console.log('\n--- 6. exporting keeps both methods, not just the one on screen ---');
  const exported = await page.evaluate(async () => {
    const src = await import('./js/io/sources.js');
    const doc = src.exportDocument();
    const s = doc.sentences[0];
    return {
      format: doc.format,
      liveCalls: (s.tree || []).length,
      parked: Object.keys(s._work || {}),
      parkedPasses: (s._work?.refine?.passes || []).length,
      shipsActiveTwice: Boolean(s._work?.umr),
    };
  });
  check('the export names the method it was made with', exported.format === 'umr', exported.format);
  check('the method on screen is in the sentence itself', exported.liveCalls > 0, `${exported.liveCalls} top-level`);
  check('the other method rides along', exported.parkedPasses === 1, `parked: ${exported.parked.join(', ')}`);
  check('and is not shipped twice', !exported.shipsActiveTwice);

  console.log('\n--- 7. a document recorded in one method still opens in it ---');
  await page.selectOption('#doc-select', 'sentiment-demo');
  await page.waitForTimeout(900);
  st = await info();
  check('opening the sentiment demo switches to sentiment', st.format === 'sentiment', `format=${st.format}`);
  check('and its recorded annotation is showing', st.treeNodes > 0, `${st.treeNodes} calls`);

  console.log(`\n=== ${pass} passed, ${fail} failed`);
  console.log('=== CONSOLE ERRORS:', errs.length);
  errs.forEach((e) => console.log('   ' + e.slice(0, 180)));
  await browser.close();
  process.exit(fail || errs.length ? 1 : 0);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
