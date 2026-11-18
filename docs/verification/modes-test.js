/**
 * index.html, the expert and apprentice modes (js/skillparse/modes.js). They are views of the same
 * steps as the manual mode, which the other two scripts cover.
 *
 * Expert:
 *   1. One button generates the whole document, several sentences in one answer (nothing before it);
 *      a document-level relation the model wrote with the earlier sentence is with the later one.
 *   2. A sentence shows its graph, its UMR text and its document-level relations in words
 *      (「玳」 句1 … 「它」), not variables; a relation's label can be changed, a relation deleted, one added.
 *   3. The chat changes this sentence: the proposal is drawn in color, Enter applies it.
 *   4. The chat changes the whole document: every change says its sentence, a click goes there and
 *      shows that sentence's changes; applying changes every sentence.
 *   5. A sentence can be generated again; Enter goes to the next sentence and counts it as checked.
 *   6. No step id is on screen, and the manual mode still has every step.
 * Apprentice:
 *   7. Nothing is generated: one step at a time, each with what it decides and its answer; Enter
 *      confirms and runs the next; a step can be corrected by hand or run again with a hint.
 *   8. When a sentence's steps are done the next sentence is offered, then the document wave.
 *
 * Models are stand-ins (_skillparse-mocks.js); Pyodide comes from the CDN.
 * Run: npm run test:browser -- modes-test.js
 */
const { launchBrowser } = require('./_browser');
const BASE = process.env.BASE || 'http://localhost:8899';

let pass = 0, fail = 0;
const check = (label, ok, extra = '') => {
  (ok ? pass++ : fail++);
  console.log(`  ${ok ? '✓' : '✖'} ${label}${extra ? '\n      ' + extra : ''}`);
};

