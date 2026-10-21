/**
 * index.html (SkillParse): SkillParseUMR's decision-orchestration procedures (V12, Chinese and
 * English) run in the browser, step by step.
 *
 * The page boots Pyodide from the CDN, so this test needs the network for that (not for any
 * model: OpenRouter is answered by a stand-in below, Jev's `systemone` endpoint and Haiku's
 * chat completions both). It walks the whole loop once:
 *
 *   1. Python boots and the Chinese procedure opens.
 *   2. Running sentence 1 makes a tree of steps; Jev answers every round, and the questions it is
 *      unsure of (below 0.7) go to Haiku — the cascade.
 *   3. The sentence's graph is drawn (SVG boxes), and clicking a box selects the step that wrote it.
 *   4. A person corrects one step's output: it is kept as the human result and the steps under it
 *      are redone; a jev step that writes a fragment also draws it.
 *   5. The AI pane turns that correction into a skill edit; applying it writes a new version of the
 *      file; re-running the step reports whether the step now produces the correction.
 *   6. A context window can be narrowed to the one sentence.
 *   7. Export writes a .umr file with an alignment block.
 *   8. Choosing the English document switches to the English procedure, which runs too.
 *
 * Run: npm run test:browser -- skillparse-test.js
 */
const fs = require('fs');
const { launchBrowser } = require('./_browser');
const BASE = process.env.BASE || 'http://localhost:8899';

let pass = 0, fail = 0;
const check = (label, ok, extra = '') => {
  (ok ? pass++ : fail++);
  console.log(`  ${ok ? '✓' : '✖'} ${label}${extra ? '\n      ' + extra : ''}`);
};

const calls = { jev: 0, questions: 0, escalate: 0, reflect: 0 };

/** Jev: the first option, sure for most questions and unsure (0.5) for every third one. */
async function systemone(route) {
  const body = JSON.parse(route.request().postData());
  calls.jev++;
  const answers = {};
  Object.entries(body.questions).forEach(([k, q], n) => {
    calls.questions++;
    const p = n % 3 === 2 ? 0.5 : 0.9;
    if (q.type === 'choice') {
      const opts = Object.keys(q.criteria);
      const probabilities = Object.fromEntries(opts.map((o, i) => [o, i === 0 ? p : (1 - p) / Math.max(1, opts.length - 1)]));
      answers[k] = { type: 'choice', choice: opts[0], confidence: p, probabilities };
    } else if (q.type === 'noul') {
      answers[k] = { type: 'noul', noul: n % 3 === 2 ? 0.5 : 0.1 };
    } else {
      answers[k] = { type: 'score', score: 0, probabilities: { 0: 1 } };
    }
  });
  return route.fulfill({ json: { answers, model: body.model, usage: {} } });
}

/** Haiku answering a closed question: the first option, "no", 0 (src/jev.py's prompt format). */
function judge(prompt) {
  const ans = {};
  let cur = null;
  for (const ln of prompt.split('\n')) {
    let m = /^\[([^\]]+)\] (choose one option|yes or no|score)/.exec(ln);
    if (m) { cur = m[1]; ans[cur] = m[2] === 'yes or no' ? 'no' : m[2] === 'score' ? '0' : null; continue; }
    m = /^ {2}- ([^:]+?)(:|$)/.exec(ln);
    if (m && cur && ans[cur] === null) ans[cur] = m[1];
  }
  return ans;
}

async function chat(route) {
  const body = JSON.parse(route.request().postData());
  const sys = body.messages.find((m) => m.role === 'system')?.content || '';
  const user = body.messages.find((m) => m.role === 'user')?.content || '';
  let input;
  if (sys.includes('maintain the skills')) {
    calls.reflect++;
    const m = /## (skillparseumr\/[^\n]*\.py)\n```/.exec(user);
    input = { diagnosis: 'test diagnosis', layer: 'rule', edits: [{ file: m ? m[1] : 'none', op: 'add', find: '', replace: '# edit proposed by the test', why: 'test' }] };
  } else {
    calls.escalate++;
    input = { answers: judge(user) };
  }
  return route.fulfill({ json: { choices: [{ message: { role: 'assistant', content: null,
    tool_calls: [{ id: `c${Math.random()}`, type: 'function', function: { name: 'final_result', arguments: JSON.stringify(input) } }] } }] } });
}

const statusIs = (page, re, timeout = 120000) =>
  page.waitForFunction((src) => new RegExp(src).test(document.getElementById('status').textContent), re.source, { timeout });

