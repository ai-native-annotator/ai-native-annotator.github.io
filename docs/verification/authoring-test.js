/**
 * The three things a person must be able to change about this tool.
 *
 *   1. How a file is read. The reader used to be one hard-coded function —
 *      split on newlines — which is right for a text file and wrong for every
 *      corpus anyone actually has. A CoNLL-U treebank read that way is
 *      gibberish. So: a reader per format, editable, drafted by the model if
 *      you want, stored on its own, and never adopted without running.
 *
 *   2. What a skill says. A skill file IS the prompt; it was read-only, so the
 *      only way to fix a typo was to argue with the model about it and wait for
 *      reflection to draft an amendment.
 *
 *   3. What a skill DOES. Some steps are programs, not prompts. `validate`
 *      counts brackets and checks that variables resolve — a model can get that
 *      wrong for no reason, and charges you for the privilege.
 *
 * Run: NODE_PATH=<playwright> node docs/verification/authoring-test.js
 */
const { chromium } = require('playwright');
const { promptOf } = require('./_prompt.js');
const BASE = process.env.BASE || 'http://localhost:8899';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const body = (o) => JSON.stringify({ content: [{ type: 'text', text: typeof o === 'string' ? o : JSON.stringify(o) }] });

const CONLLU = `# sent_id = 1
# text = The museum opened a new exhibit.
1\tThe\tthe\tDET\t_\t_\t2\tdet\t_\t_
2\tmuseum\tmuseum\tNOUN\t_\t_\t3\tnsubj\t_\t_
3\topened\topen\tVERB\t_\t_\t0\troot\t_\t_

# sent_id = 2
# text = Visitors can see rare fossils.
1\tVisitors\tvisitor\tNOUN\t_\t_\t3\tnsubj\t_\t_
2\tcan\tcan\tAUX\t_\t_\t3\taux\t_\t_
3\tsee\tsee\tVERB\t_\t_\t0\troot\t_\t_
`;