(async () => {
  const { calls, systemone, chat } = require('./_skillparse-mocks.js')();
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
  const settled = async () => {
    await page.waitForTimeout(150);
    await page.waitForFunction(() => (document.body.dataset.running || '0') === '0', null, { timeout: 180000 });
    await page.waitForTimeout(400);
  };
  const importDoc = async (name, text) => {
    await page.click('#btn-import');
    await page.fill('#modal textarea', text);
    await page.fill('#modal input[type=text]', name);
    await page.check('#modal input[value="txt-lines"]');
    await page.click('#modal button:text-is("导入")');
    await page.waitForFunction((n) => document.getElementById('doc').value === n
      && /就绪/.test(document.getElementById('status').textContent), name, { timeout: 60000 });
  };
  const mode = async (m) => { await page.click(`#mode-switch button[data-mode="${m}"]`); await settled(); };

  await page.goto(`${BASE}/index.html`);
  await page.waitForFunction(() => /就绪/.test(document.getElementById('status').textContent), null, { timeout: 180000 });
  check('the page opens in the manual mode: four panes, no focus view',
    await page.evaluate(() => document.body.dataset.mode === 'manual' && getComputedStyle(document.getElementById('focus')).display === 'none'
      && getComputedStyle(document.getElementById('pane-work')).display !== 'none'));

  // ---- expert
  await importDoc('ex', '玳瑁是海龟。\n它们吃海绵。\n海绵很多。');
  await mode('expert');
  await page.waitForSelector('.fx-start .fx-generate');
  check('expert mode waits with one button: nothing is generated before it is clicked', !calls.generatedDoc && !calls.generated.length);
  await page.click('.fx-start .fx-generate');
  const banner = await page.waitForSelector('.fx-banner .fx-bar', { timeout: 10000 }).then(() => page.textContent('.fx-banner-text')).catch(() => '');
  check('while it is written: which sentences, how many are done, the time so far and about how long is left, with a bar',
    /第 1–3 句/.test(banner) && /已完成 0\/3 句/.test(banner) && /已用 0:0\d/.test(banner) && /大约还要/.test(banner), banner);
  await page.waitForFunction(() => document.querySelectorAll('.fx-sentences li.made').length === 3, null, { timeout: 120000 });
  await settled();
  check('the button generates the whole document, several sentences in one answer',
    JSON.stringify(calls.generatedDoc) === '[[1,2,3]]' && !calls.generated.length, JSON.stringify(calls.generatedDoc));
  check('the panes are gone, the sentence is in the middle and the chat on the right',
    await page.evaluate(() => getComputedStyle(document.getElementById('pane-work')).display === 'none'
      && !!document.querySelector('.fx-main .graph-panel') && !!document.querySelector('.fx-chat textarea')));

  await page.click('.fx-sentences li >> nth=1');
  await page.waitForFunction(() => /第 2 句/.test(document.querySelector('.fx-title')?.textContent || ''));
  await page.waitForSelector('.fx-rel');
  let rels = await page.$$eval('.fx-rel', (els) => els.map((e) => [...e.querySelectorAll('.fx-end')].map((x) => x.textContent).join(' → ')
    + ' :' + (e.querySelector('select.fx-rel-label')?.value || e.querySelector('.fx-rel-label')?.textContent)));
  check('a relation written with the earlier sentence is with the later one, in words, with the other sentence named',
    rels.some((r) => /「玳」句1 → 「它」 :same-event/.test(r)), rels.join(' | '));
  check('no variable stands in for a node in the relations', !rels.some((r) => /s\d+x/.test(r)), rels.join(' | '));

  const coref = page.locator('.fx-rel-group:has(.fx-rel-name:text-is("共指")) .fx-rel').first();
  await coref.locator('select.fx-rel-label').selectOption('subset-of');
  await settled();
  await page.waitForSelector('.fx-rel');
  let umr = await page.textContent('.fx-umr pre');
  const exported = async () => {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.fx-export')]);
    return require('fs').readFileSync(await dl.path(), 'utf8');
  };
  check("a relation's label can be changed, and the file has it", /\(s1x :subset-of s2x\)/.test(await exported()));
  await page.click('.fx-rel-add summary');
  await page.waitForSelector('.fx-rel-form select');
  const form = page.locator('.fx-rel-form select');
  await form.nth(0).selectOption('temporal');
  await form.nth(1).selectOption('s1x');
  await form.nth(2).selectOption('after');
  await form.nth(3).selectOption('s2x');
  await page.click('.fx-rel-form button');
  await settled();
  check('a relation can be added between two nodes picked by their words', /\(s1x :after s2x\)/.test(await exported()));
  await page.waitForSelector('.fx-rel');
  await page.evaluate(() => [...document.querySelectorAll('.fx-rel')].find((e) => e.querySelector('select.fx-rel-label')?.value === 'after').querySelector('.fx-rel-del').click());
  await settled();
  check('and deleted', !/\(s1x :after s2x\)/.test(await exported()));

  // the chat: this sentence
  await page.waitForSelector('.fx-main .graph-panel');
  await page.fill('.fx-say', 's2x 的 aspect 应该是 activity');
  await page.press('.fx-say', 'Enter');
  await page.waitForSelector('.fx-apply', { timeout: 60000 });
  await page.waitForSelector('.fx-main .penman-preview .mk-add, .fx-main .penman-preview .mk-chg', { timeout: 20000 });
  check('the chat proposes changes of this sentence, drawn in color on its text',
    (await page.$$eval('.fx-turn.ai .change-item', (e) => e.length)) === 2 && calls.localChange === 1);
  await page.locator('.fx-title').click();            // away from the chat box
  await page.keyboard.press('Enter');
  await settled();
  await page.waitForSelector('.fx-closed');
  umr = await page.textContent('.fx-umr pre');
  check('Enter applies the proposal', /:aspect activity/.test(umr) && /测试/.test(umr) && /已应用 2\/2/.test(await page.textContent('.fx-closed')), umr);

  // the chat: the whole document
  await page.click('.fx-scope button[data-scope="document"]');
  await page.fill('.fx-say', '全文的 aspect 都改成 activity');
  await page.press('.fx-say', 'Enter');
  await page.waitForSelector('.fx-apply', { timeout: 60000 });
  const tags = await page.$$eval('.fx-turn.ai:last-child .fx-jump', (e) => e.map((x) => x.textContent));
  check('a change of the whole document names the sentence of each change', calls.globalChange === 1 && tags.join() === '句1,句2,句3', tags.join());
  await page.locator('.fx-turn.ai:last-child .fx-jump').nth(2).click();
  await page.waitForFunction(() => /第 3 句/.test(document.querySelector('.fx-title')?.textContent || ''));
  await page.waitForSelector('.fx-main .penman-preview .mk-add, .fx-main .penman-preview .mk-chg', { timeout: 20000 });
  check("a click on a change goes to its sentence and shows that sentence's changes", true);
  await page.click('.fx-apply');
  await settled();
  const file = await exported();
  check('applying changes every sentence', (file.match(/:aspect activity/g) || []).length === 3 && /已应用 3\/3/.test(await page.textContent('.fx-turn.ai:last-child .fx-closed')));

  // again, and on
  const before = (calls.generated || []).length;
  await page.waitForSelector('.fx-regen:not([disabled])');
  await page.click('.fx-regen');
  await settled();
  check('one sentence can be generated again (wave 1 for that sentence)', calls.generated.length === before + 1 && calls.generated[calls.generated.length - 1].n === 3);
  await page.click('.fx-sentences li >> nth=0');
  await page.waitForFunction(() => /第 1 句/.test(document.querySelector('.fx-title')?.textContent || ''));
  await page.waitForSelector('.fx-next:not([disabled])');
  await page.locator('.fx-title').click();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => /第 2 句/.test(document.querySelector('.fx-title')?.textContent || ''));
  check('Enter goes to the next sentence and counts the one left as checked',
    /已看 1 \/ 3/.test(await page.textContent('.fx-progress')) && (await page.$$eval('.fx-sentences li.seen', (e) => e.length)) === 1);
  await page.locator('.fx-tools summary').first().click();
  await page.waitForSelector('.fx-tools-list details, .fx-tools-list .note');
  const closed = await page.$$eval('.fx-tools-list details', (e) => e.length && e.every((x) => !x.open));
  check('the tool calls are listed closed', closed, await page.textContent('.fx-tools'));
  check('no step id is on screen', !/\b0\.\d|0B\b/.test(await page.evaluate(() => document.querySelector('.fx-main').innerText)));
  await mode('manual');
  await page.click('.wave-tab:has-text("sentence")');
  await page.waitForTimeout(400);
  check('the manual mode has every step of what the expert mode made',
    (await page.$$eval('.tree li', (e) => e.length)) >= 2 && await page.evaluate(() => getComputedStyle(document.getElementById('focus')).display === 'none'));

  // ---- apprentice
  await importDoc('ap', '玳瑁是海龟。\n它们吃海绵。');
  await mode('apprentice');
  await page.waitForSelector('.ap-main');
  const jevBefore = calls.jev;
  check('nothing is generated for an apprentice: the sentence waits to be started',
    /开始这一句/.test(await page.textContent('.ap-main')) && calls.generatedDoc.length === 1);
  await page.click('.ap-main');
  await settled();
  await page.waitForSelector('.ap-answer');
  let card = await page.textContent('.ap-card');
  check('the first step is on screen alone: what it decides, and its answer',
    /sent_type/.test(card) && /决定它是哪一类/.test(card) && /predicate/.test(await page.textContent('.ap-answer')) && calls.jev > jevBefore, card.slice(0, 160));
  check('its piece of the sentence is marked', (await page.$$eval('.ap-sentence .tok.on', (e) => e.length)) > 0);
  await page.locator('.ap-top strong').click();
  await page.keyboard.press('Enter');
  await settled();
  await page.waitForFunction(() => /predicate/.test(document.querySelector('.ap-head')?.textContent || ''), null, { timeout: 60000 });
  card = await page.textContent('.ap-card');
  check('Enter confirms it and runs the next step, which shows what it looked up and what it hands on',
    /查 PropBank/.test(card) && /它查了什么/.test(card) && /它交给下一步的/.test(card), card.slice(0, 200));
  check('the graph so far is under the step', !!(await page.$('.ap-graph .graph-panel')));

  await page.click('.ap-open-edit');
  const json = JSON.parse(await page.inputValue('.ap-edit'));
  json.graph.nodes[0].concept = '是-01';
  await page.fill('.ap-edit', JSON.stringify(json));
  await page.click('.ap-save');
  await settled();
  check('a step can be corrected by hand', /是-01/.test(await page.evaluate(() => document.querySelector('.ap-graph')?.innerText || '')));
  // the next step (a sent_type of the placeholder) is run, then run again with a hint
  await page.waitForSelector('.ap-main');
  await page.click('.ap-main');
  await settled();
  await page.waitForSelector('.ap-open-hint');
  const jev2 = calls.jev;
  await page.locator('.ap-top strong').click();
  await page.keyboard.press('Tab');
  await page.fill('.ap-hint', '这是一个名词');
  await page.press('.ap-hint', 'Enter');
  await settled();
  check('Tab opens the hint, and the step runs again with it', calls.jev > jev2 && JSON.stringify(calls.jevStates || []).includes('这是一个名词'));

  // on to the end of the sentence, the next sentence, then the document wave
  for (let k = 0; k < 12; k++) {
    await page.waitForSelector('.ap-main');
    const text = await page.textContent('.ap-main');
    if (/下一句|进入文档级/.test(text)) break;
    await page.click('.ap-main');
    await settled();
  }
  check('when the steps of a sentence are done, the next sentence is offered', /下一句/.test(await page.textContent('.ap-main')), await page.textContent('.ap-card'));
  await page.click('.ap-main');
  await settled();
  for (let k = 0; k < 12; k++) {
    await page.waitForSelector('.ap-main');
    if (/进入文档级/.test(await page.textContent('.ap-main'))) break;
    await page.click('.ap-main');
    await settled();
  }
  check('after the last sentence, the document wave', /进入文档级/.test(await page.textContent('.ap-main')));
  await page.click('.ap-main');
  await settled();
  await page.waitForSelector('.ap-main');
  check('which starts at the first sentence', /① 句子图/.test(await page.textContent('.ap-waves')) && (await page.getAttribute('.ap-waves button >> nth=1', 'aria-pressed')) === 'true'
    && /第 1 句/.test(await page.textContent('.ap-top')));
  await page.click('.ap-main');
  await settled();
  await page.waitForSelector('.ap-answer');
  check('its first step is the modal rule, explained', /modal/.test(await page.textContent('.ap-head')) && /规则/.test(await page.textContent('.ap-card')));

  check('the mode is kept for the next visit', await page.evaluate(() => JSON.parse(localStorage.getItem('skillparse_mode')) === 'apprentice'));
  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
