/**
 * Demo: annotate 3 sentences from the (2026-08-31) Wikipedia article on the
 * Nancy Grace Roman Space Telescope, step by step through the real pipeline,
 * then back-check coverage.
 *
 * The model responses below are genuine decompositions written against the
 * real skill files — not tuned to make coverage look good. Whatever the
 * back-check finds, it finds.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = 'http://localhost:8899';
const OUT = '/tmp/claude-0/-home-user/23712ac6-6571-52e0-9f3a-1aeb04979579/scratchpad';

const S1 = 'The telescope was launched as planned on 30 August 2026 at 11:26 UTC.';
const S2 = 'Soon after separation from the launch vehicle, solar panels deployed and communications were established.';
const S3 = 'The telescope will undergo a 90-day commissioning phase while traveling to the sun-Earth Lagrange Point 2.';

const body = (obj) => JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(obj) }] });
const isArgs = (p) => p.includes('## PropBank / roleset reference');

// ---- genuine annotations, keyed by what the prompt is actually asking ----
const ANSWERS = [
  // ============================== sentence 1 ==============================
  { when: (p) => p.includes(`Sentence (English):\n${S1}`),
    give: { has_discourse: false, note: '单个主句 + 状语，无并列/从属篇章关系' } },

  { when: (p) => p.includes(`Clause to analyse: ${S1}`) && !isArgs(p),
    give: { predicate_kind: 'verb', lemmas: ['launch'], concept: null, predicate_text: 'launched', note: '被动句主要动词' } },
  { when: (p) => p.includes(`Clause to analyse: ${S1}`) && isArgs(p),
    give: { concept: 'launch-01', phrase: S1, note: "被动：望远镜是 ARG1；'as planned' 方式；时间状语",
      relations: [
        [':ARG1', { expand: true, phrase: 'The telescope', kind: 'np' }],
        [':manner', { expand: true, phrase: 'as planned', kind: 'clause' }],
        [':temporal', { expand: true, phrase: 'on 30 August 2026 at 11:26 UTC', kind: 'special' }],
        [':aspect', 'performance'], [':modstr', 'fullaff'],
      ] } },

  { when: (p) => p.includes('Noun phrase to analyse: The telescope'),
    give: { concept: 'telescope', relations: [], phrase: 'The telescope', note: '定指回指，前文已提及的望远镜' } },

  { when: (p) => p.includes('Clause to analyse: as planned') && !isArgs(p),
    give: { predicate_kind: 'verb', lemmas: ['plan'], concept: null, predicate_text: 'planned' } },
  { when: (p) => p.includes('Clause to analyse: as planned') && isArgs(p),
    give: { concept: 'plan-01', phrase: 'as planned', note: '施事未提及；表示与计划一致',
      relations: [[':aspect', 'state'], [':modstr', 'fullaff']] } },

  { when: (p) => p.includes('Special phrase to analyse: on 30 August 2026 at 11:26 UTC'),
    give: { concept: 'date-entity', phrase: 'on 30 August 2026 at 11:26 UTC', note: '日期 + 时刻 + 时区',
      relations: [[':year', 2026], [':month', 8], [':day', 30], [':time', '"11:26"'], [':timezone', '"UTC"']] } },

  // ============================== sentence 2 ==============================
  { when: (p) => p.includes(`Sentence (English):\n${S2}`),
    give: { has_discourse: true, note: '两个并列事件共享一个时间状语',
      structure: { concept: 'and', note: '并列 and',
        relations: [
          [':op1', { expand: true, phrase: 'solar panels deployed', kind: 'clause' }],
          [':op2', { expand: true, phrase: 'communications were established', kind: 'clause' }],
          [':temporal', { expand: true, phrase: 'Soon after separation from the launch vehicle', kind: 'special' }],
        ] } } },

  { when: (p) => p.includes('Clause to analyse: solar panels deployed') && !isArgs(p),
    give: { predicate_kind: 'verb', lemmas: ['deploy'], concept: null, predicate_text: 'deployed' } },
  { when: (p) => p.includes('Clause to analyse: solar panels deployed') && isArgs(p),
    give: { concept: 'deploy-01', phrase: 'solar panels deployed', note: '不及物用法，展开物为 ARG1',
      relations: [[':ARG1', { expand: true, phrase: 'solar panels', kind: 'np' }],
        [':aspect', 'performance'], [':modstr', 'fullaff']] } },

  { when: (p) => p.includes('Clause to analyse: communications were established') && !isArgs(p),
    give: { predicate_kind: 'verb', lemmas: ['establish'], concept: null, predicate_text: 'established' } },
  { when: (p) => p.includes('Clause to analyse: communications were established') && isArgs(p),
    give: { concept: 'establish-01', phrase: 'communications were established', note: '被动，ARG1 为通信链路',
      relations: [[':ARG1', { expand: true, phrase: 'communications', kind: 'np' }],
        [':aspect', 'performance'], [':modstr', 'fullaff']] } },

  { when: (p) => p.includes('Special phrase to analyse: Soon after separation from the launch vehicle'),
    give: { concept: 'after', phrase: 'Soon after separation from the launch vehicle',
      note: "after 作为中心概念，锚点作 :op1（special_entity 技能里的 before/after 规则）",
      relations: [[':op1', { expand: true, phrase: 'separation from the launch vehicle', kind: 'clause' }],
        [':degree', { concept: 'soon' }]] } },

  { when: (p) => p.includes('Noun phrase to analyse: solar panels'),
    give: { concept: 'panel', phrase: 'solar panels',
      relations: [[':mod', { concept: 'solar' }], [':refer-number', 'plural']] } },
  { when: (p) => p.includes('Noun phrase to analyse: communications'),
    give: { concept: 'communication', phrase: 'communications', relations: [[':refer-number', 'plural']] } },

  { when: (p) => p.includes('Clause to analyse: separation from the launch vehicle') && !isArgs(p),
    give: { predicate_kind: 'verb', lemmas: ['separate'], concept: null, predicate_text: 'separation' } },
  { when: (p) => p.includes('Clause to analyse: separation from the launch vehicle') && isArgs(p),
    give: { concept: 'separate-01', phrase: 'separation from the launch vehicle', note: '名词化事件',
      relations: [[':ARG2', { expand: true, phrase: 'the launch vehicle', kind: 'np' }],
        [':aspect', 'performance'], [':modstr', 'fullaff']] } },
  { when: (p) => p.includes('Noun phrase to analyse: the launch vehicle'),
    give: { concept: 'vehicle', phrase: 'the launch vehicle', relations: [[':mod', { concept: 'launch' }]] } },

  // ============================== sentence 3 ==============================
  { when: (p) => p.includes(`Sentence (English):\n${S3}`),
    give: { has_discourse: true, note: "while 引导的时间从句，主句为顶层",
      structure: { expand: true, kind: 'clause',
        phrase: 'The telescope will undergo a 90-day commissioning phase',
        sub: [[':temporal', { expand: true, phrase: 'traveling to the sun-Earth Lagrange Point 2', kind: 'clause' }]] } } },

  { when: (p) => p.includes('Clause to analyse: The telescope will undergo a 90-day commissioning phase') && !isArgs(p),
    give: { predicate_kind: 'verb', lemmas: ['undergo'], concept: null, predicate_text: 'undergo' } },
  { when: (p) => p.includes('Clause to analyse: The telescope will undergo a 90-day commissioning phase') && isArgs(p),
    give: { concept: 'undergo-01', phrase: 'The telescope will undergo a 90-day commissioning phase',
      note: "will 未然 → modstr neutaff",
      relations: [[':ARG0', { expand: true, phrase: 'The telescope', kind: 'np' }],
        [':ARG1', { expand: true, phrase: 'a 90-day commissioning phase', kind: 'np' }],
        [':aspect', 'performance'], [':modstr', 'neutaff']] } },

  { when: (p) => p.includes('Noun phrase to analyse: a 90-day commissioning phase'),
    give: { concept: 'phase', phrase: 'a 90-day commissioning phase',
      relations: [[':mod', { concept: 'commission-01' }],
        [':duration', { expand: true, phrase: '90-day', kind: 'special' }]] } },
  { when: (p) => p.includes('Special phrase to analyse: 90-day'),
    give: { concept: 'temporal-quantity', phrase: '90-day',
      relations: [[':quant', 90], [':unit', { concept: 'day' }]] } },

  { when: (p) => p.includes('Clause to analyse: traveling to the sun-Earth Lagrange Point 2') && !isArgs(p),
    give: { predicate_kind: 'verb', lemmas: ['travel'], concept: null, predicate_text: 'traveling' } },
  { when: (p) => p.includes('Clause to analyse: traveling to the sun-Earth Lagrange Point 2') && isArgs(p),
    give: { concept: 'travel-01', phrase: 'traveling to the sun-Earth Lagrange Point 2',
      note: '控制结构：主语由主句望远镜承担',
      relations: [[':ARG0', { expand: true, phrase: 'The telescope', kind: 'np' }],
        [':goal', { expand: true, phrase: 'the sun-Earth Lagrange Point 2', kind: 'np' }],
        [':aspect', 'activity'], [':modstr', 'neutaff']] } },
  { when: (p) => p.includes('Noun phrase to analyse: the sun-Earth Lagrange Point 2'),
    give: { concept: 'space-region', phrase: 'the sun-Earth Lagrange Point 2',
      relations: [[':name', { concept: 'name', relations: [
        [':op1', '"sun-Earth"'], [':op2', '"Lagrange"'], [':op3', '"Point"'], [':op4', '2']] }]] } },
];

/** reentrancy: read the node listing out of the prompt and merge repeated telescopes, like a real model would. */
function reentrancyAnswer(prompt) {
  const ids = [];
  for (const line of prompt.split('\n')) {
    const m = line.match(/^- (e\d+): (\S+) \|/);
    if (m && m[2] === 'telescope') ids.push(m[1]);
  }
  return ids.length >= 2 ? { merge: [[ids[0], ids[1]]], note: '控制结构中重复出现的 telescope 合并' } : { merge: [] };
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + e.message));

  const transcript = [];
  const unmatched = [];
  await page.route('https://api.anthropic.com/v1/messages', async (route) => {
    const prompt = JSON.parse(route.request().postData()).messages[0].content;
    let answer;
    if (prompt.includes('Nodes in the parsed graph')) answer = reentrancyAnswer(prompt);
    else if (prompt.includes('Produce temporal/modal/coref')) answer = { temporal: [], modal: [], coref: [] };
    else {
      const hit = ANSWERS.find((a) => a.when(prompt));
      if (hit) answer = hit.give;
      else { unmatched.push(prompt.slice(-260)); answer = { _raw: 'NO ANSWER PREPARED' }; }
    }
    const taskLine = (prompt.match(/## Task input[\s\S]{0,200}/) || [''])[0].replace(/\s+/g, ' ').slice(0, 150);
    transcript.push({ task: taskLine, answer });
    await route.fulfill({ status: 200, contentType: 'application/json', body: body(answer) });
  });

  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  // live mode + key
  await page.click('#btn-settings'); await page.waitForTimeout(150);
  await (await page.$$('.provider-row .settings-input[type=password]'))[0].fill('sk-ant-demo');
  await (await page.$$('.provider-row .btn.sm'))[0].click();
  await page.click('.modal-head .btn.ghost');
  await page.selectOption('#mode-select', 'live');
  await page.waitForTimeout(200);

  // load the Wikipedia sample through the same parseDocument every source uses
  await page.evaluate(async () => {
    const src = await import('./js/io/sources.js');
    const st = await import('./js/core/state.js');
    const res = await fetch('data/samples/wikipedia-roman-telescope-2026.txt');
    const doc = src.parseDocument(await res.text(), 'wikipedia-roman-telescope-2026.txt');
    doc.provenance = 'imported: Wikipedia «Nancy Grace Roman Space Telescope» 2026-08-31';
    st.set({ doc, selectedSentence: 0, selectedNode: null, edits: new Map(), proposals: [], chat: [] }, 'doc');
  });
  await page.waitForTimeout(400);

  const steps = [];
  for (let s = 0; s < 3; s++) {
    const chips = await page.$$('.sentence-chip');
    await chips[s].click();
    await page.waitForTimeout(250);
    console.log(`\n===== 句子 ${s + 1} =====`);
    for (let i = 0; i < 40; i++) {
      const pending = await page.$('.pending-row:not(.blocked)');
      if (!pending) break;
      const label = (await pending.textContent()).replace(/\s+/g, ' ').trim();
      await pending.click();
      await page.waitForTimeout(260);
      console.log(`  ${String(i + 1).padStart(2)}. ${label.replace('待运行', '').trim()}`);
      steps.push({ sentence: s + 1, label });
    }
    // coverage strip for this sentence
    const cov = await page.textContent('.coverage-bar').catch(() => '(no bar)');
    const detail = await page.textContent('.coverage-detail').catch(() => '');
    console.log(`  → 覆盖率回查：${cov.replace(/\s+/g, ' ').trim()}`);
    if (detail) console.log(`     ${detail.replace(/\s+/g, ' ').trim()}`);
    await page.screenshot({ path: `${OUT}/wiki-s${s + 1}.png` });
  }

  // full machine-readable report
  const report = await page.evaluate(async () => {
    const st = await import('./js/core/state.js');
    const cov = await import('./js/core/coverage.js');
    return st.state.doc.sentences.map((s, i) => {
      const r = cov.sentenceCoverage(s, st.state.doc.language);
      return {
        index: i + 1, text: s.text,
        strictPct: Math.round(r.strict.ratio * 1000) / 10,
        loosePct: Math.round(r.loose.ratio * 1000) / 10,
        covered: r.strict.covered, dropped: r.strict.dropped, lost: r.strict.lost,
        looseMissing: r.loose.missing,
        badSteps: r.worstSteps.map((w) => ({ skill: w.skill, span: w.span, lost: w.lost })),
        callCount: JSON.stringify(s.tree).split('"skill"').length - 1,
      };
    });
  });
  fs.writeFileSync(`${OUT}/wiki-coverage-report.json`, JSON.stringify(report, null, 2));

  console.log('\n\n========== 倒查验证结果 ==========');
  for (const r of report) {
    console.log(`\n句 ${r.index}（${r.callCount} 次调用）：${r.text}`);
    console.log(`  严格覆盖率 ${r.strictPct}%   （后端宽松口径 ${r.loosePct}%）`);
    console.log(`  合法省略  : ${r.dropped.join(' ') || '(无)'}`);
    console.log(`  ✖ 真正丢失: ${r.lost.join(' ') || '(无)'}`);
    for (const b of r.badSteps) console.log(`      ↳ ${b.skill}「${b.span.slice(0, 46)}」丢了: ${b.lost.join('、')}`);
  }

  console.log('\n=== 未准备答案的 prompt（应为 0）:', unmatched.length);
  unmatched.forEach((u) => console.log('   ...' + u));
  console.log('=== CONSOLE ERRORS:', consoleErrors.length);
  consoleErrors.forEach((e) => console.log('   ' + e));

  fs.writeFileSync(`${OUT}/wiki-transcript.json`, JSON.stringify(transcript, null, 2));
  console.log(`\n共 ${transcript.length} 次模型调用，记录已存 wiki-transcript.json`);

  await browser.close();
})().catch((e) => { console.error('FAILED:', e); process.exit(1); });
