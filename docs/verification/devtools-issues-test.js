/**
 * The browser's own Issues panel must be empty.
 *
 * Chrome's Issues panel is fed by the CDP `Audits` domain, so subscribing to
 * it here gives exactly the list a user sees — form controls with no id or
 * name, labels bound to nothing, deprecations, CSP violations, mixed content.
 * Auditing by hand does not scale; asking the browser does.
 *
 * This started at 25 issues, all of one kind: controls built in a dozen
 * different panes, each site independently forgetting an id, and <label>s
 * sitting beside their control with nothing connecting them. Both are fixed at
 * the source in core/dom.js (el() assigns ids, labelledRow() binds the label),
 * which is the only way it stays fixed.
 *
 * It walks the panels, because most controls are built lazily and an audit of
 * the landing view alone would miss them.
 *
 * Note on what this does NOT see: issues injected by browser extensions. An
 * extension's own CSP violations and deprecated API calls are attributed to
 * the page in the Issues panel even though the page never made them. A clean
 * profile (as here, and as an incognito window) is how you tell them apart.
 *
 * Run: npm run test:browser -- devtools-issues-test.js
 */
const { launchBrowser } = require('./_browser');
const BASE = process.env.BASE || 'http://localhost:8899';

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, locale: 'zh-CN' });
  const issues = [];
  const errs = [];
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Audits.enable');
  cdp.on('Audits.issueAdded', (e) => issues.push(e.issue));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));

  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  const visit = async (label, fn) => {
    try { await fn(); await page.waitForTimeout(350); }
    catch (e) { console.log(`  (could not open ${label}: ${e.message.slice(0, 60)})`); }
  };
  await visit('settings', () => page.click('#btn-settings'));
  await visit('close settings', () => page.click('.modal-head .btn.ghost'));
  await visit('github', () => page.click('#btn-github'));
  await visit('close github', () => page.click('.modal-head .btn.ghost'));
  await visit('format studio', () => page.click('#btn-studio'));
  await visit('close studio', () => page.click('.overlay .modal-head .btn.ghost'));
  await visit('log drawer', () => page.click('#btn-log'));
  await visit('a resolved node (builds the edit box)', async () => {
    const rows = await page.$$('.node-row:not(.pending-row)');
    await rows[1].click();
  });
  await visit('import menu', () => page.click('[data-menu="menu-import"]'));
  await page.waitForTimeout(800);

  console.log(`\nDevTools issues: ${issues.length}`);
  for (const i of issues) {
    const d = Object.values(i.details || {})[0] || {};
    console.log(`  ✖ ${i.code}  ${d.errorType || d.violatedDirective || d.type || ''}`);
    if (d.violatingNodeId !== undefined) {
      try {
        const { node } = await cdp.send('DOM.describeNode', { backendNodeId: d.violatingNodeId });
        console.log(`      <${node.nodeName.toLowerCase()} ${(node.attributes || []).slice(0, 6).join(' ')}>`.slice(0, 200));
      } catch { /* node gone */ }
    }
  }
  console.log(`console errors: ${errs.length}`);
  errs.forEach((e) => console.log('   ' + e.slice(0, 160)));

  const ok = issues.length === 0 && errs.length === 0;
  console.log(ok ? '\n=== clean' : `\n=== ${issues.length} issue(s), ${errs.length} console error(s)`);
  await browser.close();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
