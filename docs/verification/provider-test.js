/**
 * What goes on the wire, and how many of them go at once.
 *
 * Three things are checked here because all three were real failures:
 *
 *   1. OpenAI was unusable. The code sent `max_tokens`, which every reasoning
 *      model rejects outright with a 400 ("use max_completion_tokens instead"),
 *      and the default model was empty so the app refused before it even tried.
 *
 *   2. A parameter one model family accepts and another rejects must not fail
 *      the call. `reasoning_effort` is rejected by gpt-4.1 outright and by value
 *      on some gpt-5 models; users bring model names this code has never heard
 *      of. The request drops the named parameter and retries once.
 *
 *   3. Independent slots must go out together. A sentence is a dozen skill
 *      calls, most of them about different phrases; running them strictly one
 *      at a time made the wall-clock cost the sum of every round trip.
 *
 * Run: NODE_PATH=<playwright> node docs/verification/provider-test.js
 */
const { chromium } = require('playwright');
const { promptOf } = require('./_prompt.js');
const BASE = process.env.BASE || 'http://localhost:8899';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const S1 = 'The museum opened a new exhibit last week.';

let pass = 0, fail = 0;
const check = (label, ok, extra = '') => {
  (ok ? pass++ : fail++);
  console.log(`  ${ok ? '✓' : '✖'} ${label}${extra ? '\n      ' + extra : ''}`);
};

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, locale: 'zh-CN' });
  const errs = [];
  // The retry test deliberately provokes a 400; the browser logs every failed
  // response, so that one is expected noise rather than a finding.
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('400 (Bad Request)')) errs.push(m.text());
  });
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));

  const openaiReqs = [];
  let rejectEffortOnce = true;
  await page.route('https://api.openai.com/**', async (route) => {
    const req = JSON.parse(route.request().postData());
    openaiReqs.push(req);
    // Stand in for a model that refuses a parameter by name, exactly as the
    // real API does.
    if (req.reasoning_effort && rejectEffortOnce) {
      rejectEffortOnce = false;
      const err = { error: { message: 'Unrecognized request argument supplied: reasoning_effort',
        type: 'invalid_request_error', param: 'reasoning_effort', code: 'unsupported_parameter' } };
      return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify(err) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      choices: [{ message: { content: '{"has_discourse": false}' }, finish_reason: 'stop' }] }) });
  });

  // Anthropic: record concurrency by holding each request open briefly.
  let inFlight = 0, peak = 0;
  const anthropicReqs = [];
  await page.route('https://api.anthropic.com/**', async (route) => {
    const req = JSON.parse(route.request().postData());
    anthropicReqs.push(req);
    const p = promptOf(req);
    inFlight++; peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 220));
    inFlight--;
    const reply = (o) => route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(o) }] }) });
    if (p.includes(`Sentence (English):\n${S1}`)) return reply({ has_discourse: false });
    if (p.includes(`Clause to analyse: ${S1}`) && !p.includes('## PropBank'))
      return reply({ predicate_kind: 'verb', lemmas: ['open'], predicate_text: 'opened' });
    if (p.includes(`Clause to analyse: ${S1}`))
      return reply({ concept: 'open-01', phrase: S1, relations: [
        [':ARG0', { expand: true, phrase: 'The museum', kind: 'np' }],
        [':ARG1', { expand: true, phrase: 'a new exhibit', kind: 'np' }],
        [':temporal', { expand: true, phrase: 'last week', kind: 'special' }],
        [':aspect', 'performance']] });
    return reply({ concept: 'thing', relations: [] });
  });

  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  if ((await page.getAttribute('html', 'lang')) !== 'zh') { await page.selectOption('#lang-select', 'zh'); await page.waitForTimeout(300); }

  console.log('\n--- 1. OpenAI works out of the box ---');
  const defaults = await page.evaluate(async () => {
    const { PROVIDERS } = await import('./js/core/providers.js');
    return { openai: PROVIDERS.openai.defaultModel, anthropic: PROVIDERS.anthropic.defaultModel };
  });
  check('OpenAI ships a default model', Boolean(defaults.openai), `default = ${defaults.openai || '(none)'}`);

  const sent = await page.evaluate(async () => {
    const { callProvider } = await import('./js/core/providers.js');
    const text = await callProvider('openai', {
      apiKey: 'sk-test', model: 'gpt-5-mini',
      system: 'INSTRUCTIONS BLOCK', prompt: 'TASK BLOCK', maxTokens: 1234,
    });
    return text;
  });
  check('the call returns the model text', sent.includes('has_discourse'), sent);
  const first = openaiReqs[0];
  check('it sends max_completion_tokens', first.max_completion_tokens === 1234,
    JSON.stringify({ max_tokens: first.max_tokens, max_completion_tokens: first.max_completion_tokens }));
  check('and never sends max_tokens', !('max_tokens' in first));
  check('instructions go in a system message, task in the user message',
    first.messages[0].role === 'system' && first.messages[0].content === 'INSTRUCTIONS BLOCK'
      && first.messages[1].content === 'TASK BLOCK');

  console.log('\n--- 2. a parameter this model refuses is dropped, not fatal ---');
  const n0 = openaiReqs.length;
  const retried = await page.evaluate(async () => {
    const { callProvider } = await import('./js/core/providers.js');
    return callProvider('openai', { apiKey: 'sk-test', model: 'gpt-4.1-mini',
      prompt: 'TASK', reasoningEffort: 'minimal' });
  });
  const tries = openaiReqs.slice(n0);
  check('it tried with the parameter, then without', tries.length === 2
    && 'reasoning_effort' in tries[0] && !('reasoning_effort' in tries[1]),
    tries.map((r) => Object.keys(r).join(',')).join('  |  '));
  check('and the caller still gets an answer', retried.includes('has_discourse'));

  console.log('\n--- 3. Anthropic caches the instructions instead of resending them ---');
  await page.evaluate(async () => {
    const { callProvider } = await import('./js/core/providers.js');
    await callProvider('anthropic', { apiKey: 'sk-ant-test',
      system: 'X'.repeat(3000), prompt: 'TASK BLOCK' });
  });
  const a = anthropicReqs[anthropicReqs.length - 1];
  check('a long instruction block is marked cacheable',
    Array.isArray(a.system) && a.system[0].cache_control?.type === 'ephemeral',
    JSON.stringify(a.system).slice(0, 90));
  check('the task is not in it', a.messages[0].content === 'TASK BLOCK');

  console.log('\n--- 4. independent slots go out together ---');
  await page.click('#btn-settings'); await page.waitForTimeout(200);
  await (await page.$$('.provider-row .settings-input[type=password]'))[0].fill('sk-ant-demo');
  await (await page.$$('.provider-row .btn.sm'))[0].click();
  await page.click('.modal-head .btn.ghost');
  await page.selectOption('#mode-select', 'live');
  await page.click('[data-menu="menu-import"]');
  await page.click('#btn-drive-demo-en');
  await page.waitForTimeout(500);

  // Get to the point where sibling slots are open. A clause is two sequential
  // calls (predicate then arguments), so wait past both before looking.
  for (let i = 0; i < 2; i++) {
    const row = await page.$('.pending-row:not(.running)');
    if (!row) break;
    await row.click();
    await page.waitForFunction(() => !document.querySelector('.pending-row.running'), null, { timeout: 15000 });
  }
  const rowTexts = await page.$$eval('.pending-row', (rows) =>
    rows.map((r) => r.textContent.replace(/\s+/g, ' ').trim().slice(0, 40)));
  check('several sibling slots are open at once', rowTexts.length >= 3, rowTexts.join(' | '));

  peak = 0;
  const runAll = await page.$('.pane-subbar .btn.xs');
  check('there is a way to run the rest without clicking each row', Boolean(runAll));
  const t0 = Date.now();
  await runAll.click();
  await page.waitForFunction(() => !document.querySelector('.pending-row'), null, { timeout: 30000 })
    .catch(() => {});
  const elapsed = Date.now() - t0;
  check('several calls were in flight at once', peak >= 2, `peak concurrency = ${peak}`);
  check('the sentence finished', (await page.$$('.pending-row')).length === 0);
  // 8+ calls at 220ms each is ~1.8s strictly serial; waves of 3-4 come in well under.
  check('and it took less than the serial sum', elapsed < 1800, `${elapsed}ms for ${anthropicReqs.length} calls`);

  console.log(`\n=== ${pass} passed, ${fail} failed`);
  console.log('=== CONSOLE ERRORS:', errs.length);
  errs.forEach((e) => console.log('   ' + e.slice(0, 180)));
  await browser.close();
  process.exit(fail || errs.length ? 1 : 0);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