(async () => {
  const proxy = process.env.HTTPS_PROXY ? [`--proxy-server=${process.env.HTTPS_PROXY}`, '--proxy-bypass-list=localhost;127.0.0.1'] : [];
  const browser = await launchBrowser({ args: proxy });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true, locale: 'zh-CN' });
  await ctx.route('https://openrouter.ai/api/v1/systemone', systemone);
  await ctx.route('https://openrouter.ai/api/v1/chat/completions', chat);
  await ctx.addInitScript(() => {
    localStorage.setItem('annotator_secrets', JSON.stringify({ apiKeys: { openrouter: 'test-key' } }));
    localStorage.setItem('skillparse_lang', 'zh');
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

  await page.goto(`${BASE}/index.html`);
  await statusIs(page, /就绪/);
  check('Python boots and the Chinese V12 procedure opens', (await page.$$('.skill')).length >= 9
    && (await page.$eval('#skillset', (e) => e.value)) === 'do-zh-v12');
  check("the registry's three waves are shown", (await page.$$('.wave-tab')).length === 3);
  check('for_each items are picked one at a time (no checkboxes)', (await page.$$('#context .items input[type=checkbox]')).length === 0);

  await page.click('button:text-is("运行这一项")');
  await statusIs(page, /完成|出错/);
  const steps = await page.$$eval('.tree li .st', (els) => els.map((e) => e.textContent));
  check('running sentence 1 makes a tree of steps', steps.length >= 5, `${steps.length} steps`);
  check('every step finished', steps.every((s) => s === '✓'), steps.join(''));
  check('Jev answered the rounds', calls.jev > 0, `${calls.jev} requests, ${calls.questions} questions`);
  check('the questions Jev was unsure of went to Haiku', calls.escalate > 0, `${calls.escalate} Haiku calls`);

  await page.waitForSelector('#output .graph-svg .g-node', { timeout: 20000 }).catch(() => {});
  const boxes = await page.$$('#output .graph-svg .g-node');
  check('the sentence graph is drawn', boxes.length >= 2, `${boxes.length} boxes`);
  const pick = await page.$('#output .graph-svg .g-node:not(.hl)') || boxes[0];
  const v = await pick.getAttribute('data-var');
  await pick.click();
  await page.waitForTimeout(800);
  const hl = await page.$$eval('#output .graph-svg .g-node.hl', (e) => e.map((x) => x.getAttribute('data-var')));
  check('clicking a box selects the step that wrote it', hl.includes(v) && !!(await page.$('.tree li[aria-selected="true"]')), `${v} -> ${hl.join(',')}`);

  await page.click('.tree li:has(.sk:text-is("predicate"))');
  await page.click('.tab:text-is("输出")');
  check("a step's graph fragment is drawn with its output", !!(await page.$('#output .graph-svg')));
  await page.click('button:text-is("修改输出")');
  const ta = await page.$('#output textarea');
  await ta.fill((await ta.inputValue()).replace(/"aspect": "[^"]+"/, '"aspect": "state"'));
  await page.click('button:text-is("保存修改（作为人工结果）")');
  await page.waitForSelector('.tree .human-tag');
  check('a correction is kept as the human result', (await page.$$('.tree .human-tag')).length === 1);

  await page.click('button:text-is("找出 skill 的问题")');
  await page.waitForSelector('.proposal');
  check('the AI proposes a skill edit from the correction', calls.reflect === 1 && (await page.textContent('.proposal')).includes('test diagnosis'));
  await page.click('button:text-is("应用选中的修改")');
  await page.waitForSelector('.proposal .ok');
  const stored = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('skillparse_files:do-zh-v12') || '{}')));
  check('applying it saves a new version of the skill file', stored.some((p) => p.endsWith('.py')), stored.join(', '));
  await page.click('button:text-is("重跑这一步验证")');
  await page.waitForFunction(() => /重跑后/.test(document.querySelector('.proposal')?.textContent || ''), null, { timeout: 60000 });
  check('re-running reports against the correction', /重跑后/.test(await page.textContent('.proposal')));

  await page.click('.wave-tab:has-text("document")');
  await page.click('.chip:text-is("只看这一句")');
  await page.waitForFunction(() => document.querySelector('.win')?.textContent.includes('[0, 1)'));
  check('a context window narrows to the one sentence', true);

  await page.click('#btn-export');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button[data-export="umr"]')]);
  const umr = fs.readFileSync(await dl.path(), 'utf8');
  check('export writes a .umr file with alignments', dl.suggestedFilename().endsWith('.umr') && umr.includes('# alignment:') && umr.includes('# :: snt1'));

  await page.selectOption('#doc', 'english_umr-0008');
  await statusIs(page, /就绪/);
  check('the English document opens with the English procedure', (await page.$eval('#skillset', (e) => e.value)) === 'do-en-v12');
  await page.click('button:text-is("运行这一项")');
  await statusIs(page, /完成|出错/);
  const en = await page.$$eval('.tree li .st', (els) => els.map((e) => e.textContent));
  check('the English procedure runs', en.length >= 5 && en.every((s) => s === '✓'), en.join(''));

  check('no page errors', errs.length === 0, errs.slice(0, 5).join('\n      '));
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
