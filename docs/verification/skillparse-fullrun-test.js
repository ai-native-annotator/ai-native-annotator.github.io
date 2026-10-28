/**
 * index.html (SkillParse), the whole chain: import, annotate the whole document one step at a
 * time (every sentence side by side, each step confirmed), export the .umr file.
 *
 *   1. Import a .umr file that already has an annotation: the import dialog picks "re-annotate"
 *      for a .umr, keeps only its sentences (the Words: lines) and drops the annotation.
 *   2. "All sentences: next step" runs one step of every sentence; a sentence whose step is not
 *      confirmed does not go on. Confirming each step and clicking again, wave after wave
 *      (sentence, reentrancy, document), annotates everything.
 *   3. "Export .umr" writes a file with every sentence's graph, alignment and document-level
 *      annotation, and none of the imported annotation.
 *   4. Plain text imports too, one sentence per line or split into sentences.
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
  await page.waitForFunction(() => document.querySelector('#modal input[value="umr"]')?.checked);
  check('a .umr file is imported as "re-annotate"', true);
  await page.click('#modal button:text-is("导入")');
  await page.waitForFunction(() => document.getElementById('doc').value === 'hawksbill'
    && /就绪/.test(document.getElementById('status').textContent), null, { timeout: 60000 });
  const items = await page.$$eval('#context .items li .lbl', (e) => e.map((x) => x.textContent));
  check('only its sentences are kept', items.length === 3 && items[0] === '玳瑁是海龟科的', items.join(' | '));

  // 2. every sentence runs its next step side by side; each step is confirmed before its sentence goes on
  const settled = () => page.waitForFunction(() => (document.body.dataset.running || '0') === '0', null, { timeout: 120000 });
  const ranOf = (msg) => Number((/运行了 (\d+) 步/.exec(msg) || [])[1]);
  const waves = await page.$$eval('.wave-tab', (e) => e.map((x) => x.textContent.split(' · ')[1]));
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
  check('every item of every wave is done and confirmed', allDone.length === 9 && allDone.every((c) => /\bdone\b/.test(c)), `${total} steps · ${allDone.join(',')}`);
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

  check('no page errors', errs.length === 0, errs.slice(0, 5).join('\n      '));
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
