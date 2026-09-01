/**
 * The page must never look alive while being dead.
 *
 * Opened over file://, the browser blocks the ES modules for CORS reasons, so
 * js/app.js never runs — but index.html still paints the whole layout, and
 * every button (the language switch included) silently does nothing. This
 * checks that the boot banner catches that case and says why, and that a
 * properly-served page removes the banner and actually works.
 */
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8899';
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

  console.log('=========== A. file:// (the broken way) ===========');
  const p1 = await b.newPage({ viewport: { width: 1400, height: 900 }, locale: 'zh-CN' });
  await p1.goto('file://' + (process.env.REPO || process.cwd()) + '/index.html');
  await p1.waitForTimeout(1200);
  const banner = await p1.$('#boot-error');
  console.log('  banner visible:', Boolean(banner) && await banner.isVisible());
  const why = (await p1.textContent('#boot-error-why')).trim();
  console.log('  says why (zh):', why.includes('file://') && why.includes('http.server'));
  console.log('  says why (en):', why.includes('Serve the folder instead'));
  console.log('  text:', why.slice(0, 100) + '…');
  await p1.screenshot({ path: (process.env.SHOT_DIR || '/tmp') + '/boot-banner.png' });
  await p1.close();

  console.log('\n=========== B. http:// (the working way) ===========');
  const p2 = await b.newPage({ viewport: { width: 1400, height: 900 }, locale: 'zh-CN' });
  const errs = [];
  p2.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
  await p2.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await p2.waitForTimeout(900);
  console.log('  banner removed after successful boot:', !(await p2.$('#boot-error')));
  const before = await p2.getAttribute('html', 'lang');
  await p2.selectOption('#lang-select', before === 'zh' ? 'en' : 'zh'); await p2.waitForTimeout(400);
  const after = await p2.getAttribute('html', 'lang');
  console.log(`  language picker works: ${before} -> ${after}  (${before !== after})`);
  await p2.selectOption('#lang-select', before); await p2.waitForTimeout(400);
  console.log('  and back again:', (await p2.getAttribute('html', 'lang')) === before);
  console.log('  page errors:', errs.length);
  await b.close();
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
