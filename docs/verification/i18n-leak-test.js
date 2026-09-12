/**
 * English-mode leak scan.
 *
 * The interface switch is only honest if *every* string follows it. This walks
 * the app in English with an English document loaded and asserts that no CJK
 * text is on screen — anywhere in the chrome, the panels, the modals, the
 * activity log, or the assistant pane. Any hit is a hard-coded Chinese string
 * that never went through core/i18n.js.
 *
 * A single CJK character is enough to fail: there is nothing legitimately
 * Chinese in an English session over an English document.
 *
 * Run: npm run test:browser -- i18n-leak-test.js
 * with the site served at http://localhost:8899.
 */
const { launchBrowser } = require('./_browser');
const { promptOf } = require('./_prompt.js');
const BASE = process.env.BASE || 'http://localhost:8899';
const CJK = /[一-鿿　-〿＀-￯]/;
const body = (o) => JSON.stringify({ content: [{ type: 'text', text: typeof o === 'string' ? o : JSON.stringify(o) }] });
const S1 = 'The museum opened a new exhibit last week.';

const leaks = [];
function scan(where, text) {
  for (const line of String(text || '').split('\n')) {
    const s = line.trim();
    if (s && CJK.test(s)) leaks.push(`${where}: ${s.slice(0, 90)}`);
  }
}

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, locale: 'en-US' });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));

  await page.route('https://api.anthropic.com/v1/messages', async (route) => {
    const p = promptOf(route.request().postData());
    if (p.includes('annotation guidelines'))
      return route.fulfill({ status: 200, contentType: 'application/json', body: body('The model kept only the date.\n\n> Always cover the full temporal span.') });
    if (p.includes(`Sentence (English):\n${S1}`)) return route.fulfill({ status: 200, contentType: 'application/json', body: body({ has_discourse: false }) });
    if (p.includes(`Clause to analyse: ${S1}`) && !p.includes('## PropBank'))
      return route.fulfill({ status: 200, contentType: 'application/json', body: body({ predicate_kind: 'verb', lemmas: ['open'], predicate_text: 'opened' }) });
    if (p.includes(`Clause to analyse: ${S1}`))
      return route.fulfill({ status: 200, contentType: 'application/json', body: body({ concept: 'open-01', phrase: S1, note: 'sense -01',
        relations: [[':ARG0', { expand: true, phrase: 'The museum', kind: 'np' }],
          [':ARG1', { expand: true, phrase: 'a new exhibit', kind: 'np' }], [':aspect', 'performance']] }) });
    if (p.includes('Noun phrase to analyse: The museum'))
      return route.fulfill({ status: 200, contentType: 'application/json', body: body({ concept: 'museum', relations: [], phrase: 'The museum', note: 'common noun' }) });
    if (p.includes('Noun phrase to analyse: a new exhibit'))
      return route.fulfill({ status: 200, contentType: 'application/json', body: body({ concept: 'exhibit', relations: [[':mod', { concept: 'new' }]], phrase: 'a new exhibit', note: 'modified noun' }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: body({ concept: 'thing', relations: [] }) });
  });

  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  if ((await page.getAttribute('html', 'lang')) !== 'en') { await page.selectOption('#lang-select', 'en'); await page.waitForTimeout(300); }
  console.log('interface language:', await page.getAttribute('html', 'lang'));

  // live mode with a fake key, then an English document, annotated end to end
  await page.click('#btn-settings'); await page.waitForTimeout(200);
  scan('settings modal', await page.textContent('.settings-modal'));
  await (await page.$$('.provider-row .settings-input[type=password]'))[0].fill('sk-ant-demo');
  await (await page.$$('.provider-row .btn.sm'))[0].click();
  await page.click('.modal-head .btn.ghost');
  await page.selectOption('#mode-select', 'live');
  await page.waitForTimeout(200);

  await page.click('[data-menu="menu-import"]');
  scan('import menu', await page.textContent('#menu-import'));
  await page.click('#btn-drive-demo-en');
  await page.waitForTimeout(500);

  for (let i = 0; i < 8; i++) {
    const p = await page.$('.pending-row:not(.blocked)');
    if (!p) break;
    await p.click(); await page.waitForTimeout(300);
  }

  // Two things in the toolbar are legitimately Chinese in English mode and are
  // excluded by DOM, not by string matching: the language picker (whose options
  // name each language in that language) and the document picker (whose options are
  // the corpora's own titles, one of which is a Chinese corpus).
  scan('toolbar', await page.evaluate(() => {
    const bar = document.querySelector('.toolbar').cloneNode(true);
    bar.querySelector('.lang-ctl')?.remove();
    bar.querySelectorAll('select').forEach((s) => s.remove());
    return bar.textContent;
  }));
  scan('source pane', await page.textContent('.pane-left .pane-head'));
  scan('annotation pane', await page.textContent('#pane-annotated'));
  scan('legend', await page.textContent('#legend'));
  scan('sentence bar', await page.textContent('#sentence-bar'));

  // assistant pane for a code-decided node (its rationale is written in code)
  const nodeCount = (await page.$$('.node-row:not(.pending-row)')).length;
  for (let i = 0; i < nodeCount; i++) {
    const n = (await page.$$('.node-row:not(.pending-row)'))[i];
    if (!n) break;
    await n.click(); await page.waitForTimeout(150);
    scan('assistant pane', await page.textContent('#pane-assistant'));
  }

  // chat: empty state, a message, and a generated skill proposal
  scan('chat pane (empty)', await page.textContent('#pane-chat'));
  await page.fill('.chat-input', 'The aspect here looks wrong to me.');
  await page.click('.chat-bar button');
  await page.waitForTimeout(700);
  scan('chat pane (after)', await page.textContent('#pane-chat'));

  // activity log — where most internal messages surface
  await page.click('#btn-log'); await page.waitForTimeout(300);
  scan('activity log', await page.textContent('#log-panel-body'));
  await page.click('#log-panel-close');

  // github + format studio modals
  await page.click('#btn-github'); await page.waitForTimeout(250);
  scan('github modal', await page.textContent('.github-modal'));
  await page.click('.modal-head .btn.ghost');

  await page.click('#btn-studio'); await page.waitForTimeout(300);
  const desc = await page.$('.overlay .modal textarea, .overlay .modal input[type=text]');
  if (desc) await desc.fill('sentiment with intensity and entities');
  const gen = await page.$('.overlay .modal .modal-actions .btn:not(.ghost)');
  if (gen) { await gen.click(); await page.waitForTimeout(800); }
  scan('format studio', await page.textContent('.overlay .modal'));
  await page.click('.overlay .modal-head .btn.ghost');

  console.log(`\n=== CJK LEAKS IN ENGLISH MODE: ${leaks.length}`);
  for (const l of leaks) console.log('   ' + l);
  console.log('=== CONSOLE ERRORS:', errs.length);
  errs.forEach((e) => console.log('   ' + e));
  await browser.close();
  process.exit(leaks.length || errs.length ? 1 : 0);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
