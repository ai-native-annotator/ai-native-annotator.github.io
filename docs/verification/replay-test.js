/**
 * Replay-mode regression test.
 *
 * Background: `doc._trace` is written by io/sources.js and read by
 * core/runner.js. Each side used to build the lookup string itself, and they
 * drifted — one joined with a space, the other with a stray control byte — so
 * *every* replay lookup missed, and the miss was reported as "this document is
 * newly imported / unannotated", which pointed the blame at the data. Both
 * sides now call state.js `traceKey()`.
 *
 * Two things are checked here:
 *   1. A key that exists in the index actually resolves through the real
 *      runSkillCall() (this is what the drift broke).
 *   2. A pending marker that is genuinely absent from the index — the export
 *      gap that fillMissingPending() surfaces — reports *that*, and does not
 *      claim the document is unannotated.
 *
 * Run: NODE_PATH=<playwright> node docs/verification/replay-test.js
 * with the site served at http://localhost:8899.
 */
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8899';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 }, locale: 'zh-CN' });
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
  // replay mode must never touch the network
  await page.route('https://api.anthropic.com/**', (r) => { errs.push('LIVE CALL IN REPLAY MODE'); r.abort(); });

  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  console.log('run mode:', await page.inputValue('#mode-select'));

  console.log('\n--- 1. a recorded step must replay ---');
  const hit = await page.evaluate(async () => {
    const st = await import('./js/core/state.js');
    const runner = await import('./js/core/runner.js');
    const idx = st.state.doc._trace;
    const results = [];
    for (const key of [...idx.keys()].slice(0, 5)) {
      const sep = key.indexOf(String.fromCharCode(31));
      const skillId = key.slice(0, sep);
      const span = key.slice(sep + 1);
      try {
        const r = await runner.runSkillCall({ skillId, span, prompt: '', language: 'en' });
        results.push({ skillId, source: r.source, ok: Boolean(r.output) });
      } catch (e) { results.push({ skillId, error: e.message.slice(0, 60) }); }
    }
    return { size: idx.size, results };
  });
  console.log(`  trace index holds ${hit.size} recorded calls`);
  for (const r of hit.results) console.log(`  ${r.error ? '✖' : '✓'} ${r.skillId}: ${r.error || r.source}`);
  const allReplayed = hit.results.every((r) => r.source === 'replay' && r.ok);
  console.log('  every sampled recorded step replayed:', allReplayed);

  console.log('\n--- 2. a genuine export gap must say so, not blame the document ---');
  const chipCount = (await page.$$('.sentence-chip')).length;
  for (let i = 0; i < chipCount; i++) {
    await (await page.$$('.sentence-chip'))[i].click();
    await page.waitForTimeout(150);
    if (await page.$('.pending-row:not(.blocked)')) break;
  }
  const row = await page.$('.pending-row:not(.blocked)');
  if (row) {
    await row.click();
    await page.waitForTimeout(500);
    await page.click('#btn-log');            // the panel only renders while open
    await page.waitForTimeout(200);
    const log = await page.textContent('#log-panel-body');
    console.log('  says the step was dropped at export time:', log.includes('导出时漏掉了这一步'));
    console.log('  does NOT falsely call the document unannotated:', !log.includes('这份文档是新导入/未标注的'));
  } else {
    console.log('  (no clickable pending row in the bundled demo — skipped)');
  }

  console.log('\n=== PAGE ERRORS:', errs.length);
  errs.forEach((e) => console.log('   ' + e));
  await browser.close();
  process.exit(allReplayed && !errs.length ? 0 : 1);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
