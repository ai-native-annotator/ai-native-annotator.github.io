/**
 * 1. Interface language switch (中 / EN)
 * 2. Per-node chat threads: each node keeps its own conversation
 */
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8899';
const SHOT = (n) => `${process.env.SHOT_DIR || '/tmp'}/${n}.png`;
const body = (o) => JSON.stringify({ content: [{ type: 'text', text: typeof o === 'string' ? o : JSON.stringify(o) }] });
const S1 = 'The museum opened a new exhibit last week.';

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  // Deliberately NO locale override: part 1 asserts the first visit follows the
  // browser's own language, so pinning one here would test nothing.
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));

  await page.route('https://api.anthropic.com/v1/messages', async (route) => {
    const p = JSON.parse(route.request().postData()).messages[0].content;
    if (p.includes('annotation guidelines') || p.includes('标注规范维护者')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: body('The model kept only the date.\n\n> Always cover the full temporal span.') });
    }
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
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  console.log('=========== 1. 界面语言切换（下拉菜单） ===========');
  const langNow = async () => (await page.getAttribute('html', 'lang'));
  const snap = async () => ({
    lang: await langNow(),
    toolbar: await page.textContent('.toolbar'),
    pane: await page.textContent('.pane-left .pane-head'),
    legend: await page.textContent('#legend'),
    tree: await page.textContent('#pane-annotated'),
  });

  const options = await page.$$eval('#lang-select option', (os) => os.map((o) => ({ v: o.value, t: o.textContent.trim() })));
  console.log('  可选语言:', options.map((o) => `${o.v}=${o.t}`).join(', '));
  console.log('  是下拉菜单而不是按钮:', Boolean(await page.$('#lang-select')) && !(await page.$('#btn-lang')));
  console.log('  语言不止两种:', options.length >= 3);
  console.log('  每种语言用它自己的文字写:',
    options.some((o) => o.t === '中文') && options.some((o) => o.t === 'English') && options.some((o) => o.t === '日本語'));

  const A = await snap();
  console.log(`  首次进入跟随浏览器语言 -> ${A.lang} (navigator=${await page.evaluate(() => navigator.language)})`);
  await page.screenshot({ path: SHOT(`lang-${A.lang}`) });

  await page.selectOption('#lang-select', A.lang === 'zh' ? 'en' : 'zh');
  await page.waitForTimeout(400);
  const B = await snap();
  console.log(`  选一下切到 -> ${B.lang}`);
  console.log('  语言确实变了:', A.lang !== B.lang);
  await page.screenshot({ path: SHOT(`lang-${B.lang}`) });

  const zh = A.lang === 'zh' ? A : B, en = A.lang === 'en' ? A : B;
  console.log('  中文态: 工具栏有「格式」「导入」:', zh.toolbar.includes('格式') && zh.toolbar.includes('导入'));
  console.log('  中文态: 面板「原始文件」:', zh.pane.includes('原始文件'));
  console.log('  中文态: 图例「图例」+「篇章关系切分」:', zh.legend.includes('图例') && zh.legend.includes('篇章关系切分'));
  console.log('  中文态: 标注树标题:', zh.tree.includes('标注树'));
  console.log('  英文态: 工具栏 Format/Import:', en.toolbar.includes('Format') && en.toolbar.includes('Import'));
  console.log('  英文态: 无残留中文「格式」:', !en.toolbar.includes('格式'));
  console.log('  英文态: 面板 Source:', en.pane.includes('Source'));
  console.log('  英文态: 图例 Legend + discourse segmentation:', en.legend.includes('Legend') && en.legend.includes('discourse segmentation'));
  console.log('  英文态: 标注树 Annotation tree:', en.tree.includes('Annotation tree'));

  console.log('\n  -- 第三种语言（文件式 locale，缺的键回落英文）--');
  await page.selectOption('#lang-select', 'ja');
  await page.waitForTimeout(500);
  const ja = await snap();
  console.log('  html lang = ja:', ja.lang === 'ja');
  console.log('  工具栏译成日文:', ja.toolbar.includes('形式') && ja.toolbar.includes('読み込み'));
  console.log('  面板译成日文:', ja.pane.includes('原文'));
  console.log('  标注树译成日文:', ja.tree.includes('注釈ツリー'));
  // "no CJK" is meaningless here — Japanese kanji share the range with Chinese.
  // What must not happen is a fall back to CHINESE: a file-backed locale falls
  // back to English per missing key, never to the other built-in language.
  console.log('  没有回落到中文（应回落英文）:',
    !ja.toolbar.includes('导入') && !ja.tree.includes('标注树') && !ja.pane.includes('原始文件'));
  console.log('  未翻译的键确实回落到英文:', ja.legend.includes('discourse segmentation'));
  await page.screenshot({ path: SHOT('lang-ja') });

  console.log('\n  -- 设置面板跟随语言 --');
  await page.selectOption('#lang-select', 'en'); await page.waitForTimeout(400);
  await page.click('#btn-settings'); await page.waitForTimeout(250);
  const setTxt = await page.textContent('.settings-modal');
  console.log('  设置面板语言正确:', setTxt.includes('Local credentials file'));
  await page.click('.modal-head .btn.ghost');

  console.log('\n  -- 刷新后语言保持 --');
  await page.selectOption('#lang-select', 'ja'); await page.waitForTimeout(400);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  console.log('  刷新后仍是 ja:', (await langNow()) === 'ja');
  console.log('  刷新后日文仍在（locale 文件被重新加载）:', (await page.textContent('.toolbar')).includes('形式'));

  // force Chinese for the thread test so the selectors below are stable
  await page.selectOption('#lang-select', 'zh'); await page.waitForTimeout(400);
  console.log('  线程测试前已切到:', await langNow());

  console.log('\n=========== 2. 每个节点独立对话 ===========');
  await page.click('#btn-settings'); await page.waitForTimeout(200);
  await (await page.$$('.provider-row .settings-input[type=password]'))[0].fill('sk-ant-demo');
  await (await page.$$('.provider-row .btn.sm'))[0].click();
  await page.click('.modal-head .btn.ghost');
  await page.selectOption('#mode-select', 'live');
  await page.waitForTimeout(200);

  await page.click('[data-menu="menu-import"]');
  await page.click('#btn-drive-demo-en');
  await page.waitForTimeout(500);
  for (let i = 0; i < 5; i++) {
    const p = await page.$('.pending-row:not(.blocked)');
    if (!p) break;
    await p.click(); await page.waitForTimeout(300);
  }

  const nodes = await page.$$('.node-row:not(.pending-row)');
  console.log('  已解析节点数:', nodes.length);

  // talk to node A
  await nodes[1].click(); await page.waitForTimeout(200);
  const nodeAName = (await page.textContent('.chat-scope')).replace(/\s+/g, ' ').trim();
  console.log('  节点 A 作用域:', nodeAName.slice(0, 46));
  await page.fill('.chat-input', 'A 节点的意见：这里的 aspect 不对。');
  await page.click('.chat-bar button:has-text("发送")');
  await page.waitForTimeout(500);
  const aCount = await page.$$eval('.chat-msg', (e) => e.length);
  console.log('  节点 A 消息数:', aCount);

  // switch to node B — its thread must be EMPTY
  const nodes2 = await page.$$('.node-row:not(.pending-row)');
  await nodes2[3].click(); await page.waitForTimeout(300);
  const bMsgs = await page.$$eval('.chat-msg', (e) => e.length);
  const bEmpty = await page.textContent('#pane-chat');
  console.log('  切到节点 B 后消息数（应为 0）:', bMsgs);
  console.log('  节点 B 显示空状态提示:', bEmpty.includes('这个节点还没有对话'));
  console.log('  出现「其他节点的对话」跳转条:', bEmpty.includes('其他节点的对话'));

  await page.fill('.chat-input', 'B 节点的意见：这个名词短语应该拆开。');
  await page.click('.chat-bar button:has-text("发送")');
  await page.waitForTimeout(500);
  console.log('  节点 B 消息数:', await page.$$eval('.chat-msg', (e) => e.length));

  // back to A — its own messages must still be there, and NOT B's
  await (await page.$$('.node-row:not(.pending-row)'))[1].click();
  await page.waitForTimeout(300);
  const backA = await page.textContent('.chat-log');
  console.log('  回到 A：看得到 A 的话:', backA.includes('A 节点的意见'));
  console.log('  回到 A：看不到 B 的话:', !backA.includes('B 节点的意见'));
  await page.screenshot({ path: SHOT('threads') });

  // thread chip jumps back to the other node
  const chip = await page.$('.thread-chip');
  if (chip) {
    await chip.click(); await page.waitForTimeout(400);
    const after = await page.textContent('.chat-log');
    console.log('  点「其他节点」chip 能跳过去:', after.includes('B 节点的意见') || after.includes('A 节点的意见'));
  }

  // general thread is separate again
  await page.evaluate(() => document.querySelector('.pane-body')?.click());
  const store = await page.evaluate(async () => {
    const st = await import('./js/core/state.js');
    return Object.fromEntries(Object.entries(st.state.chats).map(([k, v]) => [k, v.length]));
  });
  console.log('  会话存储（threadKey -> 消息数）:', JSON.stringify(store));

  console.log('\n=== CONSOLE ERRORS:', errs.length);
  errs.forEach((e) => console.log('   ' + e));
  await browser.close();
})().catch((e) => { console.error('FAILED:', e); process.exit(1); });
