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
 *   2. Sentence 1 runs one step at a time: a finished step waits to be confirmed, and nothing
 *      (not even "all sentences: next step") runs the sentence on until it is. Confirming step by
 *      step makes a tree of steps; only sent_type's rounds go to Jev; the agent skills get the
 *      system prompt and their skill.md (split at "## Input"), call get_example for real, and
 *      answer through final_result. A step's output is shown as Penman.
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

const { calls, anth, systemone, chat, anthropic } = require('./_skillparse-mocks.js')();

const statusIs = (page, re, timeout = 120000) =>
  page.waitForFunction((src) => new RegExp(src).test(document.getElementById('status').textContent), re.source, { timeout });
const settled = (page) => page.waitForFunction(() => (document.body.dataset.running || '0') === '0', null, { timeout: 120000 });

/** Run the selected item one step at a time, confirming each step: what a person does. */
async function stepThrough(page, max = 80) {
  // locators, not handles: the bar is drawn again after every click
  const start = page.locator('#run-bar .run-first, #run-bar .run-next:not([disabled])');
  if (await start.count()) {
    await start.first().click();
    await settled(page);
  }
  let n = 1;
  for (; n < max; n++) {
    const b = page.locator('#run-bar .confirm-next:not([disabled])');
    if (!(await b.count())) break;
    await b.first().click();
    await settled(page);
  }
  return n;
}

