/**
 * Is the exported file actually right?
 *
 * Export is the only durable output this tool has — there is no database, no
 * account, no server. If the JSON on disk is not exactly what was on screen,
 * the work is gone and nobody finds out until they open it somewhere else.
 *
 * So: annotate, correct something by hand, annotate the SAME document a second
 * way, export, and then re-open the export and compare. Everything checked here
 * is something that could plausibly be dropped on the way out — the human
 * correction, the work belonging to the method you were not looking at, the
 * per-node call records — plus the things that must NOT be in there, like the
 * replay index the app builds for itself.
 *
 * It also writes the file to /tmp so a person can look at it.
 *
 * Run: npm run test:browser -- export-test.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { launchBrowser } = require('./_browser');
const { promptOf } = require('./_prompt.js');
const BASE = process.env.BASE || 'http://localhost:8899';
const OUT = process.env.OUT_DIR || os.tmpdir();
const body = (o) => JSON.stringify({ content: [{ type: 'text', text: typeof o === 'string' ? o : JSON.stringify(o) }] });
const S1 = 'The museum opened a new exhibit last week.';

let pass = 0, fail = 0;
const check = (label, ok, extra = '') => {
  (ok ? pass++ : fail++);
  console.log(`  ${ok ? '✓' : '✖'} ${label}${extra ? '\n      ' + extra : ''}`);
};

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, locale: 'zh-CN' });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));

  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(BASE) || url.startsWith('https://api.anthropic.com')) return route.fallback();
    return route.abort();
  });
  await page.route('https://api.anthropic.com/**', (route) => {
    const p = promptOf(route.request().postData());
    const reply = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: body(o) });
    if (p.includes('Current UMR graph') || p.includes('no graph yet'))
      return reply({ graph: '(o / open-01\n    :ARG0 (m / museum))', changes: ['drafted'], note: 'one-shot' });
    if (p.includes(`Sentence (English):\n${S1}`)) return reply({ has_discourse: false });
    if (p.includes(`Clause to analyse: ${S1}`) && !p.includes('## PropBank'))
      return reply({ predicate_kind: 'verb', lemmas: ['open'], predicate_text: 'opened' });
    if (p.includes(`Clause to analyse: ${S1}`))
      return reply({ concept: 'open-01', phrase: S1, note: 'sense -01',
        relations: [[':ARG0', { expand: true, phrase: 'The museum', kind: 'np' }], [':aspect', 'performance']] });
    if (p.includes('Noun phrase to analyse: The museum'))
      return reply({ concept: 'museum', relations: [], phrase: 'The museum', note: 'common noun' });
    return reply({ concept: 'thing', relations: [] });
  });

  await page.goto(BASE + '/index.html', { waitUntil: 'load' });
  await page.waitForTimeout(900);
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(800);
  if ((await page.getAttribute('html', 'lang')) !== 'zh') { await page.selectOption('#lang-select', 'zh'); await page.waitForTimeout(300); }

  await page.click('#btn-settings'); await page.waitForTimeout(200);
  await (await page.$$('.provider-row .settings-input[type=password]'))[0].fill('sk-ant-demo');
  await (await page.$$('.provider-row .btn.sm'))[0].click();
  await page.click('.modal-head .btn.ghost');
  await page.selectOption('#mode-select', 'live');
  await page.click('[data-menu="menu-import"]');
  await page.click('#btn-drive-demo-en');
  await page.waitForTimeout(600);

  console.log('\n--- 1. annotate, correct by hand, and annotate a second way ---');
  for (let i = 0; i < 4; i++) {
    const row = await page.$('.pending-row:not(.running)');
    if (!row) break;
    await row.click();
    await page.waitForFunction(() => !document.querySelector('.pending-row.running'), null, { timeout: 15000 });
  }
  const rows = await page.$$('.node-row:not(.pending-row)');
  let argRow = null;
  for (const r of rows) if ((await r.textContent()).includes('arguments')) argRow = r;
  await argRow.click(); await page.waitForTimeout(300);
  const penman = await page.inputValue('.edit-box');
  await page.fill('.edit-box', penman.replace('open-01', 'inaugurate-01'));
  await page.click('.edit-actions .btn:not(.ghost)');
  await page.waitForTimeout(500);
  check('the correction is on screen', (await page.textContent('.artifact')).includes('inaugurate-01'));

  await page.selectOption('#format-select', 'refine');
  await page.waitForTimeout(700);
  await page.click('.chain-row.next .btn.xs');
  await page.waitForTimeout(800);
  check('the same document also has refine work', (await page.textContent('.artifact')).includes('open-01'));
  await page.selectOption('#format-select', 'umr');
  await page.waitForTimeout(700);

  console.log('\n--- 2. export, and read the export back ---');
  const exported = await page.evaluate(async () => {
    const src = await import('./js/io/sources.js');
    return JSON.stringify(src.exportDocument(), null, 1);
  });
  const file = path.join(OUT, 'annotated-export.json');
  fs.writeFileSync(file, exported);
  console.log(`      wrote ${file} (${(exported.length / 1024).toFixed(1)} KB)`);

  let doc;
  try { doc = JSON.parse(exported); } catch (e) { doc = null; }
  check('it is valid JSON', Boolean(doc));
  check('it names the method it was made with', doc.format === 'umr', String(doc.format));
  check('it carries the source text', doc.sentences?.[0]?.text === S1, doc.sentences?.[0]?.text);
  check('it says where the document came from', /imported/.test(doc.provenance || ''), doc.provenance);
  check('it is stamped with a time', Boolean(doc.exportedAt), doc.exportedAt);

  const s0 = doc.sentences[0];
  const calls = countCalls(s0.tree);
  check('the skill calls are in it', calls >= 4, `${calls} calls on sentence 1`);
  check('each call kept what it was asked and what it answered',
    Boolean(s0.tree[0]?.input && s0.tree[0]?.output), Object.keys(s0.tree[0] || {}).join(','));
  const recordedRuns = collectNodes(s0.tree).filter((node) => node.source === 'live');
  check('live calls carry immutable audit identities and prompt fingerprints',
    recordedRuns.length > 0 && recordedRuns.every((node) =>
      node.call?.id && node.call?.skillId && node.call?.revisionId
        && node.call?.request?.effectivePromptHash),
    `${recordedRuns.filter((node) => node.call?.id).length}/${recordedRuns.length} complete records`);
  check('the hand correction is the value in the file, not a footnote',
    JSON.stringify(s0.tree).includes('inaugurate-01'));
  check('and it is also listed as a human edit', (doc.humanEdits || []).length === 1,
    JSON.stringify(doc.humanEdits?.[0]?.path));
  check('the model original is still recoverable',
    JSON.stringify(s0.tree).includes('originalOutput'));

  console.log('\n--- 3. the method you were NOT looking at rides along ---');
  check('refine work is parked on the sentence', Boolean(s0._work?.refine),
    `parked: ${Object.keys(s0._work || {}).join(', ') || '(none)'}`);
  check('with its pass record', (s0._work?.refine?.passes || []).filter(Boolean).length === 1);
  check('and the active method is not shipped twice', !s0._work?.umr);

  console.log('\n--- 4. nothing internal leaked out ---');
  check('the replay index is not in the file', !('_trace' in doc));
  check('no Map or Set survived serialisation as "{}"',
    !/"edits":\{\}|"running":\{\}/.test(exported));
  check('document-scoped feedback and Skill revisions ride with the export',
    doc.workspaceSnapshot?.activation === 'manual-merge-required'
      && doc.workspaceSnapshot.feedbackEvents?.length >= 1
      && Object.keys(doc.workspaceSnapshot.skillWorkspace?.skills || {}).length >= 1,
    JSON.stringify({
      feedback: doc.workspaceSnapshot?.feedbackEvents?.length,
      skills: Object.keys(doc.workspaceSnapshot?.skillWorkspace?.skills || {}).length,
    }));

  console.log('\n--- 5. re-open it: the annotation comes back whole ---');
  const reopened = await page.evaluate(async (text) => {
    const src = await import('./js/io/sources.js');
    const st = await import('./js/core/state.js');
    const wk = await import('./js/core/work.js');
    const runner = await import('./js/core/runner.js');
    const doc = src.parseDocument(text, 'annotated-export.json');
    wk.initWork(doc);
    const s = doc.sentences[0];
    const count = (nodes) => (nodes || []).reduce((n, x) => n + (x.pending ? 0 : 1 + count(x.children)), 0);
    const withCall = collect(nodesOf(s)).find((node) => node.call?.id);
    st.state.doc = doc;
    st.state.selectedSentence = 0;
    st.state.runMode = 'replay';
    const replayed = await runner.runSkillCall({
      skillId: withCall.skill,
      stableSkillId: withCall.call.skillId,
      revisionId: 'rev:deliberately-current',
      span: withCall.span,
      system: 'different current system',
      prompt: 'different current task',
      language: doc.language,
    });
    return {
      id: doc.id, format: doc.format, sentences: doc.sentences.length,
      calls: count(s.tree), concepts: JSON.stringify(s.tree).includes('inaugurate-01'),
      refineParked: (s._work?.refine?.passes || []).filter(Boolean).length,
      text: s.text, before: st.state.doc.sentences[0].text,
      originalCallId: withCall.call.id,
      replayedCallId: replayed.call.id,
      replayedRevisionId: replayed.call.revisionId,
    };

    function nodesOf(sentence) { return sentence.tree || []; }
    function collect(nodes) {
      return (nodes || []).flatMap((node) => [node, ...collect(node.children)]);
    }
  }, exported);
  check('same document', reopened.text === reopened.before, reopened.text);
  check('same number of sentences', reopened.sentences === 4, `${reopened.sentences}`);
  check('same number of skill calls', reopened.calls === calls, `${reopened.calls} vs ${calls}`);
  check('the correction survived the round trip', reopened.concepts);
  check('and so did the other method', reopened.refineParked === 1, `${reopened.refineParked} pass(es)`);
  check('replay preserves the original RunRecord instead of fabricating a current one',
    reopened.replayedCallId === reopened.originalCallId
      && reopened.replayedRevisionId !== 'rev:deliberately-current',
    `${reopened.originalCallId} -> ${reopened.replayedCallId}`);

  console.log(`\n=== ${pass} passed, ${fail} failed`);
  console.log('=== CONSOLE ERRORS:', errs.length);
  errs.forEach((e) => console.log('   ' + e.slice(0, 180)));
  await browser.close();
  process.exit(fail || errs.length ? 1 : 0);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });

function countCalls(nodes = []) {
  return nodes.reduce((n, x) => n + (x.pending ? 0 : 1 + countCalls(x.children)), 0);
}

function collectNodes(nodes = []) {
  return nodes.flatMap((node) => [node, ...collectNodes(node.children)]);
}
