/**
 * Does an accepted revision actually reach the model, or only the screen?
 *
 * Proof standard, unchanged since this file was written: the *next prompt
 * really sent* for that skill must literally contain the new rule. Not the
 * panel, not localStorage — the prompt.
 *
 * What changed is the road to get there. A chat objection no longer edits the
 * skill: it files an issue, a human reviews the batch, reflection drafts one
 * amendment, and a human applies it (see reflection-test.js for why). So this
 * walks that whole road and then asks the same question at the end of it.
 *
 * Run: NODE_PATH=<playwright> node docs/verification/skill-update-test.js
 */
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8899';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const body = (o) => JSON.stringify({ content: [{ type: 'text', text: typeof o === 'string' ? o : JSON.stringify(o) }] });

const S1 = 'The telescope was launched as planned on 30 August 2026 at 11:26 UTC.';
const RULE = '当时间状语同时含日期与时刻时，必须用一个 :temporal 覆盖完整跨度，不得只保留日期。';

let pass = 0, fail = 0;
const check = (label, ok, extra = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? '✓' : '✖'} ${label}${extra ? '\n      ' + extra : ''}`); };

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1700, height: 1000 }, locale: 'zh-CN' });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

  const prompts = [];
  await page.route('https://api.anthropic.com/v1/messages', async (route) => {
    const p = JSON.parse(route.request().postData()).messages[0].content;
    prompts.push(p);
    const reply = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: body(o) });
    // both the chat's proposal and the panel's reflection answer with the rule
    if (p.includes('标注规范维护者') || p.includes('标注规范的维护者') || p.includes('maintain annotation'))
      return reply(`模型只保留了日期，丢掉了时刻。\n\n> ${RULE}`);
    if (p.includes(`Sentence (English):\n${S1}`)) return reply({ has_discourse: false });
    if (p.includes(`Clause to analyse: ${S1}`) && !p.includes('## PropBank'))
      return reply({ predicate_kind: 'verb', lemmas: ['launch'], predicate_text: 'launched' });
    if (p.includes(`Clause to analyse: ${S1}`))
      return reply({ concept: 'launch-01', phrase: S1, note: '只标了日期',
        relations: [[':ARG1', { expand: true, phrase: 'The telescope', kind: 'np' }],
          [':temporal', { expand: true, phrase: '30 August 2026', kind: 'special' }],
          [':aspect', 'performance']] });
    return reply({ concept: 'thing', relations: [] });
  });

  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  if ((await page.getAttribute('html', 'lang')) !== 'zh') { await page.selectOption('#lang-select', 'zh'); await page.waitForTimeout(300); }

  await page.click('#btn-settings'); await page.waitForTimeout(200);
  await (await page.$$('.provider-row .settings-input[type=password]'))[0].fill('sk-ant-demo');
  await (await page.$$('.provider-row .btn.sm'))[0].click();
  await page.click('.modal-head .btn.ghost');
  await page.selectOption('#mode-select', 'live');
  await page.click('[data-menu="menu-import"]');
  await page.click('#btn-drive-demo-wiki');
  await page.waitForTimeout(600);

  console.log('\n--- 1. 跑到 arguments 那一步（模型故意只标了日期，丢掉时刻）---');
  for (let i = 0; i < 2; i++) {
    const pending = await page.$('.pending-row:not(.blocked)');
    if (!pending) break;
    await pending.click(); await page.waitForTimeout(350);
  }
  const argsPromptBefore = prompts.filter((p) => p.includes('## PropBank')).pop();
  check('先跑一次 arguments', Boolean(argsPromptBefore));
  check('这时 prompt 里当然还没有新规则', !argsPromptBefore.includes(RULE));

  console.log('\n--- 2. 在对话框里提出异议：只能记账，不能直接改技能 ---');
  const rows = await page.$$('.node-row:not(.pending-row)');
  let argNode = null;
  for (const r of rows) { if ((await r.textContent()).includes('arguments')) { argNode = r; break; } }
  await argNode.click(); await page.waitForTimeout(300);
  await page.fill('.chat-input', '时间状语应该覆盖 "on 30 August 2026 at 11:26 UTC" 整段，不能只留日期。');
  await page.click('.chat-bar button:has-text("发送")');
  await page.waitForTimeout(800);
  const recordBtn = await page.$('button:has-text("记入问题记录")');
  check('提案给的是「记入问题记录」，不是直接应用', Boolean(recordBtn));
  check('没有「应用到技能文件」这种按钮', !(await page.$('#pane-chat button:has-text("应用到技能文件")')));
  await recordBtn.click();
  await page.waitForTimeout(400);
  const afterFiling = await page.evaluate(async () => {
    const sk = await import('./js/core/skills.js');
    const rf = await import('./js/core/reflection.js');
    return { issues: rf.issuesFor('arguments').length, amendment: sk.getOverride('skills/shared/arguments.md') || '' };
  });
  check('问题记下来了', afterFiling.issues > 0, `${afterFiling.issues} 条`);
  check('技能文件此刻仍然没动', afterFiling.amendment === '', afterFiling.amendment || '(空)');

  console.log('\n--- 3. 人工审核 → 反思 → 应用 ---');
  const cards = await page.$$('.skill-card');
  let card = null;
  for (const c of cards) { if ((await c.textContent()).includes('arguments')) { card = c; break; } }
  await card.click(); await page.waitForTimeout(400);
  await page.click('.skill-detail-body .edit-tabs .btn:last-child'); await page.waitForTimeout(350);
  await page.click('.issue-row.open .issue-actions .btn:not(.ghost)');   // 保留
  await page.waitForTimeout(300);
  await page.click('.skill-detail-body .modal-actions .btn');            // 反思
  await page.waitForTimeout(900);
  check('反思给出了草案', (await page.textContent('.skill-detail-body')).includes(RULE.slice(0, 12)));
  const stillClean = await page.evaluate(async () => {
    const sk = await import('./js/core/skills.js');
    return sk.getOverride('skills/shared/arguments.md') || '';
  });
  check('草案本身还不算数', stillClean === '', stillClean || '(空)');
  await page.click('.amendment .modal-actions .btn:not(.ghost)');        // 应用到技能
  await page.waitForTimeout(600);
  const applied = await page.evaluate(async () => {
    const sk = await import('./js/core/skills.js');
    return sk.getOverride('skills/shared/arguments.md') || '';
  });
  check('应用之后技能文件才带上这条规则', applied.includes(RULE.slice(0, 12)), applied.slice(0, 80));
  await page.click('.skill-modal .modal-head .btn.ghost');
  await page.waitForTimeout(300);

  console.log('\n--- 4. 关键验证：下一次 arguments 调用的 prompt 里有没有这条规则？---');
  const before = prompts.length;
  const chips = await page.$$('.sentence-chip');
  await chips[1].click(); await page.waitForTimeout(300);
  for (let i = 0; i < 3; i++) {
    const pending = await page.$('.pending-row:not(.blocked)');
    if (!pending) break;
    await pending.click(); await page.waitForTimeout(350);
  }
  const argsPromptAfter = prompts.slice(before).filter((p) => p.includes('## PropBank')).pop();
  check('又发了一次 arguments 调用', Boolean(argsPromptAfter));
  check('这一次的 prompt 里真的带着这条规则', Boolean(argsPromptAfter) && argsPromptAfter.includes(RULE),
    argsPromptAfter ? JSON.stringify(argsPromptAfter.slice(Math.max(0, argsPromptAfter.indexOf('人工修订') - 20),
      argsPromptAfter.indexOf('人工修订') + 90)) : '');

  console.log('\n--- 5. 刷新之后依然生效 ---');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const stillThere = await page.evaluate(async () => {
    const sk = await import('./js/core/skills.js');
    return sk.loadEffectiveText('skills/shared/arguments.md');
  });
  check('刷新后技能文本仍带修订', stillThere.includes(RULE), stillThere.includes('人工修订') ? '(有修订段落)' : '(没有)');

  console.log(`\n=== ${pass} passed, ${fail} failed`);
  console.log('=== CONSOLE ERRORS:', errors.length);
  errors.forEach((e) => console.log('   ' + e.slice(0, 160)));
  await browser.close();
  process.exit(fail || errors.length ? 1 : 0);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