(async () => {
  const proxy = process.env.HTTPS_PROXY ? [`--proxy-server=${process.env.HTTPS_PROXY}`, '--proxy-bypass-list=localhost;127.0.0.1'] : [];
  const browser = await launchBrowser({ args: proxy });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true, locale: 'zh-CN' });
  await ctx.route('https://openrouter.ai/api/v1/systemone', systemone);
  await ctx.route('https://openrouter.ai/api/v1/chat/completions', chat);
  await ctx.route('https://api.anthropic.com/**', anthropic);
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
  check('Python boots and the Chinese procedure opens', (await page.$$('.skill')).length === 7
    && (await page.$eval('#skillset', (e) => e.value)) === 'web-zh');
  check('two waves (sentence, document): re-entrancy is merged by span when the .umr is written',
    (await page.$$eval('.wave-tab', (e) => e.map((x) => x.textContent.split(' · ')[1]))).join(',') === 'sentence,document');
  check('for_each items are picked one at a time (no checkboxes)', (await page.$$('#context .items input[type=checkbox]')).length === 0);
  const badges = await page.$$eval('#skills .skill', (els) => Object.fromEntries(els.map((e) => [
    e.querySelector('.name').textContent, e.querySelector('.by-jev, .by-haiku')?.textContent || ''])));
  check('only sent_type is Jev; every other model skill is Haiku (kind: agent)', badges.sent_type === '→ Jev'
    && ['discourse', 'predicate', 'np_phrase', 'special_entity', 'document'].every((k) => badges[k] === '→ Haiku')
    && badges.antecedent === '' && !('coverage' in badges) && !('reentrancy' in badges), JSON.stringify(badges));

  // a skill.md opens rendered as Markdown; the edit tab is its source
  await page.click('#skills .skill:has(.name:text-is("predicate")) .file:text-is("skill.md")');
  await page.waitForSelector('#modal .md');
  const md = await page.$eval('#modal .md', (e) => ({ h1: e.querySelector('h1')?.textContent, tables: e.querySelectorAll('table').length,
    slots: [...e.querySelectorAll('.md-slot')].map((x) => x.textContent), raw: /\*\*|^#/m.test(e.innerText) }));
  const areaShown = await page.isVisible('#modal textarea.code');
  await page.click('#modal .tab:text-is("编辑原文")');
  const src = await page.$eval('#modal textarea.code', (e) => (e.offsetParent ? e.value : ''));
  check('a skill.md is shown as rendered Markdown, with its source one tab away', !!md.h1 && md.tables > 0 && md.slots.includes('{sent}')
    && !md.raw && !areaShown && src.startsWith('# Skill'), JSON.stringify(md));
  await page.click('#modal-close');

  check('there is no "run to the end"', !(await page.$('button:text-is("运行到底")')) && !(await page.$('#btn-run-doc')));
  await page.click('#run-bar .run-first');
  await settled(page);
  const one = await page.$$eval('.tree li', (els) => els.map((e) => e.querySelector('.st').textContent));
  check('one step runs, then waits to be confirmed', one[0] === '◆' && one.slice(1).every((x) => x === '○')
    && !(await page.$('#run-bar .run-next')) && !!(await page.$('#output .confirm-card')), one.join(''));
  await page.click('#btn-next-all');
  await settled(page);
  const again = await page.$$eval('.tree li .st', (els) => els.map((e) => e.textContent));
  check('"all sentences: next step" leaves a sentence alone until its step is confirmed', again.join('') === one.join('')
    && /1 句等你确认/.test(await page.textContent('#status')), await page.textContent('#status'));
  const ran = await stepThrough(page) + 1;
  const steps = await page.$$eval('.tree li', (els) => els.map((e) => [e.querySelector('.sk').textContent, e.querySelector('.st').textContent]));
  check('confirming step by step makes a tree of steps', steps.length >= 3 && ran >= steps.length, `${ran} runs: ${steps.map((x) => x[0]).join(' ')}`);
  check('every step finished and was confirmed', steps.every((x) => x[1] === '✓'), steps.map((x) => x[1]).join(''));
  check('sent_type asked Jev', calls.jev > 0, `${calls.jev} requests, ${calls.questions} questions`);
  check('the agent skills went to Haiku with the system prompt and their skill.md', calls.haiku > 0 && calls.heads > 0
    && [...calls.systems].every((x) => x.startsWith('You are an expert annotator of Uniform Meaning Representation')), `${calls.haiku} calls`);
  check('a tool call ran for real (get_example read reference/example.md)', !!calls.tools.exampleRead, JSON.stringify(calls.tools));
  check('propbank_lookup works in the page (吃 → 吃-01 from the merged PropBank file)', !!calls.tools.propbankRead, JSON.stringify(calls.tools));
  await page.click('.tree li:has(.sk:text-is("predicate"))');
  await page.click('.tab:text-is("工具调用")');
  check("the agent step's tool calls are shown", (await page.textContent('#output')).includes('get_example'));
  await page.click('.tab:text-is("提示词")');
  check("the agent step's prompt is its skill.md, rendered", (await page.textContent('#output')).includes('# Output Format')
    && !!(await page.$('#output .md h1')));
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

  // a finished step: correct, re-run with a hint, or edit directly
  await page.click('.tree li:has(.sk:text-is("predicate")) >> nth=0');
  await page.click('.tab:text-is("输出")');
  const answers = await page.$$eval('#output .review-card button', (e) => e.map((x) => x.textContent));
  check('a finished step offers: correct, re-run with a hint, edit directly', answers.includes('💬 加提示重跑') && answers.includes('✎ 直接修改'), answers.join(' | '));
  const nInputs = calls.inputs.length;
  await page.click('#output .hint-btn');
  await page.fill('#output .hint-area', '应该是 and，不是 none');
  await page.click('#output .hint-go');
  await settled(page);
  const sent = calls.inputs.slice(nInputs);
  check('the hint is written after the input and the step runs again', sent.length > 0 && sent.every((u) => /## Input[\s\S]*\n\nhuman提示：应该是 and，不是 none\n?$/.test(u)), JSON.stringify(sent[0]?.slice(-80)));
  await page.click('.tab:text-is("提示词")');
  check('the prompt tab shows the hint', (await page.textContent('#output')).includes('human提示：应该是 and，不是 none'));
  await page.click('.tab:text-is("输出")');
  check('the re-run step waits for confirmation again, with its hint shown', !!(await page.$('#output .confirm-card'))
    && (await page.textContent('#output .hint-now')).includes('应该是 and'));
  await page.click('#output .review-card button:text-is("✓ 正确，确认")');
  await settled(page);
  const nJev = calls.jevStates.length;
  await page.click('.tree li:has(.sk:text-is("sent_type")) >> nth=0');
  await page.click('.tab:text-is("输出")');
  await page.click('#output .hint-btn');
  await page.fill('#output .hint-area', '这是一个从句');
  await page.click('#output .hint-go');
  await settled(page);
  check("sent_type's hint goes into the state Jev sees", calls.jevStates.length > nJev
    && calls.jevStates.slice(nJev).every((st) => st['human提示'] === '这是一个从句'), JSON.stringify(calls.jevStates[nJev]).slice(0, 120));
  await stepThrough(page);

  await page.click('.tree li:has(.sk:text-is("predicate")) >> nth=0');
  await page.click('.tab:text-is("输出")');
  check("a step's output is shown as Penman", /^\(x \/ test-01\n {4}:ARG0 <node: placeholder>\n {4}:modal-strength full-affirmative\)$/.test(await page.textContent('#output pre.penman')),
    await page.textContent('#output pre.penman'));
  check("a step's graph fragment is drawn with its output", !!(await page.$('#output .graph-svg')));
  await page.click('#output .edit-btn');
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
  await stepThrough(page);
  const en = await page.$$eval('.tree li .st', (els) => els.map((e) => e.textContent));
  check('the English procedure runs', en.length >= 3 && en.every((s) => s === '✓'), en.join(''));

  // Settings: Haiku through the Anthropic key instead of OpenRouter
  await page.click('#btn-settings');
  const sel = await page.$('#modal select[aria-label^="Haiku"]');
  await sel.selectOption('anthropic');
  const haikuModel = await page.$eval('#modal select[aria-label^="Haiku"] + input', (e) => e.value);
  check('choosing the Anthropic key switches the model name', haikuModel === 'claude-haiku-5-5', haikuModel);
  await page.fill('#modal input[placeholder="sk-ant-…"]', 'test-anthropic-key');
  await page.click('#modal button:text-is("保存")');
  const before = calls.haiku;
  await page.click('button:text-is("↻ 重新开始")');
  await page.waitForFunction(() => document.querySelectorAll('.tree li').length === 1 && !!document.querySelector('#run-bar .run-next'));
  await stepThrough(page);
  check('Haiku then goes through the Anthropic API, not OpenRouter', anth.calls > 0 && calls.haiku === before
    && [...anth.models].every((m) => m === 'claude-haiku-5-5'), `${anth.calls} Anthropic calls, models ${[...anth.models]}`);
  const done = await page.$$eval('.tree li .st', (els) => els.map((e) => e.textContent));
  check('and the steps finish', done.length >= 3 && done.every((x) => x === '✓'), done.join(''));

  // a model at work is shown at work: the step spins in the tree, its sentence pulses, the output
  // pane says who is answering and for how long, the toolbar status has a spinner
  calls.delay = 2500;
  await page.click('.tree li:has(.sk:text-is("predicate")) >> nth=0');
  await page.click('.tab:text-is("输出")');
  await page.click('#output .review-card button:text-is("↻ 重跑这一步")');
  await page.waitForSelector('.tree li.live .spinner', { timeout: 10000 }).catch(() => {});
  const live = await page.evaluate(() => ({
    tree: !!document.querySelector('.tree li.live .spinner'),
    card: document.querySelector('#output .live-card')?.textContent || '',
    item: !!document.querySelector('#context .items .dot.live'),
    busy: document.body.classList.contains('busy'),
  }));
  check('while a model runs, the step is shown at work (tree, output pane, item, toolbar)',
    live.tree && /正在写这一步/.test(live.card) && /秒/.test(live.card) && live.item && live.busy, JSON.stringify(live));
  calls.delay = 0;
  await settled(page);
  check('and it stops when the answer is in', !(await page.$('.tree li.live')) && !(await page.$('#output .live-card'))
    && !(await page.evaluate(() => document.body.classList.contains('busy'))));
  await stepThrough(page);

  // the work is kept in this browser: after a reload the page offers to go on from it
  await page.waitForFunction(() => /已暂存/.test(document.getElementById('saved').textContent), null, { timeout: 30000 });
  const kept = await page.$$eval('.tree li', (els) => els.map((e) => `${e.querySelector('.sk').textContent}${e.querySelector('.st').textContent}`));
  await page.reload();
  await page.waitForSelector('#modal .restore-yes', { timeout: 180000 });
  check('after a reload the page offers to go on from the kept work', /暂存的进度/.test(await page.textContent('#modal')));
  await page.click('#modal .restore-yes');
  await statusIs(page, /已恢复上次的进度/);
  const back = await page.$$eval('.tree li', (els) => els.map((e) => `${e.querySelector('.sk').textContent}${e.querySelector('.st').textContent}`));
  check('the same document opens with every step as it was', (await page.$eval('#doc', (e) => e.value)) === 'english_umr-0008'
    && back.join(' ') === kept.join(' '), `${kept.join(' ')} -> ${back.join(' ')}`);

  check('no page errors', errs.length === 0, errs.slice(0, 5).join('\n      '));
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
