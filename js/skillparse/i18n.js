/** Interface strings, Chinese and English. t(key, {var}) fills {var}. */

const ZH = {
  runDoc: '自动标注全文', exportUmrShort: '导出 .umr',
  docProgress: '自动标注：{wave} {done}/{n} 项 · {steps} 步 · {errors} 处出错',
  docDone: '全文标注完成：{steps} 步，{errors} 处出错，用时 {s} 秒。可以导出 .umr 了。',
  importFormat: '导入格式', fmtLines: '文本 .txt：每行一句', fmtSplit: '文本 .txt：自动分句',
  fmtUmr: 'UMR 文件 .umr：抽出原文重新标注（忽略原来的标注）',
  via: { openrouter: '用 OpenRouter key', anthropic: '用 Anthropic key（直连）', openai: '用 OpenAI key' }, whichKey: '走哪个 key',
  roleNames: { haiku: 'Haiku：运行每个 agent skill（它的 skill.md）', reflect: '反思（找 skill 的问题、提修改）' },
  tabGraph: '图', tabUmr: 'UMR 文本', fragment: '这一步写出的图片段（虚线框 = 交给下一步的占位）：',
  graphOf: '第 {n} 句的图', graphHelp: '框 = 节点（概念 / 变量 · 对齐的字）；蓝框 = 当前这一步写的；橙色虚线 = 重入。点框跳到写它的那一步，悬停看对齐的字。',
  fit: '适应宽度', noGraph: '这一句还没有图：在 wave 1 运行这一句。', docRels: '文档级关系（{n}）',
  umrNote: '这一句的 .umr（output handler 拼出；单字编号；自动补齐的 alignment 标黄）。',
  jevTitle: 'kind: jev：规则列选项，Jev 回答封闭问题', haikuTitle: 'kind: agent：skill.md 作为提示词交给 Haiku', tabTools: '工具调用', noTools: '没有工具调用。', retried: '第一次的回答不合格，已重试',
  runWave: '运行这个 wave 的全部 {n} 项',
  jevKeyHint: '留空就用 OpenRouter key',
  title: 'SkillParse 工作台', back: '回到标注工作台', skillset: 'Skill', document: '文档', import: '导入…', stop: '停止',
  export: '导出 ▾', exportUmr: '.umr 文件（自动补齐 alignment）', exportUmrRaw: '.umr 文件（alignment 保持原样）',
  exportJson: '工作记录（JSON）', exportSkills: '改过的 skill 文件（JSON）', settings: '设置', close: '关闭',
  context: '上下文', contextGloss: 'wave · for_each · 窗口', skills: 'Skill 栏', skillsGloss: 'registry',
  generated: '生成内容', steps: '步骤', stepsGloss: '点一步运行或查看', ai: 'AI', aiGloss: '反思当前这一步',
  booting: '正在启动 Python…', ready: '就绪', warming: '加载 jieba 词典（第一次约 10–20 秒）…',
  opening: '打开 {skillset} · {doc} …',
  wave: 'wave {n}', start: '起点', forEach: 'for_each', parallel: '并行', contextVars: 'context（每一步都拿到）',
  inputVars: 'input（只给起点）', windowTitle: '窗口：{var}', windowSrc: '取 {src} 的 [{a}, {b})',
  prevN: '前 {n} 句', winBefore: '前', winAfter: '句', thisOnly: '只看这一句', withCurrent: '含本句', default: 'registry 默认',
  restartNote: '已开始的句子要重新开始（↻）才会用新窗口。', items: 'for_each 项（{n}）', all: '全选', none: '全不选',
  runSelected: '运行选中的 {n} 项', episodeCtx: '这一项的 context', notStarted: '这一项还没开始。',
  needs: '要先完成：{list}', runNeeds: '先运行这些', runEp: '运行这一项', restart: '↻ 重新开始',
  runNext: '运行下一步', runAll: '运行到底', stale: '前面的结果改过了，这一项可能过时；可以重新开始。',
  skillFiles: '文件', shared: '共用文件', kinds: { jev: 'jev', rule: 'rule', agent: 'agent', rewrite: '改写', check: '检查' },
  tabOutput: '输出', tabInput: '输入', tabJev: '问答', tabPrompt: '提示词',
  noNode: '在下面点一步。', edit: '修改输出', saveCorrection: '保存修改（作为人工结果）', cancel: '取消',
  machine: '机器输出', human: '人工修改', restoreMachine: '恢复机器输出', humanTag: '人工',
  rerun: '↻ 重跑这一步', run: '▶ 运行', badJson: '不是合法的 JSON：{e}', saved: '已保存，下面的步骤按你的结果重做。',
  questions: '{n} 个问题', round: '第 {n} 轮', noRounds: '这一步没有问 Jev。', noPrompt: '这一步不调模型。',

  error: '出错', problems: '读取问题', children: '子节点', dropped: '没有建的子节点',
  aiHead: '这一步：{node}', aiNone: '先在下面选一步。',
  m1: '直接改 skill', m1Desc: '打开这一步的 skill 文件，改完保存，再重跑这一步。',
  m2: '改生成内容，自动找 skill 的问题', m2Desc: '在上面「修改输出」改成对的结果并保存；AI 比较机器输出和你的结果，找出 skill 哪里错并给出修改。',
  m2Ready: '你的修改和机器输出的差别：', m2None: '这一步还没有人工修改。', m2Go: '找出 skill 的问题',
  m3: '告诉 AI 哪里错了，由机器改', m3Desc: '用一句话说哪里不对，AI 改 skill。', m3Go: '让 AI 改 skill', m3Placeholder: '比如：“发生”应该是谓词，不该当成名词短语的一部分',
  selfGo: 'AI 自查这一步', thinking: 'AI 在看…', diagnosis: '诊断', layer: '问题在：{layer}',
  edits: '修改建议（{n}）', noEdits: '没有修改建议。', apply: '应用选中的修改', applied: '已应用 {ok}/{n} 条',
  failed: '没应用：{why}', verify: '重跑这一步验证', verifyOk: '✓ 重跑后得到了你的结果。',
  verifyDiff: '重跑后的输出和你的结果还有差别：', reapply: '把我的结果放回去', jumpUp: '跳到上游这一步',
  history: '这一步的记录', openFile: '打开 {f}',
  editorTitle: '编辑 {f}', mdRead: '阅读', mdEdit: '编辑原文', mdSource: '原文', save: '保存（新版本）', revert: '回到原始版本', versions: '版本（{n}）', original: '原始',
  savedVersion: '已保存。下一次运行这一步就用新版本。', syntax: '保存了，但 Python 有问题：{p}', diffWithPrev: '和上一版的差别',
  importTitle: '导入文档', importDesc: '选文件或粘贴文本，再选导入格式。中文会用 jieba 分词；对齐按单字编号。', paste: '或者粘贴文本：',
  importGo: '导入', docName: '文档名', imported: '已导入 {id}（{n} 句）',
  settingsTitle: '设置', keys: 'API key（只存在这个浏览器）', roles: '模型', provider: '服务', model: '模型名',
  jevBackend: 'sent_type 的封闭问题由谁回答', jevManual: '我自己回答',
  jevUrl: 'Jev 地址', jevModel: 'Jev 模型', jevKey: 'Jev key', concurrency: '同时运行的步数', saveSettings: '保存',
  manualTitle: '回答 Jev 的问题（{n}）', manualGo: '提交答案', yes: '是', no: '否',
  exported: '已导出', alignAdded: '自动补了 {n} 个 alignment', nothing: '还没有结果可以导出。',
  stopped: '已停止', running: '运行中：{what}', doneRun: '完成 {n} 步', needKey: '需要 key：请在 ⚙ 设置里填。',
};

