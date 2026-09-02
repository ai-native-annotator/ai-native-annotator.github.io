/**
 * A human edit changes the SHAPE of the annotation, not just its values.
 *
 * Three failures this pins down, all reported against the same sentence
 * (「如果他们中午前到达，就能避开人群。」):
 *
 *   1. The artifact showed `:condition` and the annotation tree did not. A
 *      pending row printed its role; the moment that row was resolved the role
 *      vanished, so the tree stopped saying how a node hung off its parent
 *      exactly when the answer arrived.
 *
 *   2. Editing a node did not move the tree under 标注后文件. Writing a new
 *      `<np: …>` placeholder produced no row to click — and worse, the edge
 *      disappeared from the artifact too, because expandable edges are read
 *      from `children` and no child had been created.
 *
 *   3. A placeholder the annotator answered by hand stayed marked 待运行.
 *      Only `<>` should need expanding; anything written out in full is
 *      annotated, and the editor threw the written concept away.
 *
 * Run: NODE_PATH=<playwright> node docs/verification/edit-structure-test.js
 */
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8899';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const body = (o) => JSON.stringify({ content: [{ type: 'text', text: typeof o === 'string' ? o : JSON.stringify(o) }] });

const SENT = '如果他们中午前到达，就能避开人群。';
const MAIN = '就能避开人群';
const COND = '他们中午前到达';

