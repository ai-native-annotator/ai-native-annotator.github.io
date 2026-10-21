/**
 * skillparse.html: SkillParseUMR's skills run in the browser, step by step.
 *
 * The page boots Pyodide from the CDN, so this test needs the network for that
 * (not for any model: Anthropic is answered by a stand-in below). It walks the
 * whole loop once:
 *
 *   1. Python boots and the Jev skills open on a Chinese document.
 *   2. Running sentence 1 makes a tree of steps; every Jev round is answered
 *      (here by the "LLM answers Jev" path, which is the default backend).
 *   3. A person corrects one step's output: it is kept as the human result and
 *      the steps under it are redone.
 *   4. The AI pane turns that correction into a skill edit; applying it writes
 *      a new version of the file; re-running the step reports whether the step
 *      now produces the correction.
 *   5. A context window can be narrowed to the one sentence.
 *   6. Export writes a .umr file with an alignment block.
 *   7. The Haiku harness runs its chain (generate, critique, finalize, rules)
 *      and alignments the model left at 0-0 are filled in from the words.
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

/** A stand-in for Jev-by-LLM: the first option of every choice, "no" to every yes/no. */
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

const calls = { judge: 0, reflect: 0, annotate: 0, tools: 0 };
async function anthropic(route) {
  const body = JSON.parse(route.request().postData());
  const sys = typeof body.system === 'string' ? body.system : (body.system || []).map((x) => x.text).join('');
  const first = body.messages[0].content.map((c) => c.text).join('\n');
  const fin = body.tools.find((x) => x.name === 'final_result');
  const tools = body.tools.filter((x) => x.name !== 'final_result');
  const reply = (input, name = 'final_result') => route.fulfill({ json: { content: [{ type: 'tool_use', id: `tu${Math.random()}`, name, input }], stop_reason: 'tool_use' } });
  if (tools.length && body.messages.length === 1) { calls.tools++; return reply({ lemma: 'taste' }, tools[0].name); }
  if (sys.includes('careful judge')) { calls.judge++; return reply({ answers: judge(first) }); }
  if (sys.includes('maintain the skills')) {
    calls.reflect++;
    const m = /## (skillparseumr\/[^\n]*\.py)\n```/.exec(first);
    return reply({ diagnosis: 'test diagnosis', layer: 'rule', edits: [{ file: m ? m[1] : 'none', op: 'add', find: '', replace: '# edit proposed by the test', why: 'test' }] });
  }
  calls.annotate++;
  if (fin.input_schema.properties.findings) return reply({ findings: [{ problem: 'p', fix: 'f' }] });
  const i = (/Return the complete annotation of sentence (\d+)/.exec(first) || [0, 1])[1];
  return reply({ annotation: `# sentence level graph:\n(s${i}t / taste-01 :ARG0 (s${i}p / person) :ARG1 (s${i}f / freedom))\n\n# alignment:\ns${i}t: 0-0\n\n# document level annotation:\n(s${i}s0 / sentence)` });
}

const statusIs = (page, re, timeout = 120000) =>
  page.waitForFunction((src) => new RegExp(src).test(document.getElementById('status').textContent), re.source, { timeout });

(async () => {
  const proxy = process.env.HTTPS_PROXY ? [`--proxy-server=${process.env.HTTPS_PROXY}`, '--proxy-bypass-list=localhost;127.0.0.1'] : [];
  const browser = await launchBrowser({ args: proxy });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true, locale: 'zh-CN' });
  await ctx.route('https://api.anthropic.com/**', anthropic);
  await ctx.addInitScript(() => {
    localStorage.setItem('annotator_secrets', JSON.stringify({ apiKeys: { anthropic: 'test-key' } }));
    localStorage.setItem('skillparse_lang', 'zh');
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

  await page.goto(`${BASE}/skillparse.html`);
  await statusIs(page, /就绪/);
  check('Python boots and the Jev skills open', (await page.$$('.skill')).length >= 9);
  check('the registry\'s three waves are shown', (await page.$$('.wave-tab')).length === 3);

  await page.click('button:text-is("运行这一项")');
  await statusIs(page, /完成|出错/);
  const steps = await page.$$eval('.tree li .st', (els) => els.map((e) => e.textContent));
  check('running sentence 1 makes a tree of steps', steps.length >= 5, `${steps.length} steps`);
  check('every step finished', steps.every((s) => s === '✓'), steps.join(''));
  check('Jev rounds were answered', calls.judge > 0, `${calls.judge} calls`);

  await page.click('.tree li:has(.sk:text-is("predicate"))');
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
  const stored = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('skillparse_files:jev-k4') || '{}')));
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

  await page.selectOption('#skillset', 'haiku-h10-en');
  await statusIs(page, /就绪/);
  await page.click('button:text-is("运行这一项")');
  await statusIs(page, /完成|出错/, 60000);
  const chain = await page.$$eval('.tree li .sk', (els) => els.map((e) => e.textContent));
  check('the Haiku harness runs its chain', chain[0] === 'generate' && chain.includes('finalize') && chain.length >= 5, chain.join(' → '));
  check('the generate step used its lookup tool', calls.tools > 0);
  await page.click('.tab:text-is("整句图")');
  await page.waitForSelector('#output .align-added');
  check('alignments left at 0-0 are filled in from the words', (await page.$$('#output .align-added')).length >= 1);

  check('no page errors', errs.length === 0, errs.slice(0, 5).join('\n      '));
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