const EN = {
  runDoc: 'Annotate the whole document', exportUmrShort: 'Export .umr',
  docProgress: 'Annotating: {wave} {done}/{n} items · {steps} steps · {errors} errors',
  docDone: 'Document annotated: {steps} steps, {errors} errors, {s} s. Ready to export .umr.',
  importFormat: 'Import as', fmtLines: 'Text .txt: one sentence per line', fmtSplit: 'Text .txt: split into sentences',
  fmtUmr: 'UMR file .umr: take its text and annotate again (its annotation is ignored)',
  via: { openrouter: 'OpenRouter key', anthropic: 'Anthropic key (direct)', openai: 'OpenAI key' }, whichKey: 'Which key',
  roleNames: { haiku: 'Haiku: runs every agent skill (its skill.md)', reflect: 'Reflection (finds skill problems, proposes edits)' },
  tabGraph: 'Graph', tabUmr: 'UMR text', fragment: 'The graph fragment this step wrote (dashed = placeholders handed to the next steps):',
  graphOf: 'Sentence {n} graph', graphHelp: 'Box = node (concept / variable · aligned words); blue = written by the selected step; orange dashed = re-entrancy. Click a box to go to the step that wrote it; hover to see its words.',
  fit: 'Fit width', noGraph: 'No graph for this sentence yet: run it in wave 1.', docRels: 'Document-level relations ({n})',
  umrNote: "This sentence's .umr (assembled by the output handler; one token per character in Chinese; filled-in alignments highlighted).",
  jevTitle: 'kind: jev: rules list the options, Jev answers closed questions', haikuTitle: 'kind: agent: the skill.md is the prompt, Haiku answers', tabTools: 'Tool calls', noTools: 'No tool calls.', retried: 'The first answer was invalid and was retried',
  runWave: 'Run all {n} items of this wave',
  jevKeyHint: 'empty: use the OpenRouter key',
  title: 'SkillParse Workbench', back: 'Back to the annotation workbench', skillset: 'Skills', document: 'Document', import: 'Import…', stop: 'Stop',
  export: 'Export ▾', exportUmr: '.umr file (alignment filled in)', exportUmrRaw: '.umr file (alignment as produced)',
  exportJson: 'Work record (JSON)', exportSkills: 'Edited skill files (JSON)', settings: 'Settings', close: 'Close',
  context: 'Context', contextGloss: 'waves · for_each · windows', skills: 'Skills', skillsGloss: 'registry',
  generated: 'Generated', steps: 'Steps', stepsGloss: 'click a step to run or inspect it', ai: 'AI', aiGloss: 'reflect on this step',
  booting: 'Starting Python…', ready: 'Ready', warming: 'Loading the jieba dictionary (10–20 s the first time)…',
  opening: 'Opening {skillset} · {doc} …',
  wave: 'wave {n}', start: 'start', forEach: 'for_each', parallel: 'parallel', contextVars: 'context (every step gets it)',
  inputVars: 'input (the start skill only)', windowTitle: 'Window: {var}', windowSrc: 'items [{a}, {b}) of {src}',
  prevN: '{n} before', winBefore: '', winAfter: 'items before', thisOnly: 'this one only', withCurrent: 'include this one', default: 'registry default',
  restartNote: 'Items already started use the new window once restarted (↻).', items: 'for_each items ({n})', all: 'all', none: 'none',
  runSelected: 'Run {n} selected', episodeCtx: "This item's context", notStarted: 'This item has not started.',
  needs: 'Needs first: {list}', runNeeds: 'Run those first', runEp: 'Run this item', restart: '↻ Restart',
  runNext: 'Run next step', runAll: 'Run to the end', stale: 'Something it reads has changed since; restart it to redo.',
  skillFiles: 'Files', shared: 'Shared files', kinds: { jev: 'jev', rule: 'rule', agent: 'agent', rewrite: 'rewrite', check: 'check' },
  tabOutput: 'Output', tabInput: 'Input', tabJev: 'Q&A', tabPrompt: 'Prompt',
  noNode: 'Click a step below.', edit: 'Edit output', saveCorrection: 'Save (as the human result)', cancel: 'Cancel',
  machine: 'Machine output', human: 'Human correction', restoreMachine: 'Back to the machine output', humanTag: 'human',
  rerun: '↻ Re-run this step', run: '▶ Run', badJson: 'Not valid JSON: {e}', saved: 'Saved; the steps below are redone from your result.',
  questions: '{n} questions', round: 'Round {n}', noRounds: 'This step asked Jev nothing.', noPrompt: 'This step calls no model.',

  error: 'Error', problems: 'Reading problems', children: 'Children', dropped: 'Children not made',
  aiHead: 'This step: {node}', aiNone: 'Pick a step below first.',
  m1: 'Edit the skill yourself', m1Desc: "Open this step's skill files, save, and re-run the step.",
  m2: 'Correct the output, find the skill problem', m2Desc: 'Use "Edit output" above to write the right result; the AI compares it with the machine output and proposes a skill edit.',
  m2Ready: 'Your correction against the machine output:', m2None: 'No human correction on this step yet.', m2Go: 'Find the skill problem',
  m3: 'Tell the AI what is wrong, let it edit', m3Desc: 'Say in a sentence what is wrong; the AI edits the skill.', m3Go: 'Have the AI edit the skill', m3Placeholder: 'e.g. "occurred" should be the predicate, not part of the noun phrase',
  selfGo: 'Let the AI check this step', thinking: 'The AI is looking…', diagnosis: 'Diagnosis', layer: 'Problem in: {layer}',
  edits: 'Proposed edits ({n})', noEdits: 'No edits proposed.', apply: 'Apply selected edits', applied: 'Applied {ok}/{n}',
  failed: 'Not applied: {why}', verify: 'Re-run this step to check', verifyOk: '✓ The step now produces your result.',
  verifyDiff: 'After the re-run the output still differs from yours:', reapply: 'Put my result back', jumpUp: 'Go to the upstream step',
  history: 'History of this step', openFile: 'Open {f}',
  editorTitle: 'Edit {f}', mdRead: 'Read', mdEdit: 'Edit source', mdSource: 'source', save: 'Save (new version)', revert: 'Back to the original', versions: 'Versions ({n})', original: 'original',
  savedVersion: 'Saved. The next run of this step uses it.', syntax: 'Saved, but the Python has a problem: {p}', diffWithPrev: 'Change from the previous version',
  importTitle: 'Import a document', importDesc: 'Pick a file or paste text, then choose how to read it. Chinese is cut into words with jieba; alignments count characters.', paste: 'Or paste text:',
  importGo: 'Import', docName: 'Name', imported: 'Imported {id} ({n} sentences)',
  settingsTitle: 'Settings', keys: 'API keys (kept in this browser only)', roles: 'Models', provider: 'Provider', model: 'Model',
  jevBackend: "Who answers sent_type's closed questions", jevManual: 'I answer them myself',
  jevUrl: 'Jev URL', jevModel: 'Jev model', jevKey: 'Jev key', concurrency: 'Steps run at once', saveSettings: 'Save',
  manualTitle: "Answer Jev's questions ({n})", manualGo: 'Submit', yes: 'yes', no: 'no',
  exported: 'Exported', alignAdded: 'filled in {n} alignments', nothing: 'Nothing to export yet.',
  stopped: 'Stopped', running: 'Running: {what}', doneRun: 'Done, {n} steps', needKey: 'A key is needed: add it in ⚙ Settings.',
};

let lang = null;
try { lang = localStorage.getItem('skillparse_lang'); } catch { /* storage blocked */ }
if (lang !== 'zh' && lang !== 'en') lang = (navigator.language || 'zh').toLowerCase().startsWith('en') ? 'en' : 'zh';

export function getLang() {
  return lang;
}

export function setLang(next) {
  lang = next;
  try { localStorage.setItem('skillparse_lang', next); } catch { /* fine */ }
  document.documentElement.lang = next === 'zh' ? 'zh' : 'en';
}

export function t(key, vars = {}) {
  const dict = lang === 'zh' ? ZH : EN;
  let s = key.split('.').reduce((o, k) => (o ? o[k] : undefined), dict);
  if (s === undefined) s = key.split('.').reduce((o, k) => (o ? o[k] : undefined), EN) ?? key;
  return String(s).replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
}

export function applyStatic(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
}
