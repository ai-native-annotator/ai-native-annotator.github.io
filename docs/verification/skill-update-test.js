/**
 * Does the chat system actually UPDATE a skill, or only draft a proposal?
 *
 * Proof standard: after accepting an amendment, the *next* prompt sent for
 * that skill must literally contain the new rule. Anything less is a
 * suggestion box.
 */
const { chromium } = require('playwright');
const BASE = 'http://localhost:8899';
const body = (o) => JSON.stringify({ content: [{ type: 'text', text: typeof o === 'string' ? o : JSON.stringify(o) }] });

const S1 = 'The telescope was launched as planned on 30 August 2026 at 11:26 UTC.';
const RULE = '当时间状语同时含日期与时刻时，必须用一个 :temporal 覆盖完整跨度，不得只保留日期。';

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, locale: 'zh-CN' })   // selects on Chinese UI text;
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

  const prompts = [];
  await page.route('https://api.anthropic.com/v1/messages', async (route) => {
    const p = JSON.parse(route.request().postData()).messages[0].content;
    prompts.push(p);
    if (p.includes('标注规范维护者')) {
      // the "live" proposal generator: reply with a rule in a > block
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: body(`模型只保留了日期，丢掉了时刻。\n\n> ${RULE}`) });
    }
    if (p.includes(`Sentence (English):\n${S1}`)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: body({ has_discourse: false }) });
    }
    if (p.includes(`Clause to analyse: ${S1}`) && !p.includes('## PropBank')) {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: body({ predicate_kind: 'verb', lemmas: ['launch'], predicate_text: 'launched' }) });
    }
    if (p.includes(`Clause to analyse: ${S1}`)) {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: body({ concept: 'launch-01', phrase: S1, note: '只标了日期',
          relations: [[':ARG1', { expand: true, phrase: 'The telescope', kind: 'np' }],
            [':temporal', { expand: true, phrase: '30 August 2026', kind: 'special' }],
            [':aspect', 'performance']] }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: body({ concept: 'thing', relations: [] }) });
  });

  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  // clean slate: no leftover overrides from a previous run
  await page.evaluate(() => localStorage.removeItem('annotator_skill_overrides'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  await page.click('#btn-settings'); await page.waitForTimeout(150);
  await (await page.$$('.provider-row .settings-input[type=password]'))[0].fill('sk-ant-demo');
  await (await page.$$('.provider-row .btn.sm'))[0].click();
  await page.click('.modal-head .btn.ghost');
  await page.selectOption('#mode-select', 'live');
  await page.waitForTimeout(200);

  await page.evaluate(async () => {
    const src = await import('./js/io/sources.js');
    const st = await import('./js/core/state.js');
    const res = await fetch('data/samples/wikipedia-roman-telescope-2026.txt');
    const doc = src.parseDocument(await res.text(), 'wiki.txt');
    st.set({ doc, selectedSentence: 0, selectedNode: null, edits: new Map(), proposals: [], chat: [] }, 'doc');
  });
  await page.waitForTimeout(300);

  console.log('--- 1. 跑到 arguments 那一步（模型故意只标了日期，丢掉时刻）---');
  for (let i = 0; i < 2; i++) {
    const pending = await page.$('.pending-row:not(.blocked)');
    if (!pending) break;
    await pending.click(); await page.waitForTimeout(300);
  }
  const argsPromptBefore = prompts.filter((p) => p.includes('## PropBank')).pop();
  console.log('   arguments prompt 里已经包含新规则?', argsPromptBefore.includes(RULE), '(应为 false)');

  console.log('\n--- 2. 选中 arguments 节点，在对话框里提出异议 ---');
  const argNode = await page.$('.node-row:not(.pending-row) >> text=arguments');
  if (argNode) await argNode.click();
  else await (await page.$$('.node-row:not(.pending-row)'))[1].click();
  await page.waitForTimeout(200);
  await page.fill('.chat-input', '时间状语应该覆盖 "on 30 August 2026 at 11:26 UTC" 整段，不能只留日期。');
  await page.click('.chat-bar button:has-text("发送")');
  await page.waitForTimeout(600);
  const chatText = await page.textContent('#pane-chat');
  console.log('   生成了提案?', chatText.includes('提案'));
  console.log('   提案里有「应用到技能文件」按钮?', chatText.includes('应用到技能文件'));

  console.log('\n--- 3. 点「应用到技能文件」---');
  const applyBtn = await page.$('button:has-text("应用到技能文件")');
  if (!applyBtn) { console.log('   ✗ 没有这个按钮'); await browser.close(); return; }
  await applyBtn.click();
  await page.waitForTimeout(300);
  const applied = await page.evaluate(() => JSON.parse(localStorage.getItem('annotator_skill_overrides') || '{}'));
  console.log('   localStorage 里的修订:', JSON.stringify(applied).slice(0, 160));

  console.log('\n--- 4. 关键验证：下一次 arguments 调用的 prompt 里有没有这条规则？---');
  const before = prompts.length;
  // run the same skill again on sentence 2 so a fresh arguments prompt is built
  const chips = await page.$$('.sentence-chip');
  await chips[1].click(); await page.waitForTimeout(250);
  for (let i = 0; i < 3; i++) {
    const pending = await page.$('.pending-row:not(.blocked)');
    if (!pending) break;
    await pending.click(); await page.waitForTimeout(300);
  }
  const newPrompts = prompts.slice(before);
  const argsPromptAfter = newPrompts.filter((p) => p.includes('## PropBank')).pop();
  if (!argsPromptAfter) {
    console.log('   (这一句没有再触发 arguments 调用)');
  } else {
    const ok = argsPromptAfter.includes(RULE);
    console.log('   新的 arguments prompt 包含该规则?', ok, ok ? '✓ 技能真的被更新了' : '✗ 没有生效');
    const idx = argsPromptAfter.indexOf('人工修订');
    if (idx > 0) console.log('   prompt 片段:', JSON.stringify(argsPromptAfter.slice(idx - 20, idx + 90)));
  }

  console.log('\n--- 5. 重新加载页面后是否仍然生效（持久化）---');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const stillThere = await page.evaluate(async () => {
    const sk = await import('./js/core/skills.js');
    const t = await sk.loadEffectiveText('skills/shared/arguments.md');
    return t.includes('人工修订');
  });
  console.log('   刷新后技能文本仍带修订?', stillThere);

  console.log('\n=== CONSOLE ERRORS:', errors.length);
  errors.forEach((e) => console.log('   ' + e));
  await browser.close();
})().catch((e) => { console.error('FAILED:', e); process.exit(1); });