let pass = 0, fail = 0;
const check = (label, ok, extra = '') => {
  (ok ? pass++ : fail++);
  console.log(`  ${ok ? '✓' : '✖'} ${label}${extra ? '\n      ' + extra : ''}`);
};

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, locale: 'zh-CN' });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));

  await page.route('https://api.anthropic.com/v1/messages', async (route) => {
    const p = JSON.parse(route.request().postData()).messages[0].content;
    const reply = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: body(o) });

    // A conditional: the main clause is the graph root, the if-clause hangs
    // off it by :condition. This is the subordination shape — `structure` is
    // itself the pending main clause and `sub` carries the extra edge.
    if (p.includes('Sentence (Chinese):') && p.includes(SENT)) {
      return reply({ has_discourse: true, structure: {
        expand: true, kind: 'clause', phrase: MAIN,
        sub: [[':condition', { expand: true, kind: 'clause', phrase: COND }]],
      } });
    }
    if (p.includes(`Clause to analyse: ${MAIN}`) && !p.includes('## PropBank'))
      return reply({ predicate_kind: 'verb', lemmas: ['避开'], predicate_text: '避开' });
    if (p.includes(`Clause to analyse: ${MAIN}`))
      return reply({ concept: '避开-01', phrase: MAIN,
        relations: [[':ARG1', { expand: true, kind: 'np', phrase: '人群' }], [':aspect', 'performance']] });
    if (p.includes(`Clause to analyse: ${COND}`) && !p.includes('## PropBank'))
      return reply({ predicate_kind: 'verb', lemmas: ['到达'], predicate_text: '到达' });
    if (p.includes(`Clause to analyse: ${COND}`))
      return reply({ concept: '到达-01', phrase: COND,
        relations: [[':ARG0', { expand: true, kind: 'np', phrase: '他们' }], [':aspect', 'performance']] });
    if (p.includes('Noun phrase to analyse: 匆忙'))
      return reply({ concept: '匆忙', relations: [], phrase: '匆忙' });
    return reply({ concept: 'thing', relations: [] });
  });

  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  if ((await page.getAttribute('html', 'lang')) !== 'zh') { await page.selectOption('#lang-select', 'zh'); await page.waitForTimeout(300); }

  await page.click('#btn-settings'); await page.waitForTimeout(200);
  await (await page.$$('.provider-row .settings-input[type=password]'))[0].fill('sk-ant-demo');
  await (await page.$$('.provider-row .btn.sm'))[0].click();
  await page.click('.modal-head .btn.ghost');
  await page.selectOption('#mode-select', 'live');
  await page.click('[data-menu="menu-import"]');
  await page.click('#btn-drive-demo-zh');
  await page.waitForTimeout(600);

  // sentence 3 is the conditional
  const chips = await page.$$('.sentence-chip');
  await chips[2].click();
  await page.waitForTimeout(300);
  const picked = await page.evaluate(async () => {
    const st = await import('./js/core/state.js');
    return { i: st.state.selectedSentence, text: st.state.doc.sentences[st.state.selectedSentence]?.text };
  });
  check('picked the conditional sentence', picked.text === SENT, `[${picked.i}] ${picked.text}`);

  const tree = () => page.textContent('.tree');
  const art = () => page.textContent('.artifact');
  const pendingTexts = async () => Promise.all((await page.$$('.pending-row')).map((r) => r.textContent()));
  const clickPending = async (needle) => {
    for (const row of await page.$$('.pending-row:not(.blocked)')) {
      if ((await row.textContent()).includes(needle)) { await row.click(); await page.waitForTimeout(400); return true; }
    }
    return false;
  };
  const clickNode = async (needle) => {
    for (const row of await page.$$('.node-row:not(.pending-row)')) {
      if ((await row.textContent()).includes(needle)) { await row.click(); await page.waitForTimeout(300); return true; }
    }
    return false;
  };

  console.log('\n--- 1. a resolved node says which edge it hangs off ---');
  await clickPending('篇章关系');
  await clickPending(MAIN);
  check('the if-clause is queued as :condition', (await pendingTexts()).some((t) => t.includes(':condition')));
  await clickPending(COND);

  check('the artifact has :condition', (await art()).includes(':condition'));
  const condRow = await page.evaluate(() => {
    const row = [...document.querySelectorAll('.node-row:not(.pending-row)')]
      .find((r) => r.textContent.includes('到达-01'));
    return row ? { text: row.textContent, chip: row.querySelector('.role-chip')?.textContent || '' } : null;
  });
  check('the resolved if-clause is on the tree', Boolean(condRow), condRow?.text || '(not found)');
  check('and the tree shows :condition too', condRow?.chip === ':condition',
    `role chip = ${condRow?.chip || '(none)'}`);

  console.log('\n--- 2. the editor shows each edge once ---');
  await clickNode('避开-01');
  const penman = await page.inputValue('.edit-box');
  const count = (s, n) => s.split(n).length - 1;
  check('the pending slot is there to expand', penman.includes('<np: 人群>'), penman.replace(/\n\s*/g, ' '));
  check(':condition appears exactly once', count(penman, ':condition') === 1);
  check(':ARG1 appears exactly once', count(penman, ':ARG1') === 1);
  check('the resolved child is a node, not a placeholder',
    penman.includes('到达-01') && !penman.includes(`<clause: ${COND}>`));

  console.log('\n--- 3. answering a <> slot by hand retires it ---');
  await page.fill('.edit-box', penman.replace('"<np: 人群>"', '(c / 人群)'));
  await page.click('.edit-actions .btn:not(.ghost)');
  await page.waitForTimeout(500);
  check('no error on save', !(await page.textContent('.edit-status')).includes('没能应用'),
    await page.textContent('.edit-status'));
  check('the 人群 row is gone from the tree', !(await pendingTexts()).some((t) => t.includes('人群')),
    (await pendingTexts()).join(' | ') || '(no pending rows left)');
  check('the artifact carries the hand-written concept', (await art()).includes('人群'));
  check('and no longer shows it as pending', !(await art()).includes('<np: 人群>'));

  console.log('\n--- 4. writing a new <> slot creates a row to click ---');
  const filled = await page.inputValue('.edit-box');
  await page.fill('.edit-box', filled.replace(':aspect performance', ':aspect performance\n    :manner "<np: 匆忙>"'));
  await page.click('.edit-actions .btn:not(.ghost)');
  await page.waitForTimeout(500);
  const withManner = await pendingTexts();
  check('a pending row appeared for it', withManner.some((t) => t.includes('匆忙')), withManner.join(' | '));
  check('it is labelled with the role the annotator gave it',
    withManner.some((t) => t.includes(':manner') && t.includes('匆忙')));
  // The edge used to vanish here: graphNodeOf reads expandable edges from
  // `children`, and before the sync there was no child to read.
  check('and the artifact shows the slot, not nothing', (await art()).includes('<np: 匆忙>'), (await art()).replace(/\n\s*/g, ' '));

  console.log('\n--- 5. revert puts the shape back, not just the values ---');
  await page.click('.edit-actions .btn.ghost');
  await page.waitForTimeout(500);
  const reverted = await pendingTexts();
  check('the model\'s own slot is back', reverted.some((t) => t.includes('人群')), reverted.join(' | '));
  check('the hand-written slot is gone', !reverted.some((t) => t.includes('匆忙')));
  check('artifact back to the model answer', (await art()).includes('<np: 人群>') && !(await art()).includes('匆忙'));
  check('the resolved :condition survived the revert', (await tree()).includes('到达-01'));

  console.log('\n--- 6. a hand-written slot is a real slot: it runs ---');
  await clickNode('避开-01');
  const again = await page.inputValue('.edit-box');
  await page.fill('.edit-box', again.replace(':aspect performance', ':aspect performance\n    :manner "<np: 匆忙>"'));
  await page.click('.edit-actions .btn:not(.ghost)');
  await page.waitForTimeout(500);
  check('the row is clickable', await clickPending('匆忙'));
  const mannerRow = await page.evaluate(() => {
    const row = [...document.querySelectorAll('.node-row:not(.pending-row)')]
      .find((r) => r.textContent.includes('匆忙'));
    return row ? { skill: row.querySelector('.skill-chip')?.textContent || '', chip: row.querySelector('.role-chip')?.textContent || '' } : null;
  });
  check('it ran the skill the kind asked for', mannerRow?.skill === 'np_phrase', `skill = ${mannerRow?.skill}`);
  check('and the resolved node keeps the role', mannerRow?.chip === ':manner', `role chip = ${mannerRow?.chip || '(none)'}`);
  check('the artifact now has the analysed node', (await art()).includes(':manner') && !(await art()).includes('<np: 匆忙>'));

  console.log(`\n=== ${pass} passed, ${fail} failed`);
  console.log('=== CONSOLE ERRORS:', errs.length);
  errs.forEach((e) => console.log('   ' + e.slice(0, 200)));
  await browser.close();
  process.exit(fail || errs.length ? 1 : 0);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
