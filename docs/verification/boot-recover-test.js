/**
 * index.html starts by itself after the site changed under a browser that still holds old scripts.
 *
 * The host lets a browser keep each script for ten minutes, so a reload right after a deploy can
 * run a new module against an old one; a name the old one does not export fails the whole module
 * graph, and the page draws without starting (this reached the public site). boot-check.js then
 * fetches every script again past the browser's copy and reloads.
 *
 * Here the browser's old copy is played by a route: core.js, asked for as a script, is answered
 * without one of its exports until the page has fetched it itself (boot-check.js's
 * fetch(..., {cache: 'reload'}), which goes past the browser's copy), and with the real file after.
 *
 * Run: npm run test:browser -- boot-recover-test.js
 */
const fs = require('fs');
const path = require('path');
const { launchBrowser } = require('./_browser');
const BASE = process.env.BASE || 'http://localhost:8899';

let pass = 0, fail = 0;
const check = (label, ok, extra = '') => {
  (ok ? pass++ : fail++);
  console.log(`  ${ok ? '✓' : '✖'} ${label}${extra ? '\n      ' + extra : ''}`);
};

(async () => {
  const proxy = process.env.HTTPS_PROXY ? [`--proxy-server=${process.env.HTTPS_PROXY}`, '--proxy-bypass-list=localhost;127.0.0.1'] : [];
  const browser = await launchBrowser({ args: proxy });
  const ctx = await browser.newContext({ locale: 'zh-CN' });
  await ctx.addInitScript(() => localStorage.setItem('skillparse_lang', 'zh'));
  const page = await ctx.newPage();
  const real = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'skillparse', 'core.js'), 'utf8');
  const old = real.replace('export async function afterChange', 'async function afterChange');
  const served = { old: 0, refreshed: 0, loads: 0 };
  let held = true;                       // the browser still holds the old core.js
  await ctx.route('**/js/skillparse/core.js', async (route) => {
    const past = route.request().resourceType() === 'fetch';
    if (past) { held = false; served.refreshed++; }
    if (!held) return route.continue();
    served.old++;
    return route.fulfill({ contentType: 'text/javascript', body: old });
  });
  page.on('load', () => { served.loads++; });
  check('the stand-in for the old script really lacks an export the new modules import', old !== real);

  await page.goto(`${BASE}/index.html`);
  await page.waitForFunction(() => /就绪/.test(document.getElementById('status').textContent), null, { timeout: 180000 });
  check('the page was first given the old script, and did not start with it', served.old >= 1);
  check('it fetched the scripts again past the cache and reloaded itself', served.refreshed >= 1 && served.loads >= 2, JSON.stringify(served));
  check('and then started', await page.evaluate(() => document.body.classList.contains('booted')
    && getComputedStyle(document.getElementById('boot-error')).display === 'none'));
  check('a page that starts is not reloaded again', await page.evaluate(() => sessionStorage.getItem('skillparse_boot_retry') === null));

  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
