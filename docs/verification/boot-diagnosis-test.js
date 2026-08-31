/**
 * When boot fails, the page must say WHERE.
 *
 * "js/app.js did not finish boot()" is barely better than silence: it reports
 * that something broke without saying what, and boot can stop for reasons that
 * never reach a catch — a fetch that hangs instead of failing leaves the page
 * half-built with no error anywhere. Each phase of boot() now records its name
 * on window.__bootStep, and the banner reports the last one reached.
 *
 * Four cases, each of which produced the same useless message before:
 *   1. a healthy boot — banner gone, nothing reported
 *   2. the module never loads at all
 *   3. a data file 404s
 *   4. a data file hangs (the case with no error to catch)
 *
 * Run: NODE_PATH=<playwright> node docs/verification/boot-diagnosis-test.js
 */
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8899';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let pass = 0, fail = 0;
const check = (label, ok, extra = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? '✓' : '✖'} ${label}${extra ? '\n      ' + extra : ''}`); };
const banner = async (page) => {
  const box = await page.$('#boot-error');
  if (!box) return null;
  return {
    why: (await page.textContent('#boot-error-why')).replace(/\s+/g, ' ').trim(),
    step: (await page.textContent('#boot-step')).trim(),
  };
};

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

  console.log('\n--- 1. healthy boot: no banner, nothing to report ---');
  {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, locale: 'zh-CN' });
    await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
    await page.waitForTimeout(5000);          // past the 4s fallback
    check('banner removed', !(await banner(page)));
    check('step reached "done"', (await page.evaluate(() => window.__bootStep)) === 'done');
    await page.close();
  }

  console.log('\n--- 2. js/app.js never loads ---');
  {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, locale: 'zh-CN' });
    await page.route(BASE + '/js/app.js', (r) => r.abort());
    await page.goto(BASE + '/index.html', { waitUntil: 'load' });
    await page.waitForTimeout(5000);
    const b = await banner(page);
    check('banner shown', Boolean(b));
    // Two paths can report this, and the more specific one wins: the script
    // error listener names the exact file, so it fires before the 4s fallback
    // ever gets to say the vaguer "never started".
    check('names the file that failed to load', Boolean(b)
      && (b.why.includes('js/app.js') || b.why.includes('一步都没跑起来') || b.why.includes('never started')),
      b?.why.slice(0, 120));
    check('step shows nothing was reached', Boolean(b) && b.step.includes('has not run yet'), b?.step);
    await page.close();
  }

  console.log('\n--- 3. a data file 404s ---');
  {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, locale: 'zh-CN' });
    await page.route('**/data/demo/*.json', (r) => r.fulfill({ status: 404, body: 'nope' }));
    await page.goto(BASE + '/index.html', { waitUntil: 'load' });
    await page.waitForTimeout(5500);
    const b = await banner(page);
    // boot survives a missing corpus (it is caught), so the banner should be gone
    check('boot still completes without a corpus', !b, b ? `${b.why} @ ${b.step}` : '');
    const log = await page.textContent('#log-panel-body').catch(() => '');
    void log;
    await page.click('#btn-log'); await page.waitForTimeout(300);
    check('but the failure is in the log', (await page.textContent('#log-panel-body')).includes('index.json'));
    await page.close();
  }

  console.log('\n--- 4. a data file HANGS (no error to catch) ---');
  {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, locale: 'zh-CN' });
    await page.route('**/data/demo/index.json', () => { /* never fulfilled */ });
    await page.goto(BASE + '/index.html', { waitUntil: 'load' });
    await page.waitForTimeout(6000);
    const b = await banner(page);
    check('banner shown while it hangs', Boolean(b));
    check('names the fetch step it is stuck on', Boolean(b) && b.step.includes('listDemos'), b?.step);
    check('tells the user to check their local server',
      Boolean(b) && (b.why.includes('本地服务器') || b.why.includes('local server')), b?.why.slice(0, 140));

    // and the fetch deadline eventually turns the hang into a real error
    await page.waitForTimeout(12000);
    await page.click('#btn-log').catch(() => {});
    await page.waitForTimeout(300);
    const log = await page.textContent('#log-panel-body').catch(() => '');
    check('the stalled request is reported as a timeout, not left hanging',
      log.includes('超时') || log.includes('timed out'), log.replace(/\s+/g, ' ').slice(0, 140));
    await page.close();
  }

  console.log(`\n=== ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
