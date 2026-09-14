/**
 * Interface language (中文 / English).
 *
 * One flat dictionary, both languages side by side so a translation pair is
 * never split across files and can't drift. `t('key', {vars})` interpolates
 * `{name}` placeholders.
 *
 * Scope note: this covers interface text — chrome, labels, statuses, log and
 * error messages the user actually reads. It deliberately does NOT translate
 * the skill files in `data/skills/`: those are the prompts sent to the model
 * and are part of the annotation methodology, not the UI. Switching the
 * interface to English does not change what the model is asked.
 */

import { state, set, persist } from './state.js';

const D = {
  /* ------------------------------------------------------------- common */
  'common.close': ['关闭', 'Close'],
  'common.save': ['保存', 'Save'],
  'common.cancel': ['取消', 'Cancel'],
  'common.connect': ['连接', 'Connect'],
  'common.disconnect': ['断开', 'Disconnect'],
  'common.select': ['选择', 'Select'],
  'common.none': ['(无)', '(none)'],
  'common.notLoaded': ['未载入文档', 'No document loaded'],
  'common.loading': ['加载中…', 'Loading…'],

  /* ------------------------------------------------------------ toolbar */
  'app.title': ['AI 标注助手', 'AI Annotation Workbench'],
  'toolbar.format': ['标注方式', 'Method'],
  'toolbar.document': ['文档', 'Document'],
  'toolbar.import': ['导入 ▾', 'Import ▾'],
  'toolbar.export': ['导出 ▾', 'Export ▾'],
  'toolbar.studio': ['格式生成器', 'Format studio'],
  'toolbar.mode': ['模式', 'Mode'],
  'toolbar.log': ['日志', 'Log'],
  'toolbar.settings': ['设置', 'Settings'],
  'toolbar.lang': ['语言', 'Language'],
  'toolbar.langTitle': ['切换界面语言', 'Switch interface language'],
  'lang.partial': ['部分翻译，其余显示英文', 'partly translated, the rest shows in English'],
  'mode.replay': ['replay（回放 / 演示）', 'replay (recorded / demo)'],
  'mode.live': ['live（真实调用模型）', 'live (real model calls)'],
  'menu.localFile': ['本地文件（任意类型）', 'Local file (any type)'],
  'menu.drive': ['Google Drive…', 'Google Drive…'],
  'menu.sampleLabel': ['测试用：模拟 Drive 导入未标注文件', 'For testing: simulated Drive import of an unannotated file'],
  'menu.sampleEn': ['示例文档（英文，未标注）', 'Sample document (English, unannotated)'],
  'menu.sampleZh': ['示例文档（中文，未标注）', 'Sample document (Chinese, unannotated)'],
  'menu.sampleWiki': ['维基百科示例（英文，未标注）', 'Wikipedia sample (English, unannotated)'],
  'menu.exportDoc': ['导出标注 JSON', 'Export annotation JSON'],
  'menu.exportProposals': ['导出 skill 更新提案', 'Export skill-update proposals'],

  /* -------------------------------------------------------------- panes */
  'pane.source': ['原始文件', 'Source'],
  'pane.annotated': ['标注后文件', 'Annotated'],
  'pane.assistant': ['AI 标注助手', 'AI assistant'],
  // The small grey word after each pane title is an English gloss for the
  // Chinese heading. In English it would just repeat the heading, so it goes
  // away — except the assistant's, which says something the title does not.
  'pane.sourceGloss': ['source', ''],
  'pane.annotatedGloss': ['annotated', ''],
  'pane.assistantGloss': ['skill call', 'skill call'],
  'pane.chat': ['AI 对话 · rationale 交锋', 'Dialogue · rationale clash'],
  'pane.skills': ['技能', 'Skills'],
  'pane.skillsGloss': ['skills', ''],
  'pane.collapse': ['折叠 / 展开这一栏', 'Collapse / expand this column'],
  'pane.keepOne': ['至少要留一栏展开', 'At least one column has to stay open'],
  'panes.chainHint': ['串联：每一步都作用在整张图上，按顺序执行',
    'Chained: every pass rewrites the whole graph, in order'],
  'panes.legend': ['图例', 'Legend'],
  'panes.serialHint': ['串行：可逐层展开，点击待运行节点标注', 'Serial: expand level by level; click a pending row to annotate'],
  'panes.parallelHint': ['并行：技能相互独立，可任意顺序点击运行', 'Parallel: skills are independent, run them in any order'],
  'panes.artifactView': ['成品视图', 'Result view'],
  'panes.treeTitle': ['标注树（每个节点 = 一次 skill 调用）', 'Annotation tree (each node = one skill call)'],
  'panes.sentenceDone': ['✓ 本句已完成', '✓ sentence complete'],
  'panes.callCount': ['{n} 次调用', '{n} calls'],
  'panes.sentences': ['句子', 'Sentences'],
  'prov.replay': ['真实实验回放', 'recorded experiment replay'],
  'prov.imported': ['导入 · 未标注', 'imported · unannotated'],
  'prov.authored': ['示例数据', 'sample data'],

  /* ----------------------------------------------------------- coverage */
  'cov.title': ['覆盖率回查', 'Coverage back-check'],
  'cov.summary': ['已覆盖 {covered} / 合法省略 {dropped} / 丢失 {lost}',
    'covered {covered} / legitimately dropped {dropped} / lost {lost}'],
  'cov.lostIntro': ['原文中没有被任何节点覆盖的实词：', 'Content words in the source that no node accounts for:'],
  'cov.stepLost': ['↳ {skill}「{span}」丢了：{lost}', '↳ {skill} “{span}” dropped: {lost}'],
  'cov.flagTitle': ['这一步没覆盖到原文里的：{lost}', 'This step does not account for: {lost}'],

  /* --------------------------------------------------------------- tree */
  'kind.discourse': ['篇章关系（第一步）', 'Discourse relation (first step)'],
  'kind.clause': ['从句', 'Clause'],
  'kind.np': ['名词短语', 'Noun phrase'],
  'kind.special': ['特殊实体', 'Special entity'],
  'kind.atomic': ['原子概念', 'Atomic concept'],
  'kind.reentrancy': ['同指消解', 'Reentrancy'],
  'kind.doc_level': ['篇章级标注', 'Document-level'],
  'tree.empty': ['该句还没有标注调用 —— 请稍候', 'No annotation calls for this sentence yet'],
  'tree.pending': ['待运行', 'pending'],
  'tree.running': ['运行中…', 'running…'],
  'tree.blocked': ['有一个标注正在进行，请稍候', 'Another step is running, please wait'],
  'tree.clickToRun': ['点击运行 {skill}', 'Click to run {skill}'],
  'tree.edited': ['人工已修改', 'edited by hand'],
  'tree.atomicHint': ['(代码判定，无需模型)', '(decided in code, no model call)'],
  'tree.srcReplay': ['replay：录制数据回放', 'replay: recorded call'],
  'tree.srcRule': ['代码规则判定，未调用模型', 'decided by a code rule, no model call'],
  'tree.rerunTitle': ['用当前的技能说明重跑这一步（下面的子节点会重新生成）',
    'Run this step again with the current skill instructions (everything below it is regenerated)'],
  'tree.rerunDetail': ['技能说明改动后重跑', 're-run after the skill changed'],
  'tree.swapTitle': ['这一段被判成了别的类型？换一个再跑',
    'Classified as the wrong kind? Re-run it as something else'],
  'tree.swapAs': ['换类型…', 'Run as…'],
  'tree.swapDetail': ['类型判断错误：{from} → {to}', 'Wrong kind: {from} → {to}'],
  'tree.runFailed': ['标注失败：{err}', 'Annotation step failed: {err}'],
  'tree.runFailedLog': ['标注步骤失败（{kind}）：{err}', 'Annotation step failed ({kind}): {err}'],
  'tree.running.log': ['运行 {kind} · "{text}"', 'Running {kind} · "{text}"'],
  'chain.noCode': ['{pass} 说它是代码步骤，但读不到 {file}', '{pass} is a code step but {file} could not be read'],
  'chain.ranCode': ['{pass}：代码步骤，未调用模型', '{pass}: code step, no model call'],
  'chain.codeInput': ['（代码步骤，输入就是上一步的整张图）· {file}',
    '(code step — the input is the whole graph from the previous pass) · {file}'],
  'chain.runRest': ['跑完剩下的', 'Run the rest'],
  'chain.runRestTitle': ['按顺序把剩下的步骤跑完（每一步都要读上一步的图，所以只能串着来）',
    'Run the remaining passes in order (each one reads the graph the last one produced, so they cannot overlap)'],
  'tree.runAll': ['跑完本句', 'Run the rest'],
  'tree.runAllTitle': ['把这一句剩下的待运行位置全部跑完 —— 互不依赖的会并行发出',
    'Resolve every remaining slot in this sentence — independent ones go out in parallel'],
  'tree.sweeping': ['正在跑…', 'running…'],
  'tree.sweepDone': ['跑完 {n} 步，共 {waves} 轮', 'Ran {n} step(s) in {waves} wave(s)'],
  'tree.sweepStalled': ['这一轮什么也没跑出来，已停下：{err}', 'A wave resolved nothing, so the sweep stopped: {err}'],

  /* ---------------------------------------------------------- assistant */
  'assist.empty': ['在中间的标注树里点一个「待运行」节点来标注，或点一个已完成的节点查看它的输入 / 输出 / 判断依据。',
    'Click a pending row in the tree to annotate, or a finished node to inspect its input / output / rationale.'],
  'assist.noResult': ['这一步还没有结果。', 'This step has no result yet.'],
  'assist.skillFile': ['技能定义：{file}', 'Skill definition: {file}'],
  'assist.span': ['作用范围 (span)', 'Span'],
  'assist.input': ['输入 (input)', 'Input'],
  'assist.output': ['输出 (output)', 'Output'],
  'assist.outputEdited': [' — 人工已修改', ' — edited by hand'],
  'assist.rationale': ['模型判断依据 (model rationale)', 'Model rationale'],
  'assist.srcRule': ['代码规则（未调用模型）', 'code rule (no model call)'],
  'assist.editSection': ['人工修改', 'Edit by hand'],
  'assist.editHint': ['改完请在下方对话框写下你的理由——系统会把它与模型的 rationale 做对照，产出 skill 更新提案。',
    'After editing, state your reason in the dialogue below — it is set against the model’s own rationale to produce a skill-update proposal.'],
  'assist.saveEdit': ['保存修改', 'Save edit'],
  'assist.revert': ['还原', 'Revert'],
  'assist.saved': ['已保存人工修改（原始记录保持不变）— 请在下方说明理由以生成 skill 提案',
    'Edit saved (the original record is untouched) — state your reason below to generate a skill proposal'],
  'assist.reverted': ['已还原为模型输出', 'Reverted to the model output'],
  'assist.jsonError': ['JSON 解析失败：', 'Invalid JSON: '],

  /* --------------------------------------------------------------- chat */
  'chat.scopeNode': ['当前针对：', 'Now discussing:'],
  'chat.scopeGeneral': ['未选中节点 — 这是文档级的一般对话', 'No node selected — this is the document-level general thread'],
  'chat.emptyNode': ['这个节点还没有对话。说明你为什么认为它的判断需要改，系统会把它和模型的依据对照，生成 skill 更新提案。',
    'No messages on this node yet. Say why you think its judgement should change — it will be set against the model’s rationale to produce a skill-update proposal.'],
  'chat.emptyGeneral': ['还没有对话。选中一个标注节点可以针对它单独讨论，也可以在这里直接提问。',
    'No messages yet. Select a node to discuss it in its own thread, or just ask a question here.'],
  'chat.placeholderNode': ['说明你为什么认为 {skill} 这里的判断需要改…（Enter 发送，Shift+Enter 换行）',
    'Why should {skill}’s judgement here change? (Enter to send, Shift+Enter for newline)'],
  'chat.placeholderGeneral': ['提问或说明…（Enter 发送）', 'Ask or explain… (Enter to send)'],
  'chat.send': ['发送', 'Send'],
  'chat.micTitle': ['语音输入', 'Voice input'],
  'chat.ttsTitle': ['朗读 AI 回复', 'Read replies aloud'],
  'chat.otherThreads': ['其他节点的对话：', 'Other threads:'],
  'chat.recordIssue': ['记入问题记录', 'Record as an issue'],
  'chat.recorded': ['已记入 {skill} 的问题记录 —— 去技能面板审核后再反思',
    'Recorded against {skill} — review it in the skill panel, then reflect'],
  'chat.applyToSkill': ['应用到技能文件', 'Apply to skill file'],
  'chat.exportMd': ['导出为 .md', 'Export as .md'],
  'chat.applyNoFile': ['这条提案没有对应的技能文件', 'This proposal has no target skill file'],
  'chat.needNode': ['（未选中节点）请先在标注树里点选一个已完成的节点再说明意见；或者切到 live 模式 + 填好 API Key，我可以直接回答一般问题。',
    '(No node selected) Pick a finished node in the tree to argue about, or switch to live mode with an API key and I can answer general questions here.'],
  'chat.callFailed': ['调用失败：{err}', 'Call failed: {err}'],
  'chat.noProposals': ['还没有生成任何 skill 更新提案。', 'No skill-update proposals have been generated yet.'],

  /* ---------------------------------------------------------- log panel */
  'log.title': ['运行日志', 'Activity log'],
  'log.empty': ['还没有活动记录。', 'No activity yet.'],

  /* ----------------------------------------------------------- settings */
  'settings.title': ['⚙ 设置', '⚙ Settings'],
  'settings.apiKeys': ['大模型 API Key（存于本机，可导出为本地文件备份）',
    'Model API keys (stored on this machine; exportable to a local file)'],
  'settings.apiKey': ['API Key', 'API key'],
  'settings.model': ['模型', 'Model'],
  'settings.setDefault': ['设为默认', 'set as default'],
  'settings.driveTitle': ['Google Drive', 'Google Drive'],
  'settings.driveClientId': ['OAuth Client ID', 'OAuth client ID'],
  'settings.drivePlaceholder': ['例如 1234567890-abc.apps.googleusercontent.com',
    'e.g. 1234567890-abc.apps.googleusercontent.com'],
  'settings.tokenPlaceholder': ['ghp_... 或 github_pat_...', 'ghp_... or github_pat_...'],
  'settings.driveHint': ['在 Google Cloud Console 创建 OAuth 客户端 ID（应用类型：桌面应用/Web），本工具没有后端，无法代为保管凭据。',
    'Create an OAuth client ID in the Google Cloud Console. This tool has no backend, so it cannot hold credentials for you.'],
  'settings.githubTitle': ['GitHub', 'GitHub'],
  'settings.githubToken': ['Personal Access Token', 'Personal access token'],
  'settings.githubHint': ['需要 repo 权限的 fine-grained 或 classic token（github.com/settings/tokens）。用于浏览你的仓库/fork、读写标注文件、发起 inter-annotator 合并。',
    'A fine-grained or classic token with repo scope (github.com/settings/tokens). Used to browse your repos/forks, read and write annotation files, and run the inter-annotator merge.'],
  'settings.fileTitle': ['本地凭据文件', 'Local credentials file'],
  'settings.exportFile': ['导出为本地文件', 'Export to a local file'],
  'settings.importFile': ['从本地文件导入', 'Import from a local file'],
  'settings.fileHint': ['所有 key/token 会打包成一个 JSON 文件下载到本地——可以放进你自己的密码管理器或加密文件夹，不会经过任何服务器。',
    'All keys/tokens are packed into one JSON file downloaded to your machine — keep it in your password manager or an encrypted folder. It never passes through any server.'],
  'settings.savedProvider': ['已保存 {name} 设置', 'Saved {name} settings'],
  'settings.savedDrive': ['已保存 Google OAuth Client ID', 'Saved the Google OAuth client ID'],
  'settings.savedGithub': ['已保存 GitHub Token（仅本机）', 'Saved the GitHub token (this machine only)'],
  'settings.imported': ['已从本地文件导入凭据', 'Credentials imported from the local file'],
  'settings.importFailed': ['导入失败：{err}', 'Import failed: {err}'],

  /* ------------------------------------------------------------- github */
  'gh.title': ['GitHub', 'GitHub'],
  'gh.verifying': ['验证中…', 'Verifying…'],
  'gh.tokenHint': ['需要 repo 权限。也可以在「⚙ 设置」里预先填好并保存。',
    'Needs repo scope. You can also save it in Settings beforehand.'],
  'gh.connected': ['已连接：@{login}', 'Connected: @{login}'],
  'gh.repoPlaceholder': ['owner/repo，例如 ai-native-annotator/ai-native-annotator.github.io',
    'owner/repo, e.g. ai-native-annotator/ai-native-annotator.github.io'],
  'gh.browse': ['浏览仓库 / forks', 'Browse repo / forks'],
  'gh.noForks': ['这个仓库还没有 fork。', 'This repository has no forks yet.'],
  'gh.needOwnerRepo': ['请输入 owner/repo', 'Enter owner/repo'],
  'gh.branch': ['分支', 'Branch'],
  'gh.path': ['文件路径', 'File path'],
  'gh.load': ['从此载入标注', 'Load annotation from here'],
  'gh.save': ['保存标注到此分支', 'Save annotation to this branch'],
  'gh.iaa': ['Inter-Annotator 合并…', 'Inter-annotator merge…'],
  'gh.loaded': ['已从 {repo}@{branch} 载入', 'Loaded from {repo}@{branch}'],
  'gh.saved': ['已提交到 {repo}@{branch}', 'Committed to {repo}@{branch}'],
  'gh.savedShort': ['已保存', 'Saved'],
  'gh.noDoc': ['还没有可导出的文档', 'No document to export yet'],
  'gh.saving': ['保存中…', 'Saving…'],

  /* ---------------------------------------------------------------- iaa */
  'iaa.title': ['Inter-Annotator 合并', 'Inter-annotator merge'],
  'iaa.needConnect': ['请先在「GitHub」面板里连接账号，再发起 inter-annotator 合并。',
    'Connect your account in the GitHub panel first, then start an inter-annotator merge.'],
  'iaa.repo': ['仓库', 'Repository'],
  'iaa.path': ['文件路径', 'File path'],
  'iaa.branchA': ['标注者 A 分支', 'Annotator A branch'],
  'iaa.branchB': ['标注者 B 分支', 'Annotator B branch'],
  'iaa.compare': ['比较并尝试合并', 'Compare and try to merge'],
  'iaa.setupHint': ['会先调用 GitHub 的合并 API 尝试真正的 git merge；两份独立标注几乎总会在文本层面冲突（和本地 `git merge` 一样），冲突时下方给出逐节点的可视化冲突解决界面。',
    'It first calls GitHub’s merge API to attempt a real git merge. Two independent annotations almost always conflict at the text level (exactly as a local `git merge` would); on conflict you get a node-by-node resolution view below.'],
  'iaa.needAll': ['请填完 仓库 / 文件路径 / 两个分支', 'Fill in repository, file path and both branches'],
  'iaa.reading': ['正在读取两个分支的标注…', 'Reading both branches…'],
  'iaa.merging': ['正在尝试 git merge…', 'Attempting a git merge…'],
  'iaa.fileMissing': ['其中一个分支上没有找到这个文件', 'One of the branches does not have this file'],
  'iaa.mergedClean': ['git merge：{head} → {base} 自动合并成功（无文本冲突）。',
    'git merge: {head} → {base} merged cleanly (no text conflict).'],
  'iaa.upToDate': ['git merge：{head} 与 {base} 已一致，无需合并。',
    'git merge: {head} and {base} are already identical; nothing to merge.'],
  'iaa.conflict': ['git merge：{head} → {base} 存在文本冲突（与预期一致 —— 两份独立标注很少逐字节相同）。下面按节点逐一裁决，裁决结果会被真正提交到一个新分支。',
    'git merge: {head} → {base} conflicts at the text level (as expected — two independent annotations are rarely byte-identical). Adjudicate node by node below; the result is committed for real to a new branch.'],
  'iaa.statComparable': ['可比节点', 'Comparable nodes'],
  'iaa.statAgree': ['一致', 'Agreements'],
  'iaa.statPct': ['一致率', 'Agreement rate'],
  'iaa.statStructural': ['仅一方存在（结构性分歧）', 'Only on one side (structural)'],
  'iaa.statKappa': ["Cohen's κ (polarity)", "Cohen's κ (polarity)"],
  'iaa.noDisagreement': ['没有发现分歧 —— 两份标注在可比节点上完全一致。',
    'No disagreements — the two annotations match on every comparable node.'],
  'iaa.disagreements': ['分歧节点（{n}）', 'Disagreements ({n})'],
  'iaa.onlyA': ['仅 A 有', 'only in A'],
  'iaa.onlyB': ['仅 B 有', 'only in B'],
  'iaa.absent': ['(不存在)', '(absent)'],
  'iaa.takeA': ['采用 A', 'Take A'],
  'iaa.takeB': ['采用 B', 'Take B'],
  'iaa.takeNeither': ['两者都不用（删除此节点）', 'Neither (drop this node)'],
  'iaa.chosen': ['已选：{choice}', 'chosen: {choice}'],
  'iaa.undecided': ['未裁决 — 暂按 A 处理', 'undecided — defaulting to A'],
  'iaa.deleted': ['删除', 'drop'],
  'iaa.commit': ['提交裁决结果到新分支', 'Commit the resolution to a new branch'],
  'iaa.generating': ['正在生成合并结果…', 'Building the merged result…'],
  'iaa.committed': ['已提交到分支 {branch}。 ', 'Committed to branch {branch}. '],
  'iaa.createPr': ['创建 PR', 'Open a PR'],
  'iaa.committedToast': ['裁决结果已提交', 'Resolution committed'],

  /* ------------------------------------------------------------- studio */
  'studio.title': ['用文字生成标注格式的显示方法', 'Describe an annotation format in words'],
  'studio.formatId': ['格式 id', 'Format id'],
  'studio.idPlaceholder': ['格式 id（英文，如 ner）', 'format id (latin, e.g. ner)'],
  'studio.describe': ['用文字描述这个标注格式怎么显示', 'Describe how this annotation format should be displayed'],
  'studio.descPlaceholder': ['例如：命名实体识别。左边原文逐词一行显示，右边列出识别到的实体及其类型，类型包括人名、地名、机构名，每种类型一个颜色。',
    'e.g. Named-entity recognition. Source on the left, one token per line; on the right list the entities found and their types (person, place, organisation), one colour per type.'],
  'studio.generate': ['生成规格', 'Generate spec'],
  'studio.apply': ['应用为当前格式', 'Apply as current format'],
  'studio.exportSpec': ['导出规格', 'Export spec'],
  'studio.specLabel': ['生成的规格（可直接编辑后再应用）', 'Generated spec (editable before applying)'],
  'studio.notGenerated': ['（尚未生成）', '(not generated yet)'],
  'studio.hint': ['规格是纯数据，不是可执行代码：可以读、可以改、可以提交到 git，渲染器由规格构建而成。',
    'The spec is data, not executable code: readable, editable, committable to git — the renderer is built from it.'],
  'studio.needDesc': ['请先写下格式描述', 'Write the description first'],
  'studio.generating': ['生成中…', 'Generating…'],
  'studio.liveDone': ['live 生成完成', 'Generated by the model'],
  'studio.localDone': ['本地模板生成完成（切换到 live 模式可得到更贴合描述的规格）',
    'Generated from the local template (switch to live mode for a spec that follows your description more closely)'],
  'studio.genFailed': ['生成失败：{err}', 'Generation failed: {err}'],
  'studio.needSpec': ['请先生成规格', 'Generate a spec first'],
  'studio.badSpec': ['规格 JSON 无效：{err}', 'Invalid spec JSON: {err}'],
  'studio.applied': ['已应用生成的格式：{label}', 'Applied the generated format: {label}'],

  /* ---------------------------------------------------------------- app */
  'app.ready': ['就绪', 'ready'],
  'app.docIndexFailed': ['演示语料索引加载失败：{err}', 'Failed to load the demo corpus index: {err}'],
  'app.loadFailed': ['载入失败：{err}', 'Load failed: {err}'],
  'app.docLoaded': ['已载入文档「{id}」', 'Loaded document “{id}”'],
  'app.importedDocs': ['（导入的文档）', '(imported document)'],
  'app.needKey': ['live 模式需要先在设置里填好 API Key', 'Live mode needs an API key — set one in Settings'],
  'app.noDoc': ['还没有载入文档', 'No document loaded yet'],
  'app.liveNoKey': ['live · 未设置 API Key', 'live · no API key'],
  'app.sampleImporting': ['正在模拟 Google Drive 导入未标注 UMR 文件…',
    'Simulating a Google Drive import of an unannotated UMR file…'],
  'app.sampleDone': ['已导入未标注文档 —— 在右侧标注树里点击「待运行」节点，逐个 skill 完成标注。',
    'Unannotated document imported — click the pending rows in the tree to annotate it skill by skill.'],
  'app.missingNode': ['界面元素缺失：{sel} —— 页面上少了这个元素，它的按钮不会有反应（其余功能不受影响）。多半是浏览器缓存了旧的 index.html，请强制刷新（Ctrl/Cmd+Shift+R）。',
    'Missing element: {sel} — that control will not respond (everything else still works). Usually a cached index.html; hard-refresh (Ctrl/Cmd+Shift+R).'],
  'app.missingNodes': ['有 {n} 个界面元素没找到，对应按钮不会有反应 —— 请强制刷新页面（Ctrl/Cmd+Shift+R），详见日志。',
    '{n} interface element(s) missing, so those buttons will not respond — hard-refresh the page (Ctrl/Cmd+Shift+R). See the log.'],
  'app.sampleMissing': ['示例文件缺失：{path}', 'Sample file missing: {path}'],
  'app.demoOption': ['{title} · {n} 句', '{title} · {n} sentences'],
  'app.formatFailed': ['标注方式「{id}」加载失败：{err}', 'Could not load the “{id}” method: {err}'],
  'app.formatSwitched': ['已切换标注方式：{format}（文档「{doc}」不变，原来的标注已保留）',
    'Method switched to {format} — same document “{doc}”, the previous annotation is kept'],
  'app.formatWorked': ['{label} · 已有标注', '{label} · has work'],

  /* --------------------------------------------- provider hints (settings) */
  'provider.anthropic.model': ['例如 claude-sonnet-5 / claude-opus-5 —— 按你账户可用的型号填写',
    'e.g. claude-sonnet-5 / claude-opus-5 — whichever your account can use'],
  'provider.anthropic.key': ['sk-ant-... （在 console.anthropic.com 生成）',
    'sk-ant-... (create one at console.anthropic.com)'],
  'provider.openai.model': ['填写你账户可用的型号 id，例如 gpt-4.1 / gpt-4o',
    'a model id your account can use, e.g. gpt-4.1 / gpt-4o'],
  'provider.openai.key': ['sk-... （在 platform.openai.com 生成）',
    'sk-... (create one at platform.openai.com)'],

  /* --------------------------------------------------- drive / io internals */
  'drive.scriptFail': ['加载失败: {src}', 'Failed to load {src}'],
  'drive.loading': ['加载 Google Identity Services / Picker…', 'Loading Google Identity Services / Picker…'],
  'drive.denied': ['授权被拒绝', 'Authorization was denied'],
  'drive.oauthFail': ['OAuth 失败: {err}', 'OAuth failed: {err}'],
  'drive.oauthLogged': ['Google OAuth 失败：{err}', 'Google OAuth failed: {err}'],
  'drive.oauthOk': ['OAuth 成功，打开文件选择器', 'OAuth succeeded, opening the file picker'],
  'drive.cancelled': ['已取消', 'Cancelled'],
  'drive.reading': ['读取文件 {name}', 'Reading file {name}'],
  'drive.readFail': ['Drive 读取失败: {status} {text}', 'Drive read failed: {status} {text}'],
  'sources.noIndex': ['无法加载演示语料索引 (data/demo/index.json)',
    'Could not load the demo corpus index (data/demo/index.json)'],
  'sources.noDemo': ['无法加载演示文档 {id}', 'Could not load demo document {id}'],
  'sources.noFile': ['未选择文件', 'No file selected'],
  'sources.noSentences': ['JSON 缺少 sentences 字段', 'The JSON has no `sentences` field'],
  'sources.repaired': ['句 {n}：修复了历史录制数据中缺失的 {gaps} 处子调用（现在可在 live 模式下补全）',
    'Sentence {n}: repaired {gaps} sub-call(s) missing from the recorded data (fill them in via live mode)'],
  'sources.exported': ['已导出标注文档「{id}」', 'Exported annotated document “{id}”'],

  /* --------------------------------------------- settings / voice / studio */
  'settings.savedLog': ['本地设置已保存（仅存于本机，不上传任何服务器）',
    'Settings saved locally (this machine only — nothing is uploaded anywhere)'],
  'settings.fileNote': ['AI 标注助手本地凭据备份。请妥善保管，不要提交到公开仓库。',
    'Local credential backup for the AI annotation workbench. Keep it safe; do not commit it to a public repo.'],
  'settings.exportedLog': ['凭据已导出为本地文件', 'Credentials exported to a local file'],
  'voice.recError': ['语音识别出错：{err}', 'Speech recognition error: {err}'],
  'voice.listening': ['开始语音输入…', 'Listening…'],
  'voice.startFailed': ['语音识别启动失败：{err}', 'Could not start speech recognition: {err}'],
  'voice.speakFailed': ['朗读失败：{err}', 'Text-to-speech failed: {err}'],
  'voice.codeBlock': [' （代码块省略） ', ' (code block omitted) '],
  'studio.liveGen': ['live: 生成格式规格 "{id}"', 'live: generating a format spec for "{id}"'],
  'studio.genFailedLog': ['格式生成失败：{err}', 'Format generation failed: {err}'],

  // Format Studio: the labels a generated format shows. They are part of the
  // user's own format, but they are still what the interface displays, so they
  // follow the interface language like everything else.
  'studio.badgeTheme': ['标签视图', 'Badge view'],
  'studio.f.polarity': ['极性', 'Polarity'],
  'studio.f.entities': ['实体', 'Entities'],
  'studio.f.label': ['类别', 'Category'],
  'studio.f.score': ['强度/分数', 'Intensity / score'],
  'studio.f.relations': ['关系', 'Relations'],
  'studio.f.summary': ['摘要', 'Summary'],
  'studio.f.topic': ['主题', 'Topic'],
  'studio.f.generic': ['标注', 'Annotation'],
  'studio.f.describes': ['产出 {label} 字段', 'Produces the {label} field'],
  'studio.f.refine': ['二次标注', 'Second pass'],
  'studio.f.refineDesc': ['在上一层结果之上继续标注', 'Annotate on top of the previous layer'],
  'studio.schema.id': ['string — 格式标识（英文小写）', 'string — format id (lower-case ascii)'],
  'studio.schema.label': ['string — 显示名', 'string — display name'],
  'studio.schema.serial': ['boolean — 是否为串行标注（标注之上再标注）',
    'boolean — serial annotation (annotating on top of annotation)?'],
  'studio.schema.source': ["'tokens' | 'text' — 左侧原文：逐词一行 或 整段文本",
    "'tokens' | 'text' — source pane: one token per line, or running text"],
  'studio.prompt': [
    '你是标注工具的格式设计器。根据用户对某种标注格式的文字描述，\n产出一个 JSON 规格（不要输出任何解释文字，只输出 JSON）。\n规格字段含义：',
    'You design annotation formats for an annotation tool. Given a description of a format,\nproduce a JSON spec (output JSON only — no explanation).\nThe spec fields mean:'],
  'studio.promptId': ['其中 id 必须为 "{id}"。fields 描述标注结果里有哪些字段以及如何显示。',
    'The id must be "{id}". `fields` describes which fields the annotation has and how to show them.'],
  'studio.promptSkills': [
    'skills 是产生这些标注所需的技能拆解——如果这个格式是串行的（标注之上再标注），\nserial 设为 true 并在 skills 里体现层级。legend 给出取值到颜色语义的说明。',
    '`skills` is the decomposition into the steps that produce the annotation — if the format is serial\n(annotation on top of annotation), set serial: true and reflect the layering in skills.\n`legend` explains what each value means.'],
  'studio.promptDesc': ['用户描述：{description}', 'User description: {description}'],

  /* ------------------------------------------------------ runtime / core */
  // Two genuinely different situations, so two messages: a document with no
  // trace at all has nothing to replay anywhere, whereas a recorded document
  // that is missing *this* step is the export gap fillMissingPending() surfaces
  // (see io/sources.js) — telling the user their document is "unannotated"
  // there would be plainly wrong.
  'run.replayNoTrace': [
    'replay 模式没有这一步的录制数据（skill={skill}）。这份文档是新导入/未标注的，没有可回放的历史调用 —— 请切换到「live」模式并在设置里填入你的 API Key 后继续。',
    'Replay mode has no recorded call for this step (skill={skill}). This document is newly imported / unannotated, so there is nothing to replay — switch to live mode and set your API key to continue.'],
  'run.replayGap': [
    'replay 模式没有这一步的录制数据（skill={skill}）。这份文档有 {n} 条录制调用，但当年导出时漏掉了这一步（就是这个「待运行」标记的由来）—— 请切换到「live」模式补全它。',
    'Replay mode has no recorded call for this step (skill={skill}). This document has {n} recorded calls, but this one was dropped when it was exported — that is exactly why this pending marker exists. Switch to live mode to fill it in.'],
  /* ----------------------------------------------------------------- net */
  'net.timeout': ['请求超时（{s} 秒没有响应）：{url}。本地服务器可能已经停了，或者不是在仓库根目录起的。',
    'Request timed out after {s}s: {url}. The local server may have stopped, or was not started in the repository root.'],
  'net.failed': ['请求失败：{url} —— {err}', 'Request failed: {url} — {err}'],

  'skills.liveBadge': ['本地修订已生效', 'local amendment · in effect'],
  'skills.liveHint': ['这段已经追加在该技能的说明后面，下一次调用这个 skill 就会带上它。可在 GitHub 面板提交回仓库。',
    'This is appended to the skill’s instructions, so the next call to it carries the rule. Commit it back through the GitHub panel.'],
  'skills.revertedToast': ['已撤销本地修订，下一次调用恢复原始说明',
    'Local amendment removed — the next call uses the original instructions'],

  /* ------------------------------------------------- refine (chained UMR) */
  'fmt.refine.label': ['UMR 精修（串联式）', 'UMR by refinement (chained)'],
  'fmt.refine.desc': ['先让模型一次性草拟整张 UMR 图，再依次用一串技能逐轮改进整张图。',
    'The model drafts the whole UMR in one shot, then a chain of skills improves the whole graph pass by pass.'],
  'fmt.refine.empty': ['(还没有图 —— 先跑第 1 步 oneshot 草拟)',
    '(no graph yet — run pass 1, oneshot, to draft one)'],
  'refine.skill.oneshot': ['一次性草拟', 'One-shot draft'],
  'refine.skill.roleset': ['义项校正', 'Roleset'],
  'refine.skill.argstruct': ['论元结构', 'Argument structure'],
  'refine.skill.aspect': ['体标注', 'Aspect'],
  'refine.skill.entity': ['实体规整', 'Entities'],
  'refine.skill.reentrancy': ['同指合并', 'Reentrancy'],
  'refine.skill.doclevel': ['篇章级', 'Document level'],
  'refine.skill.validate': ['结构校验', 'Validation'],
  'refine.desc.oneshot': ['一次性产出整张图的初稿，后面几步负责修', 'Draft the entire graph in one call; later passes fix it'],
  'refine.desc.roleset': ['逐个核对谓词义项编号（taste-01 还是 taste-02）', 'Check every predicate sense number'],
  'refine.desc.argstruct': ['按框架核对 :ARG0/:ARG1 等核心角色', 'Check core roles against each frame'],
  'refine.desc.aspect': ['每个事件节点补上且只补一个合法 :aspect', 'Exactly one legal :aspect on every eventive node'],
  'refine.desc.entity': ['人名/地名/日期/数量的标准结构与 :wiki', 'Named entities, dates, quantities, :wiki'],
  'refine.desc.reentrancy': ['同一所指在句内合并成同一个变量', 'One variable per referent within the sentence'],
  'refine.desc.doclevel': ['跨句的时序与情态依赖', 'Cross-sentence temporal and modal dependencies'],
  'refine.desc.validate': ['最后一步：只修结构性错误，不重新标注', 'Last pass: fix structure only, do not re-annotate'],

  'chain.title': ['精修流水线（每一步都作用于整张图）', 'Refinement pipeline (each pass rewrites the whole graph)'],
  'chain.progress': ['{n} / {total} 步', '{n} of {total} passes'],
  'chain.run': ['运行', 'Run'],
  'chain.rerunFrom': ['从这一步重跑（它之后的步骤会作废重来）',
    'Re-run from here (every later pass is discarded and redone)'],
  'chain.rerunDetail': ['从 {pass} 起重跑', 're-ran from {pass}'],
  'chain.blocked': ['要先跑完前面的步骤 —— 它的输入就是上一步的输出',
    'Earlier passes have to run first — this one takes the previous pass’s output'],
  'chain.hint': ['按顺序跑：每一步读上一步产出的整张图，改完再交给下一步。点已完成的步骤看它到底改了什么。',
    'Run them in order: each pass reads the whole graph the previous one produced. Click a finished pass to see exactly what it changed.'],
  'chain.finished': ['全部步骤已完成', 'All passes complete'],
  'chain.noChange': ['无改动', 'no change'],
  'chain.noChangeLong': ['这一步没有改动这张图。', 'This pass left the graph unchanged.'],
  'chain.changes': ['本步改动（{n} 条）', 'Changes in this pass ({n})'],
  'chain.diff': ['整图差异', 'Whole-graph diff'],
  'chain.ran': ['{pass} 完成，{n} 处改动', '{pass} done, {n} change(s)'],
  'chain.failed': ['{pass} 失败：{err}', '{pass} failed: {err}'],
  'chain.noPass': ['没有第 {n} 步', 'No pass at index {n}'],
  'chain.emptyGraph': ['{pass} 没有返回图，已保留上一步的结果',
    '{pass} returned no graph; kept the previous one'],
  'chain.unparseable': ['{pass} 返回的 Penman 解析不了 —— 请检查这一步的输出',
    '{pass} returned Penman that will not parse — check this pass’s output'],

  /* ------------------------------------------------------- skill panel */
  'skills.panelTitle': ['技能（点开看详情）', 'Skills (click for detail)'],
  'skills.tabAbout': ['说明', 'About'],
  'skills.tabFile': ['技能文件', 'Skill file'],
  'skills.tabIssues': ['问题记录', 'Issues'],
  'skills.fileLabel': ['文件', 'File'],
  'skills.identity': ['稳定身份', 'Stable identity'],
  'skills.revision': ['当前版本', 'Active revision'],
  'skills.rollback': ['回退一版', 'Roll back one revision'],
  'skills.rolledBack': ['已回退到上一版，历史记录仍保留', 'Rolled back one revision; history was preserved'],
  'skills.aboutHint': ['这个技能的说明文件就是发给模型的提示词。改它就等于改这一步的判断标准。',
    'This skill’s markdown IS the prompt sent to the model. Changing it changes how this step judges.'],
  'skills.fileHint': ['这就是实际发给模型的说明 —— 直接改，保存后下一次调用就用新的。',
    'These are the instructions actually sent. Edit them; the next call uses what you save.'],
  'skills.fileMissing': ['读不到 {file}', 'Could not read {file}'],
  'skills.noAmendment': ['这个技能目前没有本地修订。', 'No local amendment on this skill.'],
  'skills.tabCode': ['参考实现', 'Reference code'],
  'skills.tabCodeRuns': ['代码（会真的跑）', 'Code (this runs)'],
  'skills.codeHint': ['这个技能是从下面这段代码移植过来的。说明写的是“怎么判断”，代码写的是“当时是怎么做的”，两个一起看才完整。（只读）',
    'The implementation this skill was ported from. The instructions say how to judge; the code says how it was actually done. Read-only.'],
  'skills.codeRunsHint': ['这一步不问模型，直接跑下面这段代码（在沙箱 worker 里，无 DOM、无网络、有超时）。改它就改了这一步的行为。',
    'This step runs the code below instead of asking a model — in a sandboxed worker with no DOM, no network and a deadline. Edit it to change what the step does.'],
  'skills.saveFile': ['保存', 'Save'],
  'skills.restoreOriginal': ['恢复原始文件', 'Restore the original'],
  'skills.savedToast': ['已保存 {file}，下一次调用即生效', 'Saved {file} — in force from the next call'],
  'skills.editedBadge': ['已被人工改写', 'rewritten by hand'],
  'skills.rewritten': ['技能文件已被人工改写：{file}', 'Skill file rewritten by hand: {file}'],

  /* ------------------------------------------------- reflection journal */
  'reflect.pending': ['有 {n} 条待处理的问题记录', '{n} issue(s) awaiting review'],
  'reflect.recorded': ['已记录问题（{kind}）：{skill} · {span}', 'Issue recorded ({kind}): {skill} · {span}'],
  'reflect.reflected': ['已把 {n} 条问题合并反思进 {skill}', 'Folded {n} issue(s) into {skill}'],
  'reflect.persistFailed': ['问题记录写入本地存储失败：{err}', 'Could not save the reflection journal: {err}'],
  'reflect.hint': ['技能不会因为一次修改就立刻更新。每一次人工介入都先记在这里；'
    + '你审核之后（保留 / 忽略），再让它把保留下来的这一批**一起**反思成一条规则。',
    'A skill is never updated on the strength of one correction. Every intervention is recorded here first; '
    + 'you review them (keep / dismiss), then reflection reads the kept batch TOGETHER and writes one rule.'],
  'reflect.none': ['这个技能还没有问题记录。', 'No issues recorded against this skill yet.'],
  'reflect.wholeSentence': ['（整句）', '(whole sentence)'],
  'reflect.keep': ['保留', 'Keep'],
  'reflect.dismiss': ['忽略', 'Dismiss'],
  'reflect.status.kept': ['已保留', 'kept'],
  'reflect.status.dismissed': ['已忽略', 'dismissed'],
  'reflect.status.reflected': ['已反思', 'reflected'],
  'reflect.status.open': ['待审核', 'awaiting review'],
  'reflect.kind.edit': ['人工修改', 'edit'],
  'reflect.kind.rerun': ['重跑', 're-run'],
  'reflect.kind.swap': ['换技能', 'skill swap'],
  'reflect.kind.objection': ['异议', 'objection'],
  'reflect.reflectNow': ['对保留的 {n} 条一起反思', 'Reflect over the {n} kept issue(s)'],
  'reflect.reviewFirst': ['还有 {n} 条没审核 —— 先决定保留还是忽略，才能反思。',
    '{n} issue(s) still unreviewed — keep or dismiss them before reflecting.'],
  'reflect.nothingKept': ['没有保留任何问题，暂时没有可反思的内容。', 'Nothing kept, so there is nothing to reflect on yet.'],
  'reflect.thinking': ['正在归纳这一批问题…', 'Reading the batch…'],
  'reflect.proposed': ['基于 {n} 条问题归纳出的修订（还没生效）', 'Amendment drafted from {n} issue(s) — not yet in force'],
  'reflect.evalPassed': ['结构评测通过：{targeted} 条反馈证据，{holdout} 条回归约束',
    'Structural evaluation passed: {targeted} feedback case(s), {holdout} regression invariant(s)'],
  'reflect.evalFailed': ['结构评测未通过：{targeted} 条反馈证据，{holdout} 条回归约束',
    'Structural evaluation failed: {targeted} feedback case(s), {holdout} regression invariant(s)'],
  'reflect.evalStructural': ['这一步验证证据关联、输出结构和旧说明不被破坏；语义质量仍由人工发布决定。',
    'This gate checks evidence linkage, structure and preservation of prior instructions; a human still decides semantic quality.'],
  'reflect.applyHint': ['确认无误后再应用；应用之后才会进入下一次调用的提示词。',
    'Apply it only when you are satisfied — that is the point at which it enters the next prompt.'],
  'reflect.applyToSkill': ['应用到技能文件', 'Apply to the skill file'],
  'reflect.applied': ['{skill} 已更新，下一次调用生效', '{skill} updated — in force from the next call'],
  'reflect.liveFailed': ['live 反思失败：{err}（已回退到本地汇总）',
    'Live reflection failed: {err} (fell back to the local summary)'],
  'reflect.recordedToast': ['已记入「{skill}」的问题记录，等你审核后再反思',
    'Recorded against “{skill}” — review it, then reflect'],
  'reflect.fromEditor': ['来自助手面板的人工修改', 'hand edit from the assistant pane'],

  /* ------------------------------------------------------------- sandbox */
  'sandbox.unavailable': ['这个环境跑不了沙箱（{err}）—— 自定义导入方法需要 Web Worker，用 http:// 打开页面即可',
    'No sandbox in this environment ({err}) — a custom reader needs a Web Worker; open the page over http://'],
  'sandbox.timeout': ['{entry}() 跑了 {s} 秒还没结束，已终止（多半是死循环）',
    '{entry}() ran for {s}s without finishing and was stopped (usually an endless loop)'],
  'sandbox.threw': ['{entry}() 报错：{err}', '{entry}() failed: {err}'],

  /* ------------------------------------------------------------ importers */
  'imp.title': ['文件导入方法 · {format}', 'How “{format}” reads files'],
  'imp.hint': ['文档是文本，怎么把文件切成句子是可以换的。改这里只影响这一种标注方式，其他方式各自记各自的。',
    'A document is text, and how a file is cut into sentences is a choice. This applies to this method only; every method remembers its own.'],
  'imp.startFrom': ['从现成的开始：', 'Start from:'],
  'imp.plainText': ['纯文本（一行一句）', 'Plain text (one sentence per line)'],
  'imp.conllu': ['CoNLL-U（依存树库）', 'CoNLL-U (dependency treebank)'],
  'imp.loaded': ['已载入「{name}」', 'Loaded “{name}”'],
  'imp.describeTitle': ['① 描述你的文件长什么样', '1. Describe what your files look like'],
  'imp.describeHint': ['例：每段以空行分隔，第一行是编号，正文从第二行开始',
    'e.g. blocks separated by blank lines, first line is an id, text starts on line two'],
  'imp.sampleTitle': ['② 贴一小段真实文件（用来生成，也用来试跑）',
    '2. Paste a piece of a real file (used to draft, and to dry-run)'],
  'imp.sampleHint': ['把文件开头几行贴进来', 'Paste the first few lines of a file'],
  'imp.codeTitle': ['③ 代码（可以直接改）', '3. The code (edit it freely)'],
  'imp.draft': ['让模型写一个', 'Draft one with the model'],
  'imp.drafting': ['正在生成…', 'drafting…'],
  'imp.drafted': ['已生成 —— 先试跑再保存', 'Drafted — dry-run it before saving'],
  'imp.dryRun': ['试跑', 'Dry-run'],
  'imp.running': ['运行中…', 'running…'],
  'imp.needSample': ['先贴一段样例再试跑', 'Paste a sample first'],
  'imp.needDryRun': ['请先用当前代码和样例成功试跑一次',
    'Dry-run the current code and sample successfully first'],
  'imp.ranOk': ['跑通了，切出 {n} 句', 'Ran clean: {n} sentence(s)'],
  'imp.previewTitle': ['切出 {n} 句，语言判定为 {lang}', '{n} sentence(s), language detected as {lang}'],
  'imp.tokenCount': ['{n} token', '{n} tokens'],
  'imp.andMore': ['……还有 {n} 句', '…and {n} more'],
  'imp.save': ['保存为本格式的导入方法', 'Use this for this method'],
  'imp.revert': ['恢复内置', 'Back to the built-in'],
  'imp.savedToast': ['已保存 {format} 的导入方法', 'Saved the reader for {format}'],
  'imp.clearedToast': ['已恢复内置导入方法', 'Back to the built-in reader'],
  'imp.refusedSave': ['没保存 —— 它在你贴的样例上就跑不通：{err}',
    'Not saved — it fails on the sample you pasted: {err}'],
  'imp.inUse': ['正在使用自定义导入方法（{when} 保存）', 'Using a custom reader (saved {when})'],
  'imp.usingBuiltin': ['正在使用内置导入方法', 'Using the built-in reader'],
  'imp.saved': ['{format} 的导入方法已更新', 'Reader updated for {format}'],
  'imp.cleared': ['{format} 恢复为内置导入方法', '{format} is back to the built-in reader'],
  'imp.used': ['用自定义导入方法读入 {format}：{n} 句', 'Read with the custom {format} reader: {n} sentence(s)'],
  'imp.missing': ['导入方法文件缺失：{file}', 'Reader file missing: {file}'],
  'imp.failed': ['自定义导入方法失败，导入已停止：{err}',
    'The custom reader failed, so the import was stopped: {err}'],
  'imp.notObject': ['导入方法必须返回一个对象', 'The reader must return an object'],
  'imp.noSentences': ['返回值里没有 sentences 数组', 'The returned value has no `sentences` array'],
  'imp.empty': ['一句都没切出来', 'It produced no sentences'],
  'imp.customName': ['自定义', 'Custom'],
  'menu.importer': ['文件导入方法…', 'File reader…'],

  /* ---------------------------------------------------------- human edits */
  'edits.applied': ['已采用人工修改：{skill} · {span}', 'Human correction applied: {skill} · {span}'],
  'edits.reverted': ['已还原模型原始输出：{skill} · {span}', 'Reverted to the model output: {skill} · {span}'],
  'edits.penmanParse': ['Penman 解析失败：请检查括号是否配对，格式形如 (x1 / concept :role value)',
    'Could not parse the Penman: check the parentheses. Shape is (x1 / concept :role value)'],
  'edits.ignoredConcept': ['子节点 {role} 的 concept 不能在这里改成 {concept} —— 请在标注树里选中它自己再改',
    'The concept of child {role} cannot be changed to {concept} here — select that child in the tree'],
  'edits.ignoredMissing': ['子节点 {role} 不能在这里删除 —— 它是一次独立的 skill 调用，请在标注树里处理',
    'Child edge {role} cannot be deleted here — it is its own skill call; use the annotation tree'],
  'edits.rolesChanged': ['改写了 {n} 条子节点的关系标签', 'Relabelled {n} child edge(s)'],
  'edits.slotsAdded': ['标注树新增了 {n} 个待运行位置', 'Added {n} pending slot(s) to the annotation tree'],
  'edits.slotsFilled': ['{n} 个位置已由人工写好，不再需要展开', '{n} slot(s) written by hand — no longer need expanding'],
  'edits.tabPenman': ['Penman', 'Penman'],
  'edits.tabJson': ['JSON', 'JSON'],
  'edits.penmanHint': ['直接改 concept、关系标签和常量值。<np: 短语> 是还没展开的待运行位置：'
    + '把它改写成 (x / concept) 就算你自己标好了，左边那一行随之消失；新写一个 <np: 短语> 则会多出一个待运行位置。'
    + '已经跑过的子节点也写作 (x / concept)，在这里只能改它的关系标签。',
    'Edit the concept, the roles and the constant values. <np: phrase> is a pending slot: replace it with '
    + '(x / concept) and it counts as annotated (the row on the left disappears); write a new <np: phrase> '
    + 'to add a slot. A child that has already run also shows as (x / concept), and only its role is editable here.'],
  'edits.ignoredSome': ['已保存，但有 {n} 处没能应用：', 'Saved, but {n} part(s) could not be applied:'],
  'edits.savedShown': ['已保存 —— 右侧「标注后文件」已同步更新',
    'Saved — the annotated result on the right is updated'],

  /* ------------------------------------------------------------- pipeline */
  // Rationales for steps the *code* decided (no model call) and the warnings
  // for malformed model output. They show up in the assistant pane and the
  // activity log, so they are interface text, not annotation content.
  'pipe.atomicRationale': ['原子概念：单个词/代词/数字，代码直接判定为叶子节点，未调用模型。',
    'Atomic concept: a single word / pronoun / number, decided in code as a leaf — no model call.'],
  'pipe.specialFallback': ['special_entity 未返回合法节点（{phrase}），回退为 string-entity',
    'special_entity returned no valid node ({phrase}); falling back to string-entity'],
  'pipe.npFallback': ['np_phrase 未返回合法节点（{phrase}），回退为原文小写拼接',
    'np_phrase returned no valid node ({phrase}); falling back to the lower-cased source text'],
  'pipe.argFallback': ['arguments 未返回合法节点，回退为 {concept}',
    'arguments returned no valid node; falling back to {concept}'],
  'pipe.forcedAtomic': ['深度达到 {depth}（上限 {max}），代码强制作为 atomic 处理，未再展开。',
    'Depth {depth} reached the limit of {max}; forced to atomic in code, not expanded further.'],
  'pipe.forcedNp': ['深度达到 {depth}（超过 clause 递归上限 {max}），代码强制降级为 np 处理。',
    'Depth {depth} exceeded the clause recursion limit of {max}; downgraded to np in code.'],
  'pipe.reentSkipInput': ['(节点数 < 3，代码判定跳过)', '(fewer than 3 nodes — skipped in code)'],
  'pipe.reentSkip': ['句内节点少于 3 个，跳过同指消解（与后端规则一致）。',
    'Fewer than 3 nodes in the sentence, so reentrancy is skipped (same rule as the backend).'],
  'pipe.reentMerged': ['已合并 {n} 组同指。', 'Merged {n} coreference group(s).'],
  'pipe.defaultAttrs': ['代码为 {n} 处缺失的 :aspect/:modstr 补上了默认值。',
    'Code filled in default :aspect/:modstr on {n} node(s).'],
  'pipe.notFound': ['找不到这个节点', 'Node not found'],
  'pipe.notPending': ['这个节点不是待处理状态（可能已被其他操作解析）。',
    'This node is not pending any more (something else may have resolved it).'],

  'run.noJson': ['模型响应中没有找到合法 JSON（原始响应前 300 字：{body}）',
    'No valid JSON in the model response (first 300 chars: {body})'],
  'provider.needKey': ['{name} 需要 API Key —— 请在设置里填写（只存本机，不上传任何服务器）',
    '{name} needs an API key — set it in Settings (stored on this machine only)'],
  'provider.netFail': ['{name} 请求失败（网络错误或被浏览器拦截，常见原因：无网络 / 广告拦截器 / CORS）：{err}',
    '{name} request failed (network error or blocked by the browser — no connection, an ad blocker, or CORS): {err}'],
  'provider.unknown': ['未知的模型提供方: {id}', 'Unknown model provider: {id}'],
  'provider.emptyAnthropic': ['Anthropic 返回了空响应（可能被截断或触发了安全过滤）',
    'Anthropic returned an empty response (possibly truncated or filtered)'],
  'provider.emptyOpenai': ['OpenAI 返回了空响应', 'OpenAI returned an empty response'],
  'gh.notConnected': ['尚未连接 GitHub —— 请先在设置里填入 Personal Access Token。',
    'Not connected to GitHub — set a personal access token in Settings first.'],
  'gh.bad401': ['GitHub Token 无效或已过期（401）。', 'GitHub token is invalid or expired (401).'],
  'gh.netFail': ['GitHub API 请求失败（网络错误或被拦截）：{err}',
    'GitHub API request failed (network error or blocked): {err}'],
  'gh.verifyingToken': ['验证 Token…', 'Verifying token…'],
  'gh.verifyFailed': ['Token 验证失败', 'Token verification failed'],
  'gh.connectedLog': ['已连接 GitHub：@{login}', 'Connected to GitHub as @{login}'],
  'gh.notAList': ['响应不是预期的列表', 'the response was not the expected list'],
  'gh.forksFailed': ['获取 {repo} 的 fork 列表失败：{err}', 'Could not list forks of {repo}: {err}'],
  'gh.branchesFailed': ['获取 {repo} 的分支列表失败：{err}', 'Could not list branches of {repo}: {err}'],
  'gh.repoMissing': ['找不到仓库 {repo}', 'Repository {repo} not found'],
  'gh.prFailed': ['创建 PR 失败：{err}', 'Could not create the pull request: {err}'],
  'gh.prCreated': ['已创建 PR #{n}：{url}', 'Opened PR #{n}: {url}'],
  'gh.readFailed': ['读取 {repo}:{path} 失败', 'Could not read {repo}:{path}'],
  'gh.readingLog': ['读取 {repo}/{path}@{ref}', 'Reading {repo}/{path}@{ref}'],
  'gh.fileMissing': ['{repo} 上没有找到 {path}', '{path} does not exist in {repo}'],
  'gh.writeFailed': ['写入 {repo}:{path} 失败', 'Could not write {repo}:{path}'],
  'gh.committed': ['已提交 {repo}:{path} @ {branch}', 'Committed {repo}:{path} on {branch}'],
  'gh.branchMissing': ['找不到源分支 {branch}', 'Source branch {branch} not found'],
  'gh.branchFailed': ['创建分支 {branch} 失败', 'Could not create branch {branch}'],
  'gh.branchReady': ['分支就绪：{branch}', 'Branch ready: {branch}'],
  'gh.merging': ['尝试合并 {head} → {base}', 'Attempting to merge {head} → {base}'],
  'gh.mergeOk': ['合并成功，无冲突', 'Merged cleanly, no conflicts'],
  'gh.mergeUpToDate': ['{base} 已是最新，无需合并', '{base} is already up to date, nothing to merge'],
  'gh.mergeConflict': ['{head} → {base} 存在冲突，需人工调解',
    '{head} → {base} conflicts — a human has to adjudicate'],
  'gh.mergeOdd': ['合并请求返回意外状态 {status}', 'The merge request returned an unexpected status: {status}'],
  'drive.needClientId': ['请先在「设置」里填入你自己的 Google OAuth Client ID —— 本工具没有后端，不能替你保管凭据。',
    'Set your own Google OAuth client ID in Settings — this tool has no backend and cannot hold credentials for you.'],
  'sources.imported': ['已导入未标注文档「{id}」，共 {n} 句，标注树为空 —— 可以开始逐技能标注。',
    'Imported unannotated document “{id}”, {n} sentences, empty annotation tree — ready to annotate skill by skill.'],
  'skills.applied': ['已应用修订到 {file} —— 下一次调用该 skill 就会带上这条规则',
    'Amendment applied to {file} — the next call to that skill will carry this rule'],
  'skills.reverted': ['已撤销 {file} 的本地修订', 'Reverted the local amendment to {file}'],
  'skills.amendHeading': ['## 人工修订（本地生效，尚未合入仓库）',
    '## Human amendments (active locally, not yet merged into the repo)'],

  /* ----------------------------------------------------------- pipeline */
  'pipe.atomicRationale': ['原子概念：单个词/代词/数字，代码直接判定为叶子节点，未调用模型。',
    'Atomic concept: a single word / pronoun / number, decided in code as a leaf — no model call.'],
  'pipe.forcedAtomic': ['深度达到 {depth}（上限 {max}），代码强制作为 atomic 处理，未再展开。',
    'Depth {depth} reached the limit of {max}; forced to atomic in code, not expanded further.'],
  'pipe.forcedNp': ['深度达到 {depth}（超过 clause 递归上限 {max}），代码强制降级为 np 处理。',
    'Depth {depth} exceeds the clause recursion limit of {max}; downgraded to np in code.'],
  'pipe.skillMissing': ['技能文件缺失，已跳过：{path}', 'Skill file missing, skipped: {path}'],

  /* -------------------------------------------------------------- voice */
  'voice.startFailed': ['语音识别启动失败：{err}', 'Could not start speech recognition: {err}'],
  'voice.speakFailed': ['朗读失败：{err}', 'Text-to-speech failed: {err}'],

  /* ------------------------------------------------------------ formats */
  'fmt.umr.label': ['UMR（统一意义表示）', 'UMR (Uniform Meaning Representation)'],
  'fmt.umr.desc': ['串行标注：句子→树→树内结构再标注，每层展开由一个 skill 负责',
    'Serial annotation: sentence → tree → annotate inside the tree again; each expansion is one skill'],
  'fmt.umr.emptyArtifact': ['(尚未标注 — 在右侧「标注树」里点击第一个待处理节点开始)',
    '(not annotated yet — click the first pending row in the tree to start)'],
  'fmt.umr.docLevel': ['篇章级标注 (doc-level)', 'Document-level annotation'],
  'fmt.sentiment.label': ['情感标注（简单格式示例）', 'Sentiment (simple-format example)'],
  'fmt.sentiment.desc': ['并行标注：每句一次性从左到右；三个 skill 相互独立，可任意顺序点击运行',
    'Parallel annotation: three independent skills per sentence, runnable in any order'],
  'fmt.sentiment.empty': ['(尚未标注 — 在右侧标注树里点击 polarity / aspect / intensity 开始)',
    '(not annotated yet — click polarity / aspect / intensity in the tree to start)'],
  'fmt.empty': ['(尚未标注)', '(not annotated yet)'],
  'skill.discourse': ['篇章关系', 'Discourse'],
  'skill.predicate': ['核心谓词', 'Predicate'],
  'skill.arguments': ['论元与属性', 'Arguments & attributes'],
  'skill.np_phrase': ['名词短语', 'Noun phrase'],
  'skill.special_entity': ['特殊实体', 'Special entity'],
  'skill.stop_test': ['停止判定', 'Stop test'],
  'skill.reentrancy': ['同指消解', 'Reentrancy'],
  'skill.doc_level': ['篇章级标注', 'Document level'],
  'skill.polarity': ['整体极性', 'Overall polarity'],
  'skill.aspect': ['方面级情感', 'Aspect-level sentiment'],
  'skill.intensity': ['强度', 'Intensity'],
  'desc.discourse': ['判断句子顶层是否为并列/从属结构，并切分出各子句跨度',
    'Decide whether the top of the sentence is coordination/subordination and split the clause spans'],
  'desc.predicate': ['在抽象概念与动词词元之间选择核心谓词，给出 PropBank 候选词元',
    'Choose the core predicate between an abstract concept and a verb lemma, with PropBank candidates'],
  'desc.arguments': ['选定义项、挂载论元与修饰语、填 :aspect/:modstr 等属性',
    'Pick the sense, attach arguments and modifiers, set :aspect/:modstr'],
  'desc.np_phrase': ['识别（可能隐含的）中心词、命名实体、代词指称属性',
    'Identify the (possibly implicit) head, named entities and pronoun reference attributes'],
  'desc.special_entity': ['日期、数量、区间、URL、比分等特殊文本的子树',
    'Subtrees for dates, quantities, ranges, URLs, scores and similar special text'],
  'desc.stop_test': ['判断一个短语是否还需要继续分解（仅在上游 skill 未给出合法 kind 时才会被调用）',
    'Decide whether a phrase needs further decomposition (only called when an upstream skill gave no valid kind)'],
  'desc.reentrancy': ['句内代词/控制/零形回指合并为同一变量',
    'Merge in-sentence pronouns / control / dropped arguments into one variable'],
  'desc.doc_level': ['跨句时序、情态、共指依赖', 'Cross-sentence temporal, modal and coreference dependencies'],
  'desc.polarity': ['一次性判定整句极性 positive/negative/neutral/mixed 及置信度',
    'Judge the sentence polarity (positive/negative/neutral/mixed) and confidence in one pass'],
  'desc.aspect': ['抽取评价对象（aspect）及其各自极性——整体极性之上的第二层标注',
    'Extract evaluated targets and their individual polarity — a second layer above overall polarity'],
  'desc.intensity': ['给出 1–5 的情感强度与触发词', 'Give a 1–5 intensity and the trigger words'],
  'legend.discourse': ['篇章关系切分', 'discourse segmentation'],
  'legend.predicate': ['核心谓词/义项', 'core predicate / sense'],
  'legend.arguments': ['论元+属性（可再展开）', 'arguments + attributes (expandable)'],
  'legend.np_phrase': ['名词短语（可再展开）', 'noun phrase (expandable)'],
  'legend.special_entity': ['日期/数量等', 'dates, quantities, …'],
  'legend.reentrancy': ['句内同指', 'in-sentence coreference'],
  'legend.doc_level': ['跨句依赖', 'cross-sentence dependencies'],
  'legend.stop': ['停止分解（代码判定，未调用模型）', 'stop (decided in code, no model call)'],
  'legend.positive': ['正面', 'positive'],
  'legend.negative': ['负面', 'negative'],
  'legend.neutral': ['中性', 'neutral'],
  'legend.mixed': ['褒贬混合', 'mixed'],
  'legend.aspectNote': ['方面级第二层标注', 'second-layer aspect annotation'],
  'theme.badges': ['标签视图', 'Badges'],
  'sent.aspects': ['方面级', 'Aspects'],
  'sent.intensity': ['强度 {n}/5', 'intensity {n}/5'],
  'sent.confidence': ['置信 {n}', 'confidence {n}'],
  'sent.triggers': ['触发词：', 'Triggers: '],
  'sent.aspectCount': ['{n} 个方面', '{n} aspect(s)'],
  'sent.noDiscourse': ['单句（无篇章关系）', 'single clause (no discourse relation)'],
  'sent.hasDiscourse': ['并列/从属：{what}', 'coordination/subordination: {what}'],
  'sent.subordinate': ['从属', 'subordination'],
  'sent.present': ['有', 'yes'],
  'sent.mergeCount': ['合并 {n} 组同指', 'merged {n} coreference group(s)'],
  'sent.noMerge': ['无同指', 'no coreference'],
  'sent.docCounts': ['时序{t} 情态{m} 共指{c}', 'temporal {t}, modal {m}, coref {c}'],
};

