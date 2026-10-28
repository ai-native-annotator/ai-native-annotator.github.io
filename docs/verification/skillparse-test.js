/**
 * index.html (SkillParse): SkillParseUMR's registry run in the browser the way src/runner.py runs
 * it: sent_type is kind: jev (Jev answers its closed questions), every other model skill is kind:
 * agent (its skill.md is the prompt, Haiku answers through the final_result tool, with the skill's
 * tools), and the rules are rules.
 *
 * The page boots Pyodide from the CDN, so this test needs the network for that (not for any
 * model: OpenRouter is answered by a stand-in below, Jev's `systemone` endpoint and Haiku's chat
 * completions both). It walks the whole loop once:
 *
 *   1. Python boots and the Chinese procedure opens; the Skills pane says Jev for sent_type and
 *      Haiku for the agent skills.
 *   2. Running sentence 1 makes a tree of steps; only sent_type's rounds go to Jev; the agent
 *      skills get the system prompt and their skill.md (split at "## Input"), call get_example
 *      for real, and answer through final_result.
 *   3. The sentence's graph is drawn, and clicking a box selects the step that wrote it.
 *   4. A person corrects one step's output: it is kept as the human result and the steps under it
 *      are redone.
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

const calls = { jev: 0, questions: 0, haiku: 0, reflect: 0, tools: {}, systems: new Set(), heads: 0, skills: new Set() };

/** Jev: the first option of every choice ("predicate" when it is one), "no" to every yes/no. */
async function systemone(route) {
  const body = JSON.parse(route.request().postData());
  calls.jev++;
  const answers = {};
  for (const [k, q] of Object.entries(body.questions)) {
    calls.questions++;
    if (q.type === 'choice') {
      const opts = Object.keys(q.criteria);
      const pick = opts.includes('predicate') ? 'predicate' : opts[0];
      answers[k] = { type: 'choice', choice: pick, confidence: 0.9, probabilities: Object.fromEntries(opts.map((o) => [o, o === pick ? 0.9 : 0.1 / Math.max(1, opts.length - 1)])) };
    } else if (q.type === 'noul') {
      answers[k] = { type: 'noul', noul: 0.1 };
    } else {
      answers[k] = { type: 'score', score: 0, probabilities: { 0: 1 } };
    }
  }
  return route.fulfill({ json: { answers, model: body.model, usage: {} } });
}

/** An emit that fits the final_result schema; a skill that writes a graph writes one node. */
function emitFor(schema) {
  const out = {};
  for (const [k, p] of Object.entries(schema.properties || {})) {
    out[k] = p.enum ? p.enum[0] : p.type === 'array' ? [] : p.type === 'object' ? {} : p.type === 'string' ? '' : 0;
  }
  if ('graph' in out) {
    out.graph = { nodes: [{ var: 'x', concept: 'test-01', span: [1, 1] }], edges: [], attrs: [] };
    if ('alignment' in out) out.alignment = [1, 1];
  }
  return out;
}

