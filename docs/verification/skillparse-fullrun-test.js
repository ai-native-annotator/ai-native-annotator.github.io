/**
 * index.html (SkillParse), the whole chain: import, annotate the whole document one step at a
 * time (every sentence side by side, each step confirmed), export the .umr file.
 *
 *   1. Import a .umr file that already has an annotation: the import dialog picks "re-annotate"
 *      for a .umr, keeps only its sentences (the Words: lines) and drops the annotation.
 *   2. "All sentences: next step" runs one step of every sentence; a sentence whose step is not
 *      confirmed does not go on. Confirming each step and clicking again, wave after wave
 *      (sentence, then document), annotates everything.
 *   3. "Export .umr" writes a file with every sentence's graph, alignment and document-level
 *      annotation, and none of the imported annotation.
 *   4. Plain text imports too, one sentence per line or split into sentences.
 *   5. A .umr file's annotation can be loaded: its word alignment is converted to characters,
 *      its steps are in the tree (loaded, confirmed), the export keeps its graph, and a loaded
 *      step runs again with its skill. The site's own (character-aligned) export loads as it is.
 *
 * Models are stand-ins (see _skillparse-mocks.js); Pyodide comes from the CDN.
 * Run: npm run test:browser -- skillparse-fullrun-test.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { launchBrowser } = require('./_browser');
const BASE = process.env.BASE || 'http://localhost:8899';

let pass = 0, fail = 0;
const check = (label, ok, extra = '') => {
  (ok ? pass++ : fail++);
  console.log(`  ${ok ? '✓' : '✖'} ${label}${extra ? '\n      ' + extra : ''}`);
};

const RULE = '#'.repeat(80);
// an annotated .umr: its graph and alignment must not reach the result
const ANNOTATED = [
  `${RULE}\n# :: snt1\nIndex: 1 2 3 4\nWords: 玳瑁 是 海龟科 的\n\n# sentence level graph:\n(s1z / ZZGOLDCONCEPT-01\n    :ARG0 (s1q / 玳瑁))\n\n# alignment:\ns1z: 2-2\ns1q: 1-1\n\n# document level annotation:\n(s1s0 / sentence)\n`,
  `${RULE}\n# :: snt2\nIndex: 1 2 3\nWords: 它们 分布 广泛\n\n# sentence level graph:\n(s2z / ZZGOLDCONCEPT-02)\n\n# alignment:\ns2z: 2-2\n\n# document level annotation:\n(s2s0 / sentence)\n`,
  `${RULE}\n# :: snt3\nIndex: 1 2 3\nWords: 主要 吃 海绵\n\n# sentence level graph:\n(s3z / ZZGOLDCONCEPT-03)\n\n# alignment:\ns3z: 2-2\n\n# document level annotation:\n(s3s0 / sentence)\n`,
].join('\n\n');

const statusIs = (page, re, timeout = 180000) =>
  page.waitForFunction((src) => new RegExp(src).test(document.getElementById('status').textContent), re.source, { timeout });

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
  await page.goto(`${BASE}/index.html`);
  await statusIs(page, /就绪/);

  // 1. import an annotated .umr to annotate again
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skillparse-'));
  const umrPath = path.join(dir, 'hawksbill.umr');
  fs.writeFileSync(umrPath, ANNOTATED);
  await page.click('#btn-import');
  await page.setInputFiles('#modal input[type=file]', umrPath);
  await page.waitForFunction(() => document.querySelector('#modal input[value="umr-load"]')?.checked);
  check('a .umr file with graphs is offered as "load its annotation"', true);
  await page.check('#modal input[value="umr"]');
  // choosing "annotate again" first and the file after keeps that choice
  await page.setInputFiles('#modal input[type=file]', umrPath);
  await page.waitForTimeout(300);
  check('"annotate again", chosen before the file, is kept when the file is picked',
    await page.$eval('#modal input[name=import-format]:checked', (e) => e.value) === 'umr');
  await page.click('#modal button:text-is("导入")');
  await page.waitForFunction(() => document.getElementById('doc').value === 'hawksbill'
    && /就绪/.test(document.getElementById('status').textContent), null, { timeout: 60000 });
  const items = await page.$$eval('#context .items li .lbl', (e) => e.map((x) => x.textContent));
  check('only its sentences are kept', items.length === 3 && items[0] === '玳瑁是海龟科的', items.join(' | '));

  // 2. every sentence runs its next step side by side; each step is confirmed before its sentence goes on
  const settled = () => page.waitForFunction(() => (document.body.dataset.running || '0') === '0', null, { timeout: 120000 });
  const ranOf = (msg) => Number((/运行了 (\d+) 步/.exec(msg) || [])[1]);
  // the classic path: sentence and document, step by step (wave 0 is tested below)
  const waves = (await page.$$eval('.wave-tab', (e) => e.map((x) => x.textContent.split(' · ')[1]))).filter((w) => w !== 'generate');
  let total = 0;
  for (const [k, w] of waves.entries()) {
    await page.click(`.wave-tab:has-text("${w}")`);
    await page.waitForTimeout(300);
    for (let round = 0; round < 60; round++) {
      await page.click('#btn-next-all');
      await settled();
      const msg = await page.textContent('#status');
      if (k === 0 && round === 0) {
        const dots = await page.$$eval('#context .items li .dot', (e) => e.map((x) => x.className));
        check('every sentence runs one step, side by side', ranOf(msg) === 3 && dots.every((c) => /\breview\b/.test(c)), `${msg} · ${dots.join(',')}`);
        await page.click('#btn-next-all');
        await settled();
        const again = await page.textContent('#status');
        check('no sentence goes on before its step is confirmed', ranOf(again) === 0 && /3 句等你确认/.test(again), again);
      }
      if (!ranOf(msg) && !/[1-9]\d* 句等你确认/.test(msg)) break;
      total += ranOf(msg) || 0;
      // the person checks each sentence and confirms its step
      const n = await page.$$eval('#context .items li', (e) => e.length);
      for (let i = 0; i < n; i++) {
        await page.click(`#context .items li >> nth=${i}`);
        await page.waitForFunction((x) => document.querySelector('#run-bar strong')?.textContent === `#${x}`, i + 1);
        await settled();
        for (let c = 0; c < 20; c++) {
          // a locator, not a handle: the bar is drawn again after every click
          const btn = page.locator('#run-bar .confirm-only:not([disabled])');
          if (!(await btn.count())) break;
          await btn.first().click();
          await settled();
        }
      }
    }
  }
  const allDone = [];
  for (const w of waves) {
    await page.click(`.wave-tab:has-text("${w}")`);
    await page.waitForTimeout(300);
    allDone.push(...(await page.$$eval('#context .items li .dot', (e) => e.map((x) => `${x.className}`))));
  }
  check('every item of every wave is done and confirmed', allDone.length === 6 && allDone.every((c) => /\bdone\b/.test(c)), `${total} steps · ${allDone.join(',')}`);
  check('sent_type went to Jev and the agent skills to Haiku', calls.jev > 0 && calls.haiku > 0, `${calls.jev} Jev, ${calls.haiku} Haiku`);

  // 3. export
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-export-umr')]);
  const umr = fs.readFileSync(await dl.path(), 'utf8');
  const blocks = umr.split(RULE).filter((b) => /# :: snt\d/.test(b));
  check('the export is a .umr file with every sentence', dl.suggestedFilename() === 'hawksbill.web-zh.umr' && blocks.length === 3, dl.suggestedFilename());
  const graphs = blocks.map((b) => (b.split('# sentence level graph:')[1] || '').split('# alignment:')[0].trim());
  check('every sentence has a graph', graphs.every((g) => g.startsWith('(s') && !g.includes('/ empty')), graphs.map((g) => g.split('\n')[0]).join(' | '));
  check('every sentence has alignment lines and a document-level annotation', blocks.every((b) => /# alignment:\n\S+: \d+-\d+/.test(b) && /# document level annotation:\n\(s\d+s0 \/ sentence/.test(b)));
  check('the imported annotation is not in it', !umr.includes('ZZGOLDCONCEPT'));
  check('its words are numbered one per character', /Words: 玳 瑁 是 海 龟 科 的/.test(umr.replace(/ +/g, ' ')));

  // training data: one line per confirmed step, its context, input and output, no skill text
  await page.click('#btn-export');
  const [tdl] = await Promise.all([page.waitForEvent('download'), page.click('#menu-export [data-export="train"]')]);
  const train = fs.readFileSync(await tdl.path(), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const tSkills = new Set(train.map((r) => r.skill));
  check('training data: one JSON line per confirmed step of both waves', tdl.suggestedFilename() === 'hawksbill.web-zh.train.jsonl'
    && train.length === total && tSkills.has('sent_type') && ['modal', 'temporal', 'coref'].every((k) => tSkills.has(k))
    && new Set(train.map((r) => r.wave)).size === 2, `${train.length} lines for ${total} steps · ${[...tSkills].join(' ')}`);
  check('each line has the step\'s context, input and output, and no skill.md or prompt',
    train.every((r) => r.context && r.input && r.output && r.confirmed && !('prompt' in r) && !JSON.stringify(r).includes('# Output Format'))
    && train.filter((r) => r.wave === 'sentence').every((r) => r.context.sent && r.context.token_sent)
    && train.filter((r) => r.wave === 'document').every((r) => Array.isArray(r.input.sentences) && r.input.sentences.every((t) => Array.isArray(t.nodes))),
    Object.keys(train[0]).join(','));
  const docInputs = calls.inputs.filter((u) => u.includes('### Sentence'));
  check('the document step reads each sentence\'s text and a table of its nodes, not its trees', docInputs.length > 0
    && docInputs.every((u) => u.includes('| node | text | concept | kind | step |') && u.includes('(current sentence)')
      && !u.includes('tokenized_text') && !u.includes('"graph"')), docInputs[0]?.slice(-300));

  // 4. plain text
  for (const [fmt, text, n] of [['txt-lines', '第一句话。\n第二句话。', 2], ['txt-split', '第一句话。第二句话！第三句？', 3]]) {
    await page.click('#btn-import');
    await page.fill('#modal textarea', text);
    await page.check(`#modal input[value="${fmt}"]`);
    await page.fill('#modal input[type=text]', `t-${fmt}`);
    await page.click('#modal button:text-is("导入")');
    await page.waitForFunction((id) => document.getElementById('doc').value === id
      && /就绪/.test(document.getElementById('status').textContent), `t-${fmt}`, { timeout: 60000 });
    const got = await page.$$eval('#context .items li', (e) => e.length);
    check(`text imports as ${fmt}`, got === n, `${got} sentences`);
  }

  // 5. load an annotated .umr: word alignment converted to characters, every step can run again
  await page.click('#btn-import');
  await page.setInputFiles('#modal input[type=file]', umrPath);
  await page.waitForFunction(() => document.querySelector('#modal input[value="umr-load"]')?.checked);
  await page.fill('#modal input[type=text]', 'hawksbill-gold');
  await page.click('#modal button:text-is("导入")');
  await statusIs(page, /载入了已有标注/);
  const report = await page.textContent('#status');
  check('a loaded file aligned by words is converted to characters', /3 句.*按词对齐，已转换成按字对齐/.test(report) && !/没能放进来/.test(report), report);
  const loadedTree = await page.$$eval('.tree li', (els) => els.map((e) => [e.querySelector('.sk').textContent, e.querySelector('.st').textContent, !!e.querySelector('.loaded')]));
  check('its steps are in the tree, loaded and confirmed', loadedTree.length >= 2 && loadedTree.every(([, st, l]) => st === '✓' && l),
    loadedTree.map((x) => x.join(':')).join(' '));
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('#btn-export-umr')]);
  const back = fs.readFileSync(await dl2.path(), 'utf8');
  const first = back.split(RULE).find((b) => /# :: snt1\b/.test(b)) || '';
  const al = Object.fromEntries([...first.matchAll(/^(\S+): (\d+-\d+)$/gm)].map((m) => [m[1], m[2]]));
  const vars = Object.fromEntries([...first.matchAll(/\((\S+) \/ ([^\s()]+)/g)].map((m) => [m[2], m[1]]));
  check('the export has its graph, aligned by characters (玳瑁 1-2, 是 3)', al[vars['ZZGOLDCONCEPT-01']] === '3-3' && al[vars['玳瑁']] === '1-2',
    JSON.stringify({ vars, al }));
  const before = calls.haiku;
  await page.click('.tree li:has(.sk:text-is("predicate")) >> nth=0');
  await page.click('.tab:text-is("输出")');
  await page.click('#output .review-card button:text-is("↻ 重跑这一步")');
  await page.waitForFunction(() => (document.body.dataset.running || '0') === '0');
  const rerun = await page.$eval('.tree li[aria-selected="true"]', (e) => [e.querySelector('.st').textContent, !!e.querySelector('.loaded')]);
  check('a loaded step runs again with its skill, and then waits to be confirmed', calls.haiku > before && rerun[0] === '◆' && !rerun[1],
    `${calls.haiku - before} Haiku calls, ${rerun}`);
  // the site's own export aligns characters: loaded as it is
  const charPath = path.join(dir, 'hawksbill-char.umr');
  fs.writeFileSync(charPath, back);
  await page.click('#btn-import');
  await page.setInputFiles('#modal input[type=file]', charPath);
  await page.waitForFunction(() => document.querySelector('#modal input[value="umr-load"]')?.checked);
  await page.click('#modal button:text-is("导入")');
  await page.waitForFunction(() => document.getElementById('doc').value === 'hawksbill-char'
    && /载入了已有标注/.test(document.getElementById('status').textContent), null, { timeout: 60000 });
  check('a file aligned by characters is loaded as it is', /按字对齐，照原样载入/.test(await page.textContent('#status')), await page.textContent('#status'));

  // wave 0: a whole sentence generated at once (umr_generate), checked and loaded by a rule (convert)
  await page.click('#btn-import');
  await page.fill('#modal textarea', '玳瑁是海龟。\n它们吃海绵。');
  await page.fill('#modal input[type=text]', 'w0');
  await page.check('#modal input[value="txt-lines"]');
  await page.click('#modal button:text-is("导入")');
  await page.waitForFunction(() => document.getElementById('doc').value === 'w0'
    && /就绪/.test(document.getElementById('status').textContent), null, { timeout: 60000 });
  await page.click('.wave-tab:has-text("generate")');
  await page.waitForTimeout(300);
  check("wave 0's model is GPT-6.1 Sol by default", /GPT-6\.1 Sol/.test(await page.$eval('#model-pick', (e) => e.selectedOptions[0].textContent)));
  const runItem = async (i) => {
    await page.click(`#context .items li >> nth=${i}`);
    await page.waitForFunction((x) => document.querySelector('#run-bar strong')?.textContent === `#${x}`, i + 1);
    await settled();
    const start = page.locator('#run-bar .run-first, #run-bar .run-next:not([disabled])');
    if (await start.count()) { await start.first().click(); await settled(); }
    for (let c = 0; c < 10; c++) {
      const b = page.locator('#run-bar .confirm-next:not([disabled])');
      if (!(await b.count())) break;
      await b.first().click();
      await settled();
    }
  };
  const genBefore = calls.generated.length;
  await runItem(0);
  await runItem(1);
  const gen = calls.generated.slice(genBefore);
  check('each sentence is generated once, in order, the second seeing the first', gen.length === 2 && !gen[0].before && gen[1].before
    && calls.bodies.some((b) => b.model === 'openai/gpt-6.1-sol'), JSON.stringify(gen));
  await page.click('.wave-tab:has-text("sentence")');
  await page.waitForTimeout(300);
  await page.click('#context .items li >> nth=0');
  await settled();
  const genTags = await page.$$eval('.tree li .human-tag.generated', (e) => e.length);
  check('convert loads the sentence wave: every step generated (and confirmed)', genTags >= 2, `${genTags} generated steps`);
  await page.click('.tree li:has(.sk:text-is("predicate")) >> nth=0');
  await page.click('.tab:text-is("工具调用")');
  const toolsText = await page.textContent('#output');
  check("a generated step's PropBank call is made for it, to look at", /propbank_lookup/.test(toolsText) && toolsText.includes('转换时模拟的调用'), toolsText.slice(0, 120));
  await page.selectOption('#output .tool-form select', 'search_guidelines');
  await page.fill('#output .tool-form textarea', '{"keywords": ["aspect"]}');
  await page.click('#output .tool-call');
  await page.waitForFunction(() => document.querySelector('#output')?.textContent.includes('人工调用'), null, { timeout: 30000 });
  check('a person can call a tool with arguments of their own', (await page.textContent('#output')).includes('search_guidelines'));
  await page.click('.tab:text-is("UMR 文本")');
  await page.waitForSelector('#output .umr-var', { timeout: 30000 });
  const umrVars = await page.$$eval('#output .umr-var', (e) => e.map((x) => x.textContent));
  await page.click('#output .umr-var >> nth=0');
  await page.waitForTimeout(800);
  check("the UMR text's variables are links to the steps that made them, and the UMR text stays", umrVars.includes('s1x')
    && (await page.$eval('.tab[aria-selected="true"]', (e) => e.textContent)) === 'UMR 文本' && !!(await page.$('.tree li[aria-selected="true"]'))
    && !!(await page.$('#output .umr-var.on')), umrVars.join(' '));
  // a local change, asked for in the AI panel by the UMR text's variables: the step that made the
  // first one changes its output by the hint, and waits to be confirmed again
  await page.fill('#ai .local-area', 's1x 的 aspect 应该是 activity');
  const nInW0 = calls.inputs.length;
  await page.click('#ai .local-go');
  await settled();
  await page.click('.tab:text-is("输出")');
  check('a local change by UMR variables goes to the step that made them, with its output, the hint and the variables',
    calls.inputs.slice(nInW0).some((u) => u.includes('## The current output') && u.includes("## The sentence's UMR variables")
      && /\| s1x \|/.test(u) && u.includes('human提示：s1x 的 aspect 应该是 activity'))
    && !!(await page.$('#output .confirm-card')) && (await page.textContent('#ai')).includes('改的是'), String(calls.inputs.length - nInW0));
  await page.click('#output .review-card button:text-is("✓ 正确，确认")');
  await settled();
  await page.click('#btn-export');
  const [w0dl] = await Promise.all([page.waitForEvent('download'), page.click('button[data-export="umr-raw"]')]);
  const w0umr = fs.readFileSync(await w0dl.path(), 'utf8');
  check("the export has wave 0's document-level relations, across sentences, by the variables wave 0 gave (kept after a change)",
    /:coref \(\(s1x :same-event s2x\)\)/.test(w0umr) && /document-creation-time :before/.test(w0umr),
    w0umr.split('# document level annotation:')[2]?.slice(0, 200));

  // the whole document at once
  await page.click('#btn-import');
  await page.fill('#modal textarea', '第一句。\n第二句。\n第三句。');
  await page.fill('#modal input[type=text]', 'w1');
  await page.check('#modal input[value="txt-lines"]');
  await page.click('#modal button:text-is("导入")');
  await page.waitForFunction(() => document.getElementById('doc').value === 'w1'
    && /就绪/.test(document.getElementById('status').textContent), null, { timeout: 60000 });
  await page.click('.wave-tab:has-text("generate")');
  await page.waitForTimeout(300);
  const genAllBefore = calls.generated.length;
  await page.click('#run-bar .gen-all');
  await settled();
  const allDots = await page.$$eval('#context .items li .dot', (e) => e.map((x) => x.className));
  check('"generate all" generates and converts every sentence in turn, each step confirmed',
    calls.generated.length - genAllBefore === 3 && allDots.every((c) => /\bdone\b/.test(c)) && /生成了 3 句/.test(await page.textContent('#status')),
    `${calls.generated.length - genAllBefore} · ${allDots.join(',')} · ${await page.textContent('#status')}`);

  // the imported documents are kept in this browser too
  await page.reload();
  await page.waitForFunction(() => !!document.querySelector('#modal .restore-yes')
    || (document.querySelectorAll('#doc option').length > 0 && /就绪|恢复|暂存|载入了/.test(document.getElementById('status').textContent)),
  null, { timeout: 180000 });
  // the last document (w1) has work kept: go on with it
  if (await page.$('#modal .restore-yes')) await page.click('#modal .restore-yes');
  await page.waitForFunction(() => document.querySelectorAll('#doc option').length > 0, null, { timeout: 60000 });
  const docsAfter = await page.$$eval('#doc option', (e) => e.map((x) => x.value));
  check('imported documents are still there after a reload', ['hawksbill', 'hawksbill-gold', 'hawksbill-char', 't-txt-lines', 't-txt-split', 'w0', 'w1']
    .every((d) => docsAfter.includes(d)), docsAfter.join(', '));

  check('no page errors', errs.length === 0, errs.slice(0, 5).join('\n      '));
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