/**
 * The languages on offer.
 *
 * `zh` and `en` live in the pair above, side by side, so those two can never
 * drift apart. Any further language is a separate file under core/locales/
 * exporting a flat {key: string} map, loaded on demand — adding a language is
 * dropping in one file and adding one line here, with no change to any pane.
 *
 * `coverage` is stated honestly and shown in the picker: a locale that only
 * covers part of the interface falls back to English per missing key, and the
 * user should know that before choosing it rather than discover it.
 */
export const LOCALES = [
  { id: 'zh', name: '中文', htmlLang: 'zh', index: 0 },
  { id: 'en', name: 'English', htmlLang: 'en', index: 1 },
  { id: 'ja', name: '日本語', htmlLang: 'ja', file: 'ja', coverage: 'partial' },
];

export const LANGS = LOCALES.map((l) => l.id);
const localeOf = (id) => LOCALES.find((l) => l.id === id);
const overlays = new Map();     // lang id -> {key: string}

/** Load a file-backed locale. Built-in languages need nothing. */
export async function loadLocale(id) {
  const loc = localeOf(id);
  if (!loc?.file || overlays.has(id)) return;
  try {
    const mod = await import(`./locales/${loc.file}.js`);
    overlays.set(id, mod.default || {});
  } catch (err) {
    // A missing or broken locale file must not take the interface down: fall
    // back to English and say so, rather than leaving every label as a raw key.
    overlays.set(id, {});
    console.error(`[i18n] locale "${id}" failed to load, falling back to English`, err);
  }
}