let pass = 0, fail = 0;
const check = (label, ok, extra = '') => {
  (ok ? pass++ : fail++);
  console.log(`  ${ok ? '✓' : '✖'} ${label}${extra ? '\n      ' + extra : ''}`);
};

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
    const p = promptOf(route.request().postData());
    prompts.push(p);
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: body({ has_discourse: false }) });
  });

  await page.goto(BASE + '/index.html', { waitUntil: 'load' });
  await page.waitForTimeout(900);
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(800);
  if ((await page.getAttribute('html', 'lang')) !== 'zh') { await page.selectOption('#lang-select', 'zh'); await page.waitForTimeout(300); }

  console.log('\n--- 1. the built-in reader is wrong for a treebank, and that is the point ---');
  const naive = await page.evaluate(async (text) => {
    const src = await import('./js/io/sources.js');
    const doc = src.parseDocument(text, 'ud.conllu');
    return { n: doc.sentences.length, first: doc.sentences[0].text };
  }, CONLLU);
  check('read as plain text it is nonsense', naive.n > 4,
    `${naive.n} "sentences", the first being: ${JSON.stringify(naive.first)}`);

  console.log('\n--- 2. give this format its own reader, through the panel ---');
  await page.click('[data-menu="menu-import"]');
  await page.click('#btn-importer');
  await page.waitForTimeout(500);
  check('the panel opened on the active method', (await page.textContent('.modal-head')).includes('UMR'));

  const buttons = await page.$$('.importer-row .btn.ghost');
  let conlluBtn = null;
  for (const b of buttons) if ((await b.textContent()).includes('CoNLL-U')) conlluBtn = b;
  check('a shipped CoNLL-U reader is offered as a starting point', Boolean(conlluBtn));
  await conlluBtn.click();
  await page.waitForTimeout(300);
  const codeBox = await page.$('.importer-body .code-box');
  check('its source is loaded into the editor, not hidden',
    (await codeBox.inputValue()).includes('function parse('));

  // the sample box is the second plain textarea (describe, sample, code)
  const areas = await page.$$('.importer-body textarea');
  await areas[1].fill(CONLLU);
  await page.click('.importer-row .btn.ghost:has-text("试跑"), .importer-row .btn.ghost:has-text("Dry-run")');
  await page.waitForTimeout(600);
  const status = await page.textContent('.importer-body .edit-status');
  check('a dry-run says what it produced before anything is saved', /2/.test(status), status);
  check('and shows the sentences it cut', (await page.textContent('.importer-preview')).includes('The museum opened'));

  await page.click('.importer-body .modal-actions .btn:not(.ghost)');
  await page.waitForTimeout(500);
  check('saving says it is now in use',
    (await page.textContent('.importer-body')).includes('自定义') || (await page.textContent('.importer-body')).includes('custom'));
  await page.click('.modal-head .btn.ghost');
  await page.waitForTimeout(200);

  console.log('\n--- 3. now the same bytes read correctly ---');
  const read = await page.evaluate(async (text) => {
    const src = await import('./js/io/sources.js');
    const doc = await src.importDocument(text, 'ud.conllu');
    return {
      n: doc.sentences.length,
      first: doc.sentences[0].text,
      tokens: doc.sentences[0].tokens,
      kept: Boolean(doc.sentences[0].conllu),
      deprel: doc.sentences[0].conllu?.[1]?.deprel,
    };
  }, CONLLU);
  check('two sentences, not eleven lines', read.n === 2, `${read.n} sentences`);
  check('the sentence text came from the # text comment', read.first === 'The museum opened a new exhibit.', read.first);
  check('tokens came from the rows', read.tokens.join(' ') === 'The museum opened', read.tokens.join(' '));
  check('and the columns the format cares about were kept, not dropped',
    read.kept && read.deprel === 'nsubj', `deprel of token 2 = ${read.deprel}`);

  console.log('\n--- 4. it belongs to this method only ---');
  const otherFormat = await page.evaluate(async () => {
    const imp = await import('./js/core/importers.js');
    return { umr: Boolean(imp.getImporter('umr')), sentiment: Boolean(imp.getImporter('sentiment')) };
  });
  check('umr has one, sentiment does not', otherFormat.umr && !otherFormat.sentiment,
    JSON.stringify(otherFormat));

  console.log('\n--- 5. a broken reader must not make the file unopenable ---');
  const fallback = await page.evaluate(async (text) => {
    const imp = await import('./js/core/importers.js');
    const src = await import('./js/io/sources.js');
    imp.setImporter('umr', 'function parse() { throw new Error("boom"); }');
    const doc = await src.importDocument(text, 'ud.conllu');
    imp.clearImporter('umr');
    return { n: doc.sentences.length };
  }, CONLLU);
  check('the file still opened, through the built-in reader', fallback.n > 0, `${fallback.n} sentences`);

  console.log('\n--- 6. a skill file is editable, and the edit is what gets sent ---');
  const cards = await page.$$('.skill-card');
  let card = null;
  for (const c of cards) if ((await c.textContent()).includes('discourse')) card = c;
  await card.click(); await page.waitForTimeout(400);
  await page.click('.skill-detail-body .edit-tabs .btn:nth-child(2)');
  await page.waitForTimeout(500);
  const skillBox = await page.$('.skill-detail-body .code-box');
  check('the instructions are in an editable box, not a read-only block', Boolean(skillBox));
  const original = await skillBox.inputValue();
  check('and they are the real file', original.length > 100 && !original.includes('Could not read'),
    original.split('\n')[0]);
  await skillBox.fill(original + '\n\nMARKER-FROM-A-HUMAN-EDIT');
  await page.click('.skill-detail-body .modal-actions .btn:not(.ghost)');
  await page.waitForTimeout(500);

  const effective = await page.evaluate(async () => {
    const sk = await import('./js/core/skills.js');
    return sk.loadEffectiveText('skills/shared/discourse.md');
  });
  check('the saved text is what the next call will send', effective.includes('MARKER-FROM-A-HUMAN-EDIT'));
  check('and it did not just append it as an "amendment"',
    !effective.includes('人工修订') && !effective.includes('Local amendment'));

  console.log('\n--- 7. restoring the original really restores it ---');
  await page.click('.skill-detail-body .modal-actions .btn.ghost');
  await page.waitForTimeout(500);
  const restored = await page.evaluate(async () => {
    const sk = await import('./js/core/skills.js');
    return { text: await sk.loadEffectiveText('skills/shared/discourse.md'), over: sk.getOverrideInfo('skills/shared/discourse.md') };
  });
  check('the marker is gone', !restored.text.includes('MARKER-FROM-A-HUMAN-EDIT'));
  check('and no override is left behind', restored.over === null);

  console.log('\n--- 8. the instructions are shown next to the code they came from ---');
  await page.click('.skill-detail-body .edit-tabs .btn:nth-child(3)');
  await page.waitForTimeout(500);
  const codeTab = await page.textContent('.skill-detail-body');
  check('the reference implementation is there', codeTab.includes('def ') || codeTab.includes('class '),
    codeTab.split('\n').find((l) => l.includes('def ') || l.includes('class ')) || '(no python)');
  check('and it says where it came from', codeTab.includes('modular-parsing'));
  await page.click('.skill-modal .modal-head .btn.ghost');
  await page.waitForTimeout(200);

  console.log('\n--- 9. a pass that is a program runs as one ---');
  await page.selectOption('#format-select', 'refine');
  await page.waitForTimeout(700);
  const ran = await page.evaluate(async () => {
    const st = await import('./js/core/state.js');
    const reg = await import('./js/core/registry.js');
    const chain = await import('./js/core/chain.js');
    const format = reg.getFormat('refine');
    const s = st.state.doc.sentences[0];
    // stand the chain up at the last pass with a graph that is missing an aspect
    s.passes = format.skills.slice(0, 7).map((d, i) => ({ pass: d.id, graph: '', before: '', changes: [] }));
    s.passes[6].graph = '(o / open-01 :ARG0 (m / museum))';
    s.graph = s.passes[6].graph;
    const rec = await chain.runPass(st.state.doc, 0, 7, format);
    return { pass: rec.pass, source: rec.source, model: rec.model, changes: rec.changes, graph: rec.graph, note: rec.note };
  });
  check('the last pass is validate', ran.pass === 'validate');
  check('it ran as code, with no model behind it', ran.source === 'code' && !ran.model, `source=${ran.source}`);
  check('it did the structural work it claims', ran.graph.includes(':aspect'), ran.graph);
  check('and it reported what it changed', ran.changes.some((c) => c.includes(':aspect')), ran.changes.join('; '));
  check('no prompt was sent for it', !prompts.some((p) => p.includes('Skill: validate')));

  console.log(`\n=== ${pass} passed, ${fail} failed`);
  console.log('=== CONSOLE ERRORS:', errs.length);
  errs.forEach((e) => console.log('   ' + e.slice(0, 180)));
  await browser.close();
  process.exit(fail || errs.length ? 1 : 0);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
