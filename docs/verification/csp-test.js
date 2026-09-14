/**
 * The page must run under a strict Content-Security-Policy.
 *
 * Chrome reported "CSP blocks the use of eval" and the page would not run,
 * while Safari was fine. This settles what is actually true of our code:
 * served under `script-src 'self'` — no 'unsafe-eval', no 'unsafe-inline' —
 * the app must boot completely and report ZERO violations.
 *
 * If that holds (it does), then an eval violation seen in a real browser was
 * imposed from outside the page: an extension, an enterprise policy, or a
 * wrapper that frames it. Knowing which side the fault is on is the whole
 * point — otherwise you go hunting through code that has no eval in it.
 *
 * The strictest case is the one that matters, and it is why the boot guard is
 * an external file rather than an inline <script>: 'unsafe-inline' is the
 * commonest thing a strict policy withholds, and a diagnostic that is itself
 * blocked reports nothing exactly when it is needed.
 *
 * Run: npm run test:browser -- csp-test.js
 */
const { launchBrowser } = require('./_browser');
const BASE = process.env.BASE || 'http://localhost:8899';
let pass = 0, fail = 0;
const check = (label, ok, extra = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? '✓' : '✖'} ${label}${extra ? '\n      ' + extra : ''}`); };

// 'unsafe-eval' is absent from every one of these on purpose.
const POLICIES = [
  { name: "script-src 'self' (strictest: no eval, no inline)", csp: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://api.anthropic.com https://api.openai.com https://api.github.com" },
  { name: "script-src 'self' 'unsafe-inline'", csp: "script-src 'self' 'unsafe-inline'" },
];

(async () => {
  const browser = await launchBrowser();

  for (const pol of POLICIES) {
    console.log(`\n--- ${pol.name} ---`);
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, locale: 'zh-CN' });
    const violations = [];
    const errs = [];
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Audits.enable');
    cdp.on('Audits.issueAdded', (e) => {
      const d = e.issue.details?.contentSecurityPolicyIssueDetails;
      if (!d) return;
      violations.push(`${d.contentSecurityPolicyViolationType} ${d.violatedDirective} ${d.blockedURL || '(inline/eval)'}`
        + (d.sourceCodeLocation ? ` @ ${(d.sourceCodeLocation.url || '').replace(BASE, '')}:${d.sourceCodeLocation.lineNumber + 1}` : ''));
    });
    page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message.slice(0, 140)));
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });

    await page.route('**/*', async (route) => {
      const res = await route.fetch();
      await route.fulfill({ response: res, headers: { ...res.headers(), 'content-security-policy': pol.csp } });
    });

    await page.goto(BASE + '/index.html', { waitUntil: 'load' });
    await page.waitForTimeout(4000);

    check('boot ran to completion', (await page.evaluate(() => window.__bootStep)) === 'done');
    check('no failure banner', !(await page.$('#boot-error')));
    check('the annotation tree rendered', (await page.$$('.node-row')).length > 0,
      `${(await page.$$('.node-row')).length} rows`);
    check('the boot guard itself ran (it is a file, not inline)',
      await page.evaluate(() => Array.isArray(window.__cspHits)));
    check('ZERO CSP violations', violations.length === 0, violations.join('\n      '));
    check('no console errors', errs.length === 0, errs.join('\n      '));
    await page.close();
  }

  console.log('\n--- and it reports a violation it did not cause ---');
  {
    // A policy that blocks a data: image is enough to make the browser fire a
    // securitypolicyviolation the page did not ask for — the boot guard should
    // record it, which is the machinery that names an extension's eval block.
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, locale: 'zh-CN' });
    await page.route('**/*', async (route) => {
      const res = await route.fetch();
      await route.fulfill({ response: res, headers: { ...res.headers(), 'content-security-policy': "img-src 'none'" } });
    });
    await page.goto(BASE + '/index.html', { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    // Trigger it AFTER load: a violation fired while the document head is
    // still parsing happens before any listener exists, so the earlier
    // version of this check was racing the page rather than testing it.
    await page.evaluate(() => {
      const img = new Image();
      img.src = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
      document.body.append(img);
    });
    await page.waitForTimeout(800);
    const hits = await page.evaluate(() => (window.__cspHits || []).map((h) => `${h.directive} ${h.blocked}`));
    check('the boot guard records CSP violations', hits.length > 0, hits.join(', ') || '(none seen)');
    check('the app still runs regardless', (await page.evaluate(() => window.__bootStep)) === 'done');
    await page.close();
  }

  console.log(`\n=== ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