export function t(key, vars) {
  const entry = D[key];
  const loc = localeOf(state.lang);
  let s;
  if (loc?.file) {
    // file-backed: its own string, else English, else the key itself
    s = overlays.get(state.lang)?.[key] ?? entry?.[1] ?? key;
  } else {
    s = entry ? entry[loc?.index ?? 0] : key;
  }
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}


export async function setLang(lang) {
  if (!LANGS.includes(lang) || lang === state.lang) return;
  await loadLocale(lang);
  set({ lang }, 'lang');
  persist();
  document.documentElement.lang = localeOf(lang)?.htmlLang || 'en';
}

/** First-run default: follow the browser unless the user has chosen before. */
export function detectLang() {
  const nav = (navigator.language || 'en').toLowerCase();
  const match = LOCALES.find((l) => nav.startsWith(l.id));
  return match ? match.id : 'en';
}

/** Translate static markup: any element carrying data-i18n / data-i18n-title. */
export function applyStaticI18n(root = document) {
  for (const node of root.querySelectorAll('[data-i18n]')) {
    node.textContent = t(node.dataset.i18n);
  }
  for (const node of root.querySelectorAll('[data-i18n-title]')) {
    node.title = t(node.dataset.i18nTitle);
  }
  document.title = t('app.title');
  document.documentElement.lang = localeOf(state.lang)?.htmlLang || 'en';
}