const reply = (route, name, args) => route.fulfill({ json: { choices: [{ message: { role: 'assistant', content: null,
  tool_calls: [{ id: `c${Math.random()}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }] } });

async function chat(route) {
  const body = JSON.parse(route.request().postData());
  const sys = body.messages.find((m) => m.role === 'system')?.content || '';
  const user = body.messages.find((m) => m.role === 'user')?.content || '';
  if (sys.includes('maintain the skills')) {
    calls.reflect++;
    const m = /## (skillparseumr\/[^\n]*\.(?:md|py))\n```/.exec(user);
    return reply(route, 'final_result', { diagnosis: 'test diagnosis', layer: 'instructions',
      edits: [{ file: m ? m[1] : 'none', op: 'add', find: '', replace: '<!-- edit proposed by the test -->', why: 'test' }] });
  }
  calls.haiku++;
  calls.systems.add(sys);
  if (user.startsWith('# Output Format')) calls.heads++;
  const skill = /## Input/.test(user) ? 'agent' : '?';
  calls.skills.add(skill);
  const names = body.tools.map((t) => t.function.name);
  const used = body.messages.some((m) => m.role === 'tool');
  if (!used && names.includes('get_example')) {
    calls.tools.get_example = (calls.tools.get_example || 0) + 1;
    return reply(route, 'get_example', {});
  }
  if (used) {
    const res = body.messages.filter((m) => m.role === 'tool').map((m) => m.content).join('');
    if (res.includes('"example"') && res.length > 200) calls.tools.exampleRead = true;
  }
  return reply(route, 'final_result', emitFor(body.tools.find((t) => t.function.name === 'final_result').function.parameters));
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
  check('Python boots and the Chinese procedure opens', (await page.$$('.skill')).length >= 9
    && (await page.$eval('#skillset', (e) => e.value)) === 'web-zh');
  check("the registry's three waves are shown", (await page.$$('.wave-tab')).length === 3);
  check('for_each items are picked one at a time (no checkboxes)', (await page.$$('#context .items input[type=checkbox]')).length === 0);
  const badges = await page.$$eval('#skills .skill', (els) => Object.fromEntries(els.map((e) => [
    e.querySelector('.name').textContent, e.querySelector('.by-jev, .by-haiku')?.textContent || ''])));
  check('only sent_type is Jev; every other model skill is Haiku (kind: agent)', badges.sent_type === '→ Jev'
    && ['discourse', 'predicate', 'np_phrase', 'special_entity', 'document'].every((k) => badges[k] === '→ Haiku')
    && ['antecedent', 'coverage', 'reentrancy'].every((k) => badges[k] === ''), JSON.stringify(badges));

  await page.click('button:text-is("运行这一项")');
  await statusIs(page, /完成|出错/);
  const steps = await page.$$eval('.tree li', (els) => els.map((e) => [e.querySelector('.sk').textContent, e.querySelector('.st').textContent]));
  check('running sentence 1 makes a tree of steps', steps.length >= 3, steps.map((x) => x[0]).join(' '));
  check('every step finished', steps.every((x) => x[1] === '✓'), steps.map((x) => x[1]).join(''));
  check('sent_type asked Jev', calls.jev > 0, `${calls.jev} requests, ${calls.questions} questions`);
  check('the agent skills went to Haiku with the system prompt and their skill.md', calls.haiku > 0 && calls.heads > 0
    && [...calls.systems].every((x) => x.startsWith('You are an expert annotator of Uniform Meaning Representation')), `${calls.haiku} calls`);
  check('a tool call ran for real (get_example read reference/example.md)', !!calls.tools.exampleRead, JSON.stringify(calls.tools));
  await page.click('.tree li:has(.sk:text-is("predicate"))');
  await page.click('.tab:text-is("工具调用")');
  check("the agent step's tool calls are shown", (await page.textContent('#output')).includes('get_example'));
  await page.click('.tab:text-is("提示词")');
  check("the agent step's prompt is its skill.md", (await page.textContent('#output')).includes('# Output Format'));
  await page.click('.tree li:has(.sk:text-is("sent_type"))');
  await page.click('.tab:text-is("问答")');
  const by = await page.$$eval('#output .qa .badge', (e) => [...new Set(e.map((x) => x.textContent))]);
  check("sent_type's questions were answered by Jev", by.length === 1 && by[0] === 'Jev', by.join(','));
  await page.click('.tab:text-is("图")');
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
  const stored = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('skillparse_files:web-zh') || '{}')));
  check('applying it saves a new version of the skill file', stored.some((p) => p.endsWith('predicate/skill.md')), stored.join(', '));
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
  check('the English document opens with the English procedure', (await page.$eval('#skillset', (e) => e.value)) === 'web-en');
  await page.click('button:text-is("运行这一项")');
  await statusIs(page, /完成|出错/);
  const en = await page.$$eval('.tree li .st', (els) => els.map((e) => e.textContent));
  check('the English procedure runs', en.length >= 3 && en.every((s) => s === '✓'), en.join(''));

  check('no page errors', errs.length === 0, errs.slice(0, 5).join('\n      '));
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
