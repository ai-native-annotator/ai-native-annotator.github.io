/**
 * One missing element must cost exactly one button — and must say so.
 *
 * The toolbar used to be wired as a run of bare `$('#id').onclick = …`. A
 * single element that was not in the DOM threw on its line and every wiring
 * AFTER it silently never happened. `#lang-select` sits near the end, so the
 * symptom was "the English button does nothing" while the rest of the toolbar
 * looked fine and the console was empty. That is the bug this pins.
 *
 * Simulated the way it actually happens in the wild: a browser holding a
 * cached index.html that predates a button the current js/app.js expects.
 *
 * Run: npm run test:browser -- wiring-test.js
 */
const { launchBrowser } = require('./_browser');
const BASE = process.env.BASE || 'http://localhost:8899';
let pass = 0, fail = 0;
const check = (label, ok, extra = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? '✓' : '✖'} ${label}${extra ? '  ' + extra : ''}`); };

(async () => {
  const browser = await launchBrowser();

  for (const missing of ['btn-drive-demo-wiki', 'btn-export', 'format-select']) {
    console.log(`\n--- index.html missing #${missing} (stale-cache simulation) ---`);
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, locale: 'zh-CN' });
    const errs = [];
    page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));

    await page.route(BASE + '/index.html', async (route) => {
      const res = await route.fetch();
      let html = await res.text();
      html = html.replace(new RegExp(`<(button|select)[^>]*id="${missing}"[\\s\\S]*?</\\1>`), '');
      await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
    });

    await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    check('the element really is gone', !(await page.$(`#${missing}`)));

    const before = await page.getAttribute('html', 'lang');
    await page.selectOption('#lang-select', before === 'zh' ? 'en' : 'zh');
    await page.waitForTimeout(400);
    const after = await page.getAttribute('html', 'lang');
    check('language picker still works', before !== after, `${before} -> ${after}`);

    await page.click('#btn-log'); await page.waitForTimeout(300);
    const log = await page.textContent('#log-panel-body');
    check('log names the missing element', log.includes(missing), '');
    check('log tells the user to hard-refresh', log.includes('强制刷新') || log.includes('hard-refresh'));
    check('no uncaught page errors', errs.length === 0, errs[0] ? errs[0].slice(0, 80) : '');
    await page.close();
  }

  console.log('\n--- intact page: nothing should be reported missing ---');
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, locale: 'zh-CN' });
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.click('#btn-log'); await page.waitForTimeout(300);
  const log = await page.textContent('#log-panel-body');
  check('no missing-element warnings', !log.includes('界面元素缺失') && !log.includes('Missing element'));
  check('boot banner is gone', !(await page.$('#boot-error')));
  check('no page errors', errs.length === 0);
  await page.close();

  console.log(`\n=== ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
