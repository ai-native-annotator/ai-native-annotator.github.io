/**
 * A human correction must be committable, and the corrected value must BE the
 * annotation the moment it is saved.
 *
 * Before core/edits.js, an edit lived only in state.edits: the assistant pane
 * showed it, the artifact builder did not read it, so 「标注后文件」 kept
 * displaying the model's original answer. In an annotation tool that is the
 * one unacceptable outcome — the annotator says "this is wrong", the tool
 * agrees, and the file keeps the wrong value.
 *
 * Also checks that the default editing surface is Penman, that Penman round
 * trips, that revert restores the model's original, and that an edit in one
 * sentence does not leak into the same path in another sentence.
 *
 * Run: NODE_PATH=<playwright> node docs/verification/edit-commit-test.js
 */
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8899';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const body = (o) => JSON.stringify({ content: [{ type: 'text', text: typeof o === 'string' ? o : JSON.stringify(o) }] });
const S1 = 'The museum opened a new exhibit last week.';
let pass = 0, fail = 0;
const check = (label, ok, extra = '') => {
  (ok ? pass++ : fail++);
  console.log(`  ${ok ? '✓' : '✖'} ${label}${extra ? '  ' + extra : ''}`);
};

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, locale: 'zh-CN' });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));

  await page.route('https://api.anthropic.com/v1/messages', async (route) => {
    const p = JSON.parse(route.request().postData()).messages[0].content;
    if (p.includes(`Sentence (English):\n${S1}`)) return route.fulfill({ status: 200, contentType: 'application/json', body: body({ has_discourse: false }) });
    if (p.includes(`Clause to analyse: ${S1}`) && !p.includes('## PropBank'))
      return route.fulfill({ status: 200, contentType: 'application/json', body: body({ predicate_kind: 'verb', lemmas: ['open'], predicate_text: 'opened' }) });
    if (p.includes(`Clause to analyse: ${S1}`))
      return route.fulfill({ status: 200, contentType: 'application/json', body: body({ concept: 'open-01', phrase: S1, note: 'sense -01',
        relations: [[':ARG0', { expand: true, phrase: 'The museum', kind: 'np' }],
          [':ARG1', { expand: true, phrase: 'a new exhibit', kind: 'np' }], [':aspect', 'performance']] }) });
    if (p.includes('Noun phrase to analyse: The museum'))
      return route.fulfill({ status: 200, contentType: 'application/json', body: body({ concept: 'museum', relations: [], phrase: 'The museum', note: 'common noun' }) });
    if (p.includes('Noun phrase to analyse: a new exhibit'))
      return route.fulfill({ status: 200, contentType: 'application/json', body: body({ concept: 'exhibit', relations: [[':mod', { concept: 'new' }]], phrase: 'a new exhibit', note: 'modified noun' }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: body({ concept: 'thing', relations: [] }) });
  });

  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  if ((await page.getAttribute('html', 'lang')) !== 'zh') { await page.click('#btn-lang'); await page.waitForTimeout(300); }

  // live mode + an unannotated English document, annotated through
  await page.click('#btn-settings'); await page.waitForTimeout(200);
  await (await page.$$('.provider-row .settings-input[type=password]'))[0].fill('sk-ant-demo');
  await (await page.$$('.provider-row .btn.sm'))[0].click();
  await page.click('.modal-head .btn.ghost');
  await page.selectOption('#mode-select', 'live');
  await page.click('[data-menu="menu-import"]');
  await page.click('#btn-drive-demo-en');
  await page.waitForTimeout(500);
  for (let i = 0; i < 6; i++) {
    const p = await page.$('.pending-row:not(.blocked)');
    if (!p) break;
    await p.click(); await page.waitForTimeout(300);
  }

  console.log('\n--- 1. Penman is the default editing surface ---');
  const nodes = await page.$$('.node-row:not(.pending-row)');
  await nodes[1].click(); await page.waitForTimeout(300);
  const boxText = await page.inputValue('.edit-box');
  check('edit box is open without hunting for it', Boolean(await page.$('.editor.open')));
  check('default tab is Penman', (await page.textContent('.edit-tabs .btn:not(.ghost)')).trim() === 'Penman');
  check('box holds Penman, not JSON', boxText.trim().startsWith('(') && !boxText.includes('"concept"'), `-> ${boxText.split('\n')[0]}`);
  check('shows the model concept', boxText.includes('open-01'));

  console.log('\n--- 2. saving a correction changes 标注后文件 immediately ---');
  const artifactBefore = await page.textContent('#pane-annotated');
  check('artifact starts with the model answer', artifactBefore.includes('open-01'));
  await page.fill('.edit-box', boxText.replace('open-01', 'open-02').replace(':aspect performance', ':aspect state'));
  await page.click('.edit-actions .btn:not(.ghost)');
  await page.waitForTimeout(400);
  const artifactAfter = await page.textContent('#pane-annotated');
  check('artifact now shows the corrected concept', artifactAfter.includes('open-02'));
  check('artifact no longer shows the model concept', !artifactAfter.includes('open-01'));
  check('corrected attribute is in the artifact too', artifactAfter.includes('state'));
  check('tree marks the node as edited', Boolean(await page.$('.edited-flag')));
  check('status says it is reflected', (await page.textContent('.edit-status')).includes('已同步更新'));

  console.log('\n--- 2b. a save must not shred anything it did not touch ---');
  // Penman tokenizes on whitespace, so a pending slot written bare as
  // <np: Edmund Pope> comes back as "<np:" and the phrase is silently gone.
  const roundTrip = await page.evaluate(async () => {
    const st = await import('./js/core/state.js');
    const ed = await import('./js/core/edits.js');
    const node = st.state.doc.sentences[0].tree.find((n) => n.skill === 'arguments');
    const text = ed.outputToPenman(node);
    const back = ed.penmanToOutput(text, node);
    const slots = (back.output.relations || []).filter(([, v]) => v && v.expand === true);
    return { text, slots: slots.map(([r, v]) => `${r}=${v.phrase}`), ignored: back.ignored };
  });
  check('pending slots keep their phrases through a save',
    roundTrip.slots.every((s) => s.split('=')[1]?.length > 1),
    roundTrip.slots.join(', ') || '(no pending slots on this node)');
  check('the round trip drops nothing', roundTrip.ignored.length === 0, roundTrip.ignored.join('; '));

  console.log('\n--- 3. the edit survives into the export ---');
  const exported = await page.evaluate(async () => {
    const src = await import('./js/io/sources.js');
    const doc = src.exportDocument();
    return { json: JSON.stringify(doc), edits: doc.humanEdits.length, keys: doc.humanEdits.map((e) => e.path) };
  });
  check('exported document carries the correction', exported.json.includes('open-02'));
  check('and records it as a human edit', exported.edits === 1, `key=${exported.keys[0]}`);
  check('edit key is scoped by sentence', /^s\d+:/.test(exported.keys[0]));

  console.log('\n--- 4. revert restores the model original ---');
  await page.click('.edit-actions .btn.ghost');
  await page.waitForTimeout(400);
  const artifactReverted = await page.textContent('#pane-annotated');
  check('artifact back to the model answer', artifactReverted.includes('open-01') && !artifactReverted.includes('open-02'));
  check('edited flag gone', !(await page.$('.edited-flag')));

  console.log('\n--- 5. JSON tab still available as the escape hatch ---');
  await page.click('.edit-tabs .btn.ghost');
  await page.waitForTimeout(250);
  const jsonText = await page.inputValue('.edit-box');
  check('JSON tab shows JSON', jsonText.trim().startsWith('{') && jsonText.includes('"concept"'));
  await page.fill('.edit-box', jsonText.replace('"open-01"', '"open-99"'));
  await page.click('.edit-actions .btn:not(.ghost)');
  await page.waitForTimeout(400);
  check('JSON edit also reaches the artifact', (await page.textContent('#pane-annotated')).includes('open-99'));
  await page.click('.edit-actions .btn.ghost');
  await page.waitForTimeout(300);

  console.log('\n--- 6. an edit must not leak across sentences ---');
  const leak = await page.evaluate(async () => {
    const st = await import('./js/core/state.js');
    const ed = await import('./js/core/edits.js');
    const s0 = st.state.doc.sentences[0];
    const node0 = s0.tree[1];
    ed.applyEdit(0, [1], node0, { concept: 'sentence-zero-only', relations: [] });
    return {
      s0: st.state.doc.sentences[0].tree[1]?.output?.concept,
      s1: st.state.doc.sentences[1]?.tree?.[1]?.output?.concept ?? '(no such node)',
      editedS0: ed.isEdited(0, [1]),
      editedS1: ed.isEdited(1, [1]),
    };
  });
  check('sentence 1 node has the edit', leak.s0 === 'sentence-zero-only');
  check('sentence 2 same path is NOT marked edited', leak.editedS1 === false, `s2 concept=${leak.s1}`);
  check('sentence 1 same path IS marked edited', leak.editedS0 === true);

  console.log(`\n=== ${pass} passed, ${fail} failed`);
  console.log('=== CONSOLE ERRORS:', errs.length);
  errs.forEach((e) => console.log('   ' + e));
  await browser.close();
  process.exit(fail || errs.length ? 1 : 0);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
