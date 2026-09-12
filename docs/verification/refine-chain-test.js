/**
 * The refine format: passes chained over a whole graph, not a tree of calls.
 *
 * This is a third shape of annotation work and the reason it needs its own
 * rendering: a pass does not analyse a PART of what the pass before it
 * produced, it supersedes the whole thing. So the checks here are about the
 * chain's invariants rather than a tree's:
 *
 *   - passes run strictly in order; a later one cannot be started early,
 *     because its input is the previous one's output
 *   - each pass's input really is the previous pass's graph
 *   - the artifact always shows the latest pass's graph
 *   - re-running a pass discards everything after it, since those passes read
 *     a graph that no longer exists
 *   - a pass returning something unparseable must not destroy the good graph
 *
 * Run: npm run test:browser -- refine-chain-test.js
 */
const { launchBrowser } = require('./_browser');
const { promptOf } = require('./_prompt.js');
const BASE = process.env.BASE || 'http://localhost:8899';
const body = (o) => JSON.stringify({ content: [{ type: 'text', text: typeof o === 'string' ? o : JSON.stringify(o) }] });
let pass = 0, fail = 0;
const check = (label, ok, extra = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? '✓' : '✖'} ${label}${extra ? '\n      ' + extra : ''}`); };

const G1 = '(s1t / taste\n    :ARG0 (s1p / person)\n    :ARG1 (s1f / freedom))';
const G2 = '(s1t / taste-01\n    :ARG0 (s1p / person)\n    :ARG1 (s1f / freedom))';
const G3 = '(s1t / taste-01\n    :ARG0 (s1p / person)\n    :ARG1 (s1f / freedom)\n    :aspect state)';

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1700, height: 1000 }, locale: 'zh-CN' });
  const errs = [];
  const sent = [];                       // every prompt, so we can prove what each pass was fed
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));

  // Chromium reaches out to Google telemetry hosts on startup; through a proxy
  // those can hang, and then `networkidle` never fires and the test looks like
  // a product bug. Nothing outside localhost and the model API is wanted here.
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(BASE) || url.startsWith('https://api.anthropic.com')) return route.fallback();
    return route.abort();
  });

  let breakGraph = false;
  await page.route('https://api.anthropic.com/**', (route) => {
    const p = promptOf(route.request().postData());
    sent.push(p);
    const reply = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: body(o) });
    if (breakGraph) return reply({ graph: '(((not penman at all', changes: ['broke it'], note: 'oops' });
    if (p.includes('one-shot UMR draft')) return reply({ graph: G1, changes: ['drafted 3 nodes'], note: 'first draft' });
    if (p.includes('roleset check')) return reply({ graph: G2, changes: ['taste -> taste-01'], note: 'perceive sense' });
    if (p.includes('Skill: aspect')) return reply({ graph: G3, changes: ['added :aspect state'], note: 'stative' });
    return reply({ graph: G3, changes: [], note: 'nothing to change' });
  });

  await page.goto(BASE + '/index.html', { waitUntil: 'load' });
  await page.waitForTimeout(900);
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(600);
  if ((await page.getAttribute('html', 'lang')) !== 'zh') { await page.selectOption('#lang-select', 'zh'); await page.waitForTimeout(300); }
  await page.click('#btn-settings'); await page.waitForTimeout(200);
  await (await page.$$('.provider-row .settings-input[type=password]'))[0].fill('sk-ant-demo');
  await (await page.$$('.provider-row .btn.sm'))[0].click();
  await page.click('.modal-head .btn.ghost');
  await page.selectOption('#mode-select', 'live');
  await page.selectOption('#format-select', 'refine');
  await page.waitForTimeout(1000);

  console.log('\n--- 1. it is a chain, and only the frontier can run ---');
  check('all passes listed', (await page.$$('.chain-row')).length === 8, `${(await page.$$('.chain-row')).length} rows`);
  check('exactly one pass is runnable', (await page.$$('.chain-row.next')).length === 1);
  check('the rest are blocked', (await page.$$('.chain-row.blocked')).length === 7);
  check('no graph before the chain runs', (await page.textContent('#pane-annotated')).includes('还没有图'));
  check('a blocked pass offers no run button', (await page.$$('.chain-row.blocked .btn.xs')).length === 0);

  console.log('\n--- 2. running in order; each pass is fed the previous graph ---');
  const runNext = async () => {
    const btn = await page.$('.chain-row.next .btn.xs');
    if (!btn) return false;
    await btn.click();
    await page.waitForTimeout(450);
    return true;
  };
  await runNext();
  check('pass 1 produced the draft', (await page.textContent('#pane-annotated')).includes('taste'));
  check('pass 1 was told there is no graph yet', sent[0].includes('no graph yet'));

  await runNext();
  check('pass 2 was fed pass 1 output', sent[1].includes('/ taste\n') || sent[1].includes('(s1t / taste'),
    sent[1].split('Current UMR graph')[1]?.slice(0, 60).replace(/\n/g, ' '));
  check('artifact now shows the corrected sense', (await page.textContent('#pane-annotated')).includes('taste-01'));

  console.log('\n--- 3. a finished pass shows what it changed ---');
  await page.click('.chain-row.done'); await page.waitForTimeout(350);
  const detail = await page.textContent('#pane-assistant');
  check('the pass detail opens', detail.includes('本步改动'));
  check('it lists the change', detail.includes('drafted 3 nodes') || detail.includes('taste'));
  check('and shows a whole-graph diff', Boolean(await page.$('.diff-block')));

  console.log('\n--- 4. re-running a pass discards the passes after it ---');
  // bounded: a failing pass leaves the frontier where it is, and an unbounded
  // loop would click the same button forever rather than reporting the failure
  for (let i = 0; i < 10; i++) { if (!(await runNext())) break; }
  const allDone = (await page.$$('.chain-row.done')).length;
  check('chain completes', allDone === 8, `${allDone} done`);
  const beforeRerun = (await page.$$('.chain-row.done')).length;
  await page.click('.chain-row.done .node-act');       // re-run from pass 1
  await page.waitForTimeout(700);
  const afterRerun = (await page.$$('.chain-row.done')).length;
  check('later passes were dropped', afterRerun < beforeRerun, `${beforeRerun} -> ${afterRerun}`);
  check('and it is recorded as an issue', await page.evaluate(async () => {
    const r = await import('./js/core/reflection.js');
    return r.allIssues().some((i) => i.kind === 'rerun');
  }));

  await page.close();

  // A fresh page for this one. Driving it after the long sequence above left
  // the previous page in a state where even a trivial evaluate would not
  // settle, and a scenario that has to prove "the good graph survives" is
  // worth isolating rather than chasing through accumulated UI state.
  console.log('\n--- 5. a malformed answer must not destroy the good graph ---');
  {
    const p2 = await browser.newPage({ viewport: { width: 1400, height: 900 }, locale: 'zh-CN' });
    p2.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
    await p2.route('**/*', (route) => {
      const url = route.request().url();
      if (url.startsWith(BASE) || url.startsWith('https://api.anthropic.com')) return route.fallback();
      return route.abort();
    });
    let broken = false;
    await p2.route('https://api.anthropic.com/**', (route) => route.fulfill({
      status: 200, contentType: 'application/json',
      body: body(broken ? { graph: '(((not penman at all', changes: [], note: 'oops' } : { graph: G2, changes: ['drafted'], note: 'draft' }),
    }));
    await p2.goto(BASE + '/index.html', { waitUntil: 'load' });
    await p2.waitForTimeout(900);
    await p2.click('#btn-settings'); await p2.waitForTimeout(250);
    await (await p2.$$('.provider-row .settings-input[type=password]'))[0].fill('sk-ant-demo');
    await (await p2.$$('.provider-row .btn.sm'))[0].click();
    await p2.click('.modal-head .btn.ghost');
    await p2.selectOption('#mode-select', 'live');
    await p2.selectOption('#format-select', 'refine');
    await p2.waitForTimeout(900);

    const runPassAt = async (i) => p2.evaluate(async (idx) => {
      const st = await import('./js/core/state.js');
      const ch = await import('./js/core/chain.js');
      const reg = await import('./js/core/registry.js');
      const fmt = reg.getFormat('refine');
      const rec = await ch.runPass(st.state.doc, 0, idx, fmt);
      return { warning: rec.warning, graph: rec.graph, before: rec.before };
    }, i);

    const good = await runPassAt(0);
    check('a good pass stores its graph', good.graph.includes('taste-01'), good.graph.split('\n')[0]);

    broken = true;
    const bad = await runPassAt(1);
    check('a malformed answer is flagged, not silently accepted',
      (bad.warning || '').includes('解析不了') || (bad.warning || '').includes('will not parse'),
      bad.warning || '(no warning)');
    check('the good graph it was built on is still on the record',
      bad.before.includes('taste-01'), bad.before.split('\n')[0] || '(empty)');
    await p2.close();
  }

  console.log(`\n=== ${pass} passed, ${fail} failed`);
  console.log('=== console errors:', errs.length);
  errs.forEach((e) => console.log('   ' + e.slice(0, 160)));
  await browser.close();
  process.exit(fail || errs.length ? 1 : 0);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
