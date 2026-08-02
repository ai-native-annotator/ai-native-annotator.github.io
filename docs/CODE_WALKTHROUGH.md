# 代码详解：`js/` 目录里每个文件在干什么

这份文档面向"我要能改这个项目"的读者。读完你应该能回答三个问题：**数据长什么样**、**点一下按钮之后发生了什么**、**我想改 X 该动哪个文件**。

建议顺序：先读第 0～3 章（约 15 分钟，是理解一切的钥匙），再把第 4 章当字典查。

---

## 目录

- [第 0 章：预备知识 —— localStorage 是什么](#第-0-章预备知识--localstorage-是什么)
- [第 1 章：全局地图](#第-1-章全局地图)
- [第 2 章：三个核心数据结构](#第-2-章三个核心数据结构)
- [第 3 章：一次点击的完整生命周期](#第-3-章一次点击的完整生命周期)
- [第 4 章：逐文件详解](#第-4-章逐文件详解)
  - [4.1 `core/` 基础设施](#41-core-基础设施)
  - [4.2 `formats/` 标注格式](#42-formats-标注格式)
  - [4.3 `io/` 数据来源](#43-io-数据来源)
  - [4.4 `ui/` 界面](#44-ui-界面)
  - [4.5 顶层文件](#45-顶层文件)
- [第 5 章：想改 X 该动哪里（速查表）](#第-5-章想改-x-该动哪里速查表)
- [第 6 章：已知简化与边界](#第-6-章已知简化与边界)

---

## 第 0 章：预备知识 —— localStorage 是什么

**一句话**：localStorage 是浏览器给每个网站准备的一个小储物柜，存的是纯文本的"键 → 值"对，关掉浏览器、重启电脑都还在，而且**只有这个网站自己能打开这个柜子**。

### 关键性质

| 性质 | 说明 |
|---|---|
| **存在哪** | 你自己电脑的硬盘上，浏览器的配置文件目录里。不在任何服务器上。 |
| **谁能读** | 只有**同源**（协议 + 域名 + 端口完全一致）的页面。`https://ai-native-annotator.github.io` 存的东西，`https://evil.com` 读不到——这是浏览器强制的"同源策略"，不是靠自觉。 |
| **能存多久** | 永久，直到代码删掉它、或你手动清浏览器数据。（对比 `sessionStorage`：关掉标签页就没了。） |
| **能存多大** | 每个源大约 5–10 MB。存几个 API key 绰绰有余。 |
| **能存什么** | **只能存字符串**。所以代码里到处是 `JSON.stringify` 存进去、`JSON.parse` 读出来。 |
| **会不会自动发给服务器** | **不会**。这是它和 Cookie 最大的区别——Cookie 会自动带在每个 HTTP 请求头里发出去，localStorage 不会，除非代码显式读出来再发。 |

### 用法长这样

```js
localStorage.setItem('annotator_secrets', JSON.stringify({ apiKeys: {...} }));  // 存
const saved = JSON.parse(localStorage.getItem('annotator_secrets') || '{}');    // 读
localStorage.removeItem('annotator_secrets');                                   // 删
```

### 本项目一共用了三个键

| 键名 | 内容 | 写在哪个文件 |
|---|---|---|
| `annotator` | UI 偏好：运行模式、主题、当前格式、默认厂商、模型名 | `core/state.js` |
| `annotator_secrets` | 所有凭据：各厂商 API Key、模型、Drive Client ID、GitHub Token | `core/settings.js` |
| `gdrive_client_id` | Google OAuth Client ID（和上面那个键里的重复存了一份，因为 `io/drive.js` 会直接读它，不想为了拿一个 id 去依赖 settings 模块） | `core/settings.js` + `io/drive.js` |

### 安全上该知道的实话

- **好的一面**：key 不经过任何我控制的服务器，我看不到；同源策略挡住了别的网站；你随时能在浏览器里一键清掉。
- **需要注意的一面**：localStorage 是**明文**的。同一台电脑上能打开你浏览器的人，按 F12 就能看到 key。如果这个页面上有 XSS 漏洞（能注入恶意 JS），那段 JS 也能读到 localStorage——这也是为什么本项目所有把用户内容放进 HTML 的地方都强制走 `esc()` 转义（见 `core/dom.js`）。
- **所以**：不要在公用电脑上填 key；GitHub Token 请用最小权限并定期轮换；设置面板里的「导出为本地文件」就是给你一条正经的备份/迁移路径，而不是让你依赖浏览器的储物柜。

### 怎么亲眼看看

浏览器按 F12 → Application（Chrome）/ 存储（Firefox）→ Local Storage → 选中本站域名，右边就是那三个键的原文。

---

## 第 1 章：全局地图

### 分层与依赖方向

依赖**只能从上往下**（上层可以 import 下层，下层绝不 import 上层）。这条规则是整个代码库能保持清爽的唯一纪律。

```
                    app.js  ← 启动、接线、订阅
                       │
        ┌──────────────┼───────────────┐
        ▼              ▼               ▼
      ui/*          formats/*         io/*        ← 会说话的三层
   （画界面）      （某种标注怎么显示）  （文档从哪来）
        │              │               │
        └──────────────┼───────────────┘
                       ▼
                    core/*                        ← 不知道界面存在的引擎
        state  registry  pipeline  flat  runner
        providers  settings  penman  log  dom
```

### 28 个文件一句话速览

**`core/` —— 引擎，不碰 DOM 样式，不知道有哪些面板**

| 文件 | 一句话 |
|---|---|
| `dom.js` | 造 DOM 元素、转义 HTML、下载文件的小工具 |
| `log.js` | 统一日志出口：写进 state、同时打到控制台 |
| `state.js` | 全局状态对象 + 极简发布订阅 |
| `settings.js` | 凭据的本地读写、导出/导入 |
| `providers.js` | Anthropic / OpenAI 的请求格式适配 |
| `runner.js` | 一次 skill 调用：replay 查录制 / live 发请求 + 抽 JSON |
| `registry.js` | 格式注册表（懒加载）+ skill 定义构造器 |
| **`pipeline.js`** | **UMR 递归标注流程（全项目最重要的文件）** |
| `flat.js` | 并行格式（非递归）的单步执行 |
| `penman.js` | Penman ⇄ JSON 双向转换 |

**`formats/` —— "这种标注长什么样"**

| 文件 | 一句话 |
|---|---|
| `umr.js` | UMR：串行递归，8 个 skill，JSON/Penman 两种成品视图 |
| `sentiment.js` | 情感：并行，3 个 skill，标签/JSON 两种视图 |
| `declarative.js` | 用 JSON 规格描述的格式 → 现场构造出一个格式对象 |

**`io/` —— 文档从哪来、到哪去**

| 文件 | 一句话 |
|---|---|
| `sources.js` | 内置语料、本地文件、文档规范化（**历史数据修复在这里**）、导出 |
| `drive.js` | Google Drive OAuth + 文件选择器 |
| `github.js` | GitHub REST API 封装（读写文件、分支、合并、PR） |

**`ui/` —— 界面**

| 文件 | 一句话 |
|---|---|
| `toast.js` | 底部一闪而过的提示条 |
| **`tree.js`** | **标注树；"待运行"行的点击入口** |
| `panes.js` | 三个面板的外壳 + 图例 + 句子条 |
| `assistant.js` | 选中节点的输入/输出/依据 + 人工修改框 |
| `chat.js` | 对话 + rationale 交锋 → skill 提案 |
| `studio.js` | 格式生成器弹窗 |
| `log-panel.js` | 右侧运行日志抽屉 |
| `settings-panel.js` | 设置弹窗 |
| `github-panel.js` | GitHub 连接/浏览/读写弹窗 |
| `iaa.js` | 标注者一致性 = git merge 的完整流程 |

**顶层**

| 文件 | 一句话 |
|---|---|
| `voice.js` | 语音输入（识别）+ 朗读（合成） |
| `app.js` | 启动、把按钮接到函数上、把状态变化接到重绘上 |

---

## 第 2 章：三个核心数据结构

**这一章是全文最重要的部分。** 只要这三个东西看明白了，剩下的代码基本是自解释的。

### 2.1 文档对象（Document）

不管来自内置语料、本地 txt、Drive 还是 GitHub，最终都被 `io/sources.js` 的 `parseDocument()` 归一成同一个形状：

```js
{
  id: 'english_umr-0003',          // 文档标识
  format: 'umr',                   // 用哪个格式渲染
  language: 'en',                  // 'en' | 'zh'，决定加载哪份语言 overlay
  provenance: 'imported: xxx.txt', // 来历，句子条右端显示
  sentences: [ Sentence, ... ],
  _trace: Map                      // 仅内存：replay 模式的查询索引，导出时会剥掉
}
```

一个 **Sentence**：

```js
{
  index: 1,                  // 1 起数的句号
  text: 'The museum opened…',
  tokens: ['The','museum',…],// 左栏逐词显示用
  graph: '',                 // 老式录制数据里的 Penman 字符串（新流程不写它）
  docAnnotation: '',         // 篇章级标注文本，doc_level 跑完后填
  annotation: {},            // 并行格式（情感等）的结果都堆在这里
  tree: [ TreeNode | PendingMarker, ... ]   // ← 标注树，核心
}
```

### 2.2 已解析节点（TreeNode）—— "一次 skill 调用"

**标注树里每一个已完成的节点 = 一次真实发生过的 skill 调用。** 这是整个工具的核心隐喻。

```js
{
  skill: 'arguments',        // 哪个 skill 干的；'(stop)'=代码判定，'(ref)'=同指引用
  span: 'The museum opened…',// 这次调用负责的文本范围
  input: '## PropBank…',     // 喂给模型的任务输入原文（助手面板"输入"栏）
  output: { concept: 'open-01', relations: [...] },  // 模型返回的 JSON
  rationale: 'sense -01 …',  // 模型自己给的理由（助手面板"判断依据"栏）
  source: 'live',            // 'live'=真调模型 | 'replay'=回放录制 | 'rule'=纯代码判定
  model: 'claude-sonnet-5',
  latencyMs: 1234,
  role: ':ARG0',             // 它在父节点里挂哪个关系上（顶层节点为 null）
  children: [ … ]            // 这次调用又派生出的下一层（可能是已解析的，也可能是待运行的）
}
```

`output.relations` 是 `[角色, 值]` 的数组，值有三种：

```js
[':aspect', 'performance']                                    // 常量
[':ARG0',  { concept: 'museum', relations: [] }]              // 内嵌节点
[':ARG1',  { expand: true, phrase: 'a new exhibit', kind: 'np' }]  // ★ 待展开叶子
```

第三种就是下面这个东西的来源。

### 2.3 待运行标记（PendingMarker）—— **整个修复的关键**

```js
{
  pending: true,      // ← 界面靠这个字段决定画成可点的"待运行"行
  kind: 'np',         // 待办类型：discourse|clause|np|special|atomic|reentrancy|doc_level
  phrase: 'a new exhibit',  // 要标注的文本
  role: ':ARG1',      // 解析完之后挂在父节点的哪个关系上
  depth: 2,           // 递归深度，用于强制终止
  sub: null           // 从属结构专用：额外要挂上的关系（如 :condition 子句）
}
```

**为什么这个设计是关键**：模型返回 `{"expand": true, …}` 的意思就是"这一块我没做完，交给下一个 skill"。旧原型在导出数据时把这些"没做完"的位置直接丢了，于是树上看不到、也没法继续做。现在的做法是：**任何一个 `expand:true` 都必须变成一个看得见、点得动的行**。同一个机制同时解决两件事：

1. 新文档从零标注 → 一路点下去，树自己长出来；
2. 旧录制数据的窟窿 → 在 `io/sources.js` 的 `fillMissingPending()` 里被扫出来，同样变成待运行行，可以在 live 模式下当场补完。

### 2.4 路径（path）

树里定位一个节点用**下标数组**：`[0, 2, 1]` = 第 0 个顶层节点 → 它的第 2 个孩子 → 那个孩子的第 1 个孩子。`pathKey([0,2,1])` → `'0.2.1'`，用作 Map 的键（记录人工修改、折叠状态、运行中状态）。

---

## 第 3 章：一次点击的完整生命周期

以「点击一个待运行的名词短语节点」为例，完整走一遍。

```
① 用户点击 .pending-row
   ui/tree.js  pendingRow() 的 onclick
        │
        ▼
② ui/tree.js  runPending()
   · 若已有别的调用在跑 → 直接返回（同一时刻只允许一个）
   · state.running.add(runKey) → set({},'tree') → 该行变成 ◐ 旋转，其他行变灰
        │
        ▼
③ core/pipeline.js  runPendingAt(doc, sentenceIndex, path)
   · getAt() 按 path 取出那个 PendingMarker
   · 按 marker.kind 分派 → resolvePendingLeaf()
        │
        ▼
④ core/pipeline.js  resolvePendingLeaf() → resolveByKind('np', …)
   · taskNpPhrase()  拼出"任务输入"文本
   · buildPrompt()   技能文件 + 语言 overlay + 节点 schema + 任务输入
        │
        ▼
⑤ core/runner.js  runSkillCall()
   · replay 模式 → 查 doc._trace，查不到就抛一个说明清楚的错误
   · live 模式  → core/providers.js  callProvider()
        │
        ▼
⑥ core/providers.js  fetch('https://api.anthropic.com/v1/messages')
   浏览器直连厂商 API，带上 localStorage 里的 key
        │
        ▼
⑦ core/runner.js  extractJson(响应文本) → output
   任何一步失败：logError 记进日志 + 原样抛出（绝不吞掉）
        │
        ▼
⑧ core/pipeline.js
   · resultNode()          包成 TreeNode
   · scanPendingChildren() 扫 output.relations 里的 expand:true → 新的 PendingMarker
   · setAt()               写回树里那个位置
   · advanceSentence()     看看整句是否该排下一个顶层待办（reentrancy / doc_level）
        │
        ▼
⑨ ui/tree.js  finally: state.running.delete() + set({...}, 'tree','artifact','selectedNode')
        │
        ▼
⑩ app.js  subscribe() 里注册的监听器被触发
   'tree'         → 重绘标注树 + 句子条
   'artifact'     → 重绘成品视图（Penman/JSON 立刻反映新结果）
   'selectedNode' → 助手面板显示这次调用的输入/输出/依据
```

**如果第 ⑥ 步失败**（网络断了 / key 错了 / 模型返回不是 JSON）：错误从 ⑦ 一路原样抛到 ②，`ui/tree.js` 那唯一一个 `catch` 负责：写进日志抽屉、弹一条红色 toast、把行恢复成可点状态。**整条链路上只有这一处 catch**——这是刻意的，为的就是错误不会在中途被谁悄悄咽下去。

---

## 第 4 章：逐文件详解

### 4.1 `core/` 基础设施

---

#### `core/dom.js` — DOM 小工具（约 45 行）

全项目唯一被允许直接拼 HTML 的地方，所以转义逻辑集中在这里。

| 导出 | 作用 |
|---|---|
| `$(sel, root)` | `querySelector` 的简写 |
| `$$(sel, root)` | `querySelectorAll` → 真数组 |
| `esc(s)` | 把 `& < > " '` 转成 HTML 实体。**任何用户/模型内容进 HTML 前都必须过这一道** |
| `el(tag, attrs, ...children)` | 元素构造器，全项目造 DOM 都用它 |
| `jsonHtml(value, indent)` | JSON 转字符串 → 转义 → 四条正则给键/字符串/数字/字面量套上高亮 span |
| `download(filename, text, type)` | 触发浏览器下载 |
| `fmtMs(ms)` | `840` → `"840ms"`；`1500` → `"1.5s"` |

**`el()` 的规则**（读代码时经常要回来查）：

```js
el('div', { class: 'x' }, '文字')     // class → className
el('div', { html: '<b>…</b>' })       // html → innerHTML（内容必须已 esc 过！）
el('button', { onclick: fn })         // on* + 函数 → addEventListener
el('input', { disabled: true })       // true → 空属性 disabled=""
el('input', { value: null })          // null/undefined/false → 整个属性跳过
el('div', {}, a, [b, c], null, d)     // children 无限展平，null/undefined/false 跳过
                                      // 非 Node 自动包成文本节点（自带转义）
```

`download()` 的实现细节：`new Blob([text])` → `URL.createObjectURL` → 造一个隐藏 `<a download>` → `click()` → 立刻 `remove()` 并 `revokeObjectURL` 释放内存。

---

#### `core/log.js` — 统一日志出口（约 35 行）

**这个文件是"不许静默失败"这条原则的落地点。**

```js
logEvent(level, source, message, detail)
```

1. 组装 `{ts, level, source, message, detail}` 推进 `state.log`；
2. 超过 `MAX_LOG = 500` 条就从头丢弃（防止长时间使用吃内存）；
3. `set({}, 'log')` 通知日志面板刷新（右上角红色计数徽章也靠它）；
4. **同时**按级别打到 `console.error / warn / log`，并把 `detail`（通常是原始 Error 对象，带堆栈）一起带上——所以开发时 F12 能看到完整堆栈，普通用户在日志抽屉里能看到人话。

| 导出 | 说明 |
|---|---|
| `logInfo / logWarn / logError` | 三个级别的包装 |
| `describeError(err)` | 从 `Error` / 字符串 / 任意对象里榨出一句人能读的话，避免界面上出现 `[object Object]` |

---

#### `core/state.js` — 全局状态 + 发布订阅（约 75 行）

没有用任何框架。整个应用状态是**一个可变对象** + **一个 `key → 监听器集合` 的 Map**。

**`state` 的每个字段**：

| 字段 | 含义 |
|---|---|
| `formatId` | 当前格式 id（`'umr'` / `'sentiment'` / 生成的） |
| `doc` | 当前文档对象 |
| `docIndex` | 内置语料索引（`data/demo/index.json`） |
| `selectedSentence` | 当前句子下标 |
| `selectedNode` | `{path, node}`，助手面板显示的那个节点 |
| `collapsed` | `Set<pathKey>`，**用户手动折叠**过的节点。默认全展开，折叠是主动行为 |
| `theme` | 成品视图主题（`json` / `penman` / `badges`） |
| `runMode` | `'replay'` \| `'live'` |
| `provider` | 当前默认厂商 id |
| `apiKeys` | `{厂商 → key}`，`settings.js` 从 localStorage 灌进来 |
| `models` | `{厂商 → 模型名}` |
| `running` | `Set<runKey>`，正在跑的调用（画旋转图标、禁用其他行） |
| `edits` | `Map<pathKey → 人工改过的 output>` |
| `proposals` | 本次会话产生的 skill 更新提案 |
| `chat` | 对话消息数组 |
| `log` | 活动日志数组 |
| `github` | `{token, user, owner, repo, branch}` |
| `voice` | `{ttsEnabled, listening}` |

**四个函数**：

- `on(key, fn)` — 订阅；返回一个取消订阅的函数。
- `emit(...keys)` — 挨个 key 调用它的监听器。
- `set(patch, ...keys)` — `Object.assign(state, patch)` 然后 `emit`。**不传 key 时默认用 `patch` 自己的键名**，所以 `set({runMode:'live'})` 会自动触发 `'runMode'` 的监听器；而 `set({}, 'tree')` 是"我直接改了嵌套内容，请重绘树"的惯用写法。
- `pathKey(path)` / `currentSentence()` — 两个小助手。

**持久化**：只有 `PERSIST = ['runMode','theme','formatId','provider','models']` 这五项写进 localStorage 的 `annotator` 键。**API Key 和 GitHub Token 刻意不在这里**——它们归 `settings.js` 管，存在自己的键里，这样才能整体导出成一个文件。

---

#### `core/settings.js` — 凭据的本地存取（约 85 行）

| 导出 | 作用 |
|---|---|
| `loadSecrets()` | 启动时调用：读 `annotator_secrets` → 与默认值合并 → 灌进 `state.apiKeys / models / github.token` |
| `saveSecrets(patch)` | 读当前值 → 合并 patch → 写 localStorage → 同步进 state → 记一条日志 |
| `setApiKey(provider, key)` / `setModel(provider, model)` | 单项修改的语法糖 |
| `exportSecretsFile()` | 把所有凭据 + 时间戳 + 一句提醒打包下载成 `annotator-credentials.json` |
| `importSecretsFile(file)` | 反过来：读文件 → `JSON.parse` → `saveSecrets` |

一个细节：`driveClientId` 被**存了两份**——一份在 `annotator_secrets` 里（为了能整体导出），一份在自己的 `gdrive_client_id` 键里（为了 `io/drive.js` 能直接读，不必依赖 settings 模块）。`saveSecrets` 负责让两份保持同步。

---

#### `core/providers.js` — 大模型厂商适配（约 90 行）

一张表 `PROVIDERS`，每个厂商一项：

```js
{
  label: 'Anthropic (Claude)',
  defaultModel: 'claude-sonnet-5',
  modelHint: '…',  keyHint: '…',      // 设置面板里的输入框提示
  async complete({ apiKey, model, prompt, maxTokens, signal }) → 返回纯文本
}
```

- **anthropic**：`POST /v1/messages`，认证头 `x-api-key`，必须带 `anthropic-version: 2023-06-01`，以及 `anthropic-dangerous-direct-browser-access: true`——**最后这个头是浏览器能直连的原因**，没有它 Anthropic 会拒绝来自浏览器的跨域请求。响应把 `content[]` 里所有 `.text` 拼起来。
- **openai**：`POST /v1/chat/completions`，`Authorization: Bearer`。**故意没有默认模型**——各账户可用型号不同，与其写死一个可能已过时的名字，不如强制用户填，填之前直接报错说清楚。

`fetchSafe(url, init, label)` 把两类失败翻译成人话：网络层异常（断网/被拦截/CORS）→ 一句中文说明；HTTP 非 2xx → 带上状态码和响应体前 300 字。`AbortError` 原样放行（那是主动取消，不是错误）。

`callProvider(id, {...})` 是唯一出口：查表 → 检查 key 在不在 → 转发。

---

#### `core/runner.js` — 一次 skill 调用（约 120 行）

夹在"拼提示词"（pipeline）和"发请求"（providers）之间。

**`extractJson(text)`** — 从模型回复里挖出 JSON，三级降级：

1. 先找 ` ```json … ``` ` 代码块，有就取里面的；
2. 直接 `JSON.parse` 整段；
3. 从第一个 `{` 或 `[` 开始做**括号配平扫描**（正确处理字符串内的括号和 `\"` 转义），找到配平点再 parse。

三级都失败 → **抛错**，错误信息里带响应前 300 字。注意这里不返回 `{_raw: …}` 兜底，因为静默返回一个假对象正是那种"看起来成功了其实什么也没做"的坑。

**`runSkillCall({skillId, span, prompt, language})`**

- **replay 分支**：拿 `${skillId} ${span}` 去 `doc._trace` 里查。查不到 → 记日志 + 抛出一句**说明了下一步该干什么**的错误："这份文档是新导入/未标注的，没有可回放的历史调用——请切换到 live 模式并填入 API Key"。
- **live 分支**：从 state 取厂商/key/模型 → `performance.now()` 掐表 → `callProvider` → `extractJson`。两处失败都是**先 `logError` 再原样 `throw`**（记录 ≠ 吞掉）。

统一返回：`{output, rationale, rawText, latencyMs, source, model}`。

---

#### `core/registry.js` — 格式注册表（约 55 行）

```js
const loaders = { umr: () => import('../formats/umr.js'), sentiment: … };
```

`loadFormat(id)` 懒加载并缓存；`registerRuntimeFormat(format)` 给格式生成器用——把一个运行时造出来的格式对象塞进注册表，后续和内置格式完全平等。

> ⚠️ **一个必须记住的坑**：`loadFormat` 注册的是 `mod.default`。所以格式模块的**具名导出对 UI 完全不可见**。今天就是因为 `sentiment.js` 把 `pendingSlots` / `runSkill` 写成了具名导出，导致并行格式的待运行行一个都不显示（内置演示数据三个 skill 都已完成，所以表面看不出来，但任何新文档都没法标注）。修复方式是把它们移到 default 对象上，两个格式文件里都加了注释警示。

`defineSkill({id, label, file, describes, serial, llm})` 只是给 skill 定义对象一个统一形状，`id` 与后端 Python 模块名一一对应。

---

#### `core/pipeline.js` — UMR 递归流程（约 660 行，**全项目最重要**）

这是 `modular-parsing` 里 `umr_parser/pipeline.py` + `modules/*.py` 的浏览器移植版。分七块读。

**① 常量与元数据**

`MAX_DEPTH = 6`（超过这个深度，clause 不再递归，强制降级成 np）、`FORCE_ATOMIC_DEPTH = 8`（再深就一律当叶子）——两个数字和 Python 版完全一致。`SKILL_META` 记录每个 skill 用哪个技能文件、要不要附节点 schema。

**② 素材加载**

- `fetchText(path)` — 带缓存地读 `data/` 下的技能文件；读不到只记 warn 并返回空串（少一份 overlay 不该让整个流程崩掉）。
- `buildPrompt(skillId, language, taskInput)` — 把**技能文件 + 语言 overlay + （可选）节点 schema + 任务输入**用 `\n\n---\n\n` 拼起来。这个拼接顺序和 Python 侧 `SkillModule.build_prompt()` 一致，所以 live 模式发出去的提示词和后端跑实验时是同一份。

**③ 任务输入构造器**（`taskDiscourse` / `taskPredicate` / `taskArguments` / `taskNpPhrase` / `taskSpecialEntity` / `taskStopTest` / `taskReentrancy`）

逐字对应 Python 各模块 `run()` 里拼的那段 task 字符串。`framesReference()` 负责组装谓词的义项参考：抽象概念查 `abstract_rolesets.json`；普通动词——因为浏览器版没有搬运 PropBank 词典——改成明确告诉模型"本地没有词典，请用你知道的标准义项编号，拿不准就 `-01`"。**诚实地告诉模型缺什么，好过假装有。**

**④ 纯代码规则**（不调模型的部分）

- `quickStopTest(phrase, language)` — 移植自 `phrase.py`：英文单词且是代词 → `np`；含数字/URL → `special`；否则单词 → `atomic`。中文：代词表命中 → `np`；≤3 字且无数字 → `atomic`。判断不了返回 `null`（这才轮到 stop_test skill 出场）。
- `atomicConcept(phrase, language)` — 剥标点，英文转小写连字符化，中文去空格。

**⑤ 树的装配**

- `makePendingMarker({kind, phrase, role, depth, sub})` — 造待运行标记。
- `pendingFromPairs(pairs, depth)` / `scanPendingChildren(output, depth)` — **扫 `relations` 里所有 `expand:true`，变成待运行标记**。这两个小函数是整个"标注能继续下去"的心脏。
- `resultNode(skillId, span, input, res, children)` — 把 runner 的返回包成 TreeNode。

**⑥ 四种解析路径 —— `resolveByKind(kind, marker, ctx)`**

| kind | 干什么 |
|---|---|
| `atomic` | **不调模型**。直接造一个 `(stop)` 节点，`source: 'rule'`，rationale 里写明"代码直接判定"。这就是为什么树上会有灰色的 `(stop)` 节点 |
| `special` | 调 `special_entity` skill。返回没有 `concept` → 回退成 `string-entity` 并记 warn |
| `np` | 调 `np_phrase` skill。同样有回退 + warn |
| `clause` | **连调两次**：先 `predicate` 定谓词，把结果喂给 `arguments` 建事件节点。`arguments` 的结果是主节点，`predicate` 作为它的**第一个子节点**挂上去（所以树上能看到那次调用真的发生过），并扫出论元的待运行叶子 |

**⑦ `resolvePendingLeaf(marker, ctx)` —— 解析一个叶子的完整逻辑**

1. **深度强制**：depth ≥ 8 → 强制 atomic；depth ≥ 6 且是 clause → 降级 np。**两种情况都会把原因写进节点的 rationale**，而不是悄悄降级。
2. **kind 兜底**：如果上游 skill 没给出合法 kind，先试 `quickStopTest`（代码规则），还判断不了才调 `stop_test` skill，并把这次调用也作为子节点挂上去。
3. **`sub` 合并**：从属结构（如 `:condition` 子句）的额外关系在这里挂到节点上，并扫出对应的待运行叶子。
4. 记下 `role`，供成品视图重建图时使用。

**⑧ 其余三个顶层 skill**

- `resolveDiscourse(ctx)` — 判断句子顶层结构。返回 `has_discourse:false` → 整句当一个 clause 处理；`structure.expand === true`（从属）→ 主句变一个待运行叶子，`sub` 带着从属关系；否则（并列）→ `structure` 本身是个概念节点，它的 relations 全是待运行子句。
- `resolveReentrancy(ctx)` — 先 `assignIds()` 给所有内容节点编号（`e1, e2…`），少于 3 个节点直接跳过（和后端规则一致，`source: 'rule'`）；否则把节点清单交给模型判同指，用 `replaceWithRef()` 把重复节点原地换成 `{ref: 'e3'}` 标记；最后 `applyDefaultAttributes()` 给所有事件节点补上缺失的 `:aspect` / `:modstr`，补了几处也写进 rationale。
- `resolveDocLevel(ctx)` — 收集本句变量 + 之前所有句子的变量登记表，喂给模型。**注意：情态三元组和 DCT 时序锚定是纯代码算的，模型输出在这两项上被有意忽略**（和后端一致——实验发现模型自创的情态链会拉低精度）；模型只贡献最多 2 条额外时序和 4 条共指，且必须引用已知变量，否则丢弃。最后 `renderDocAnnotation()` 渲染成 UMR 的篇章级文本块。

**⑨ 排程 —— `advanceSentence(sentence)`**

每次解析完都会调一次，幂等。逻辑：树是空的 → 放一个 `discourse` 待办；discourse 说没有篇章关系且还没有内容节点 → 插一个整句 clause 待办；所有内容都解析完了 → 依次排 `reentrancy`、`doc_level`。`sentenceDone()` 判断 doc_level 是否已完成（句子条上打勾用）。

**⑩ 成品视图重建**

`rootContentNode(sentence)` 找出图的根，`graphNodeOf(n)` 递归把"调用树"翻译成 `penman.js` 认识的"图节点"形状：常量关系直接留下，有 `role` 的子节点递归转换，**待运行的位置转成 `{expand:true}`**（于是 Penman 视图里会显示成 `<np: a new exhibit>`）。所以**成品视图任何时刻都精确反映"目前做到哪了"**，包括做了一半的状态。

**⑪ 入口 —— `runPendingAt(doc, sentenceIndex, path)`**

UI 唯一调用的函数：取出标记 → 按 kind 分派 → `setAt()` 写回 → `advanceSentence()`。每个分支要么返回节点要么抛错，不吞异常。

---

#### `core/flat.js` — 并行格式的单步执行（约 40 行）

UMR 之外的格式（情感、生成的格式）不需要递归，用这个简单得多的机制：

- `runFlatSkill(skillDef, sentence, language)` — 读技能文件（带缓存）→ 拼一句任务输入 → `runSkillCall` → **把返回的字段合并进 `sentence.annotation`** → 包成 TreeNode 返回。
- `flatPendingSlots(skills, sentence)` — 哪些 skill 还没在 `sentence.tree` 里出现过，就为它们各造一个待运行标记。所以三个 skill 从一开始就全部可点，任意顺序都行。

---

#### `core/penman.js` — Penman ⇄ JSON（约 120 行）

Penman 是 UMR/AMR 的标准文本格式：`(x1 / open-01 :ARG0 (x2 / museum))`。

| 导出 | 作用 |
|---|---|
| `parsePenman(text)` | 手写递归下降解析器。`skipWs` / `readToken`（正确处理带引号的常量）/ `parseNode`。遇到不认识的东西跳过而不是崩溃 |
| `toPenman(node, indent, depth)` | 反向：节点树 → 带缩进的 Penman 文本 |
| `toJson(node)` | 节点树 → 适合展示的 JSON（`{var, concept, relations:[{role, value}]}`） |
| `definedVars(node)` | 收集所有定义过的变量名 |
| `reentrancies(node)` | 被引用但没在此处定义的变量 = 同指目标（Penman 视图里高亮它们） |
| `nodeToPenman(node, …)` | **给实时标注树用的版本**：待运行位置渲染成 `<np: 短语>`，`{ref}` 渲染成变量名，所以半成品也能正常显示 |

---

### 4.2 `formats/` 标注格式

一个格式对象要提供：`id / label / skills / serial / themes / skillColor() / renderSource() / renderArtifact() / renderExtra() / nodeSummary() / legend()`；并行格式还要额外提供 `flat: true / pendingSlots() / runSkill()`。

---

#### `formats/umr.js`（约 140 行）

- `SKILLS` — 8 个 skill 的定义，`file` 指向 `data/skills/shared/*.md` 真实路径（助手面板会显示，提案会引用）。
- `SKILL_COLOR` — 每个 skill 一个颜色，标注树上的彩色小标签和左侧图例共用。
- `renderSource(sentence)` — 左栏：逐词一行，带行号。
- `renderArtifact(sentence, theme)` — 先试 `rootContentNode()` 拿实时树；有就 `graphNodeOf → nodeToPenman`，再按主题输出 Penman 原文或转成 JSON。没有实时树才回退到老式 `sentence.graph`；两者都没有就显示"尚未标注"。Penman 主题下还会用正则给概念/角色/同指变量套上高亮。
- `renderExtra(sentence)` — 篇章级标注块（优先取 doc_level 节点的结果）。
- `nodeSummary(node)` — 决定树上每行右边那句摘要：discourse 显示有无篇章关系，predicate 显示选中的概念，reentrancy 显示合并了几组，doc_level 显示各类三元组数量，其余显示 concept。

---

#### `formats/sentiment.js`（约 100 行）

并行格式的样板。三个 skill（polarity / aspect / intensity）各自往 `sentence.annotation` 里塞字段。

`renderArtifact` 两种主题：标签视图（彩色极性徽章 + 方面级列表 + 触发词）和 JSON。空标注时显示引导语。

> 关键行：`flat: true`、`pendingSlots`、`runSkill` **必须写在 default 导出对象里**（见 `registry.js` 那条坑），文件里有注释说明原因。

---

#### `formats/declarative.js`（约 175 行）

让"用一段话描述一种标注格式"变成可运行的东西。

- `SPEC_SCHEMA` — 规格的字段说明，同时用于文档和提示词。
- `buildFormat(spec)` — 吃一份 JSON 规格，吐出一个完整格式对象（自动配色、渲染函数、并行执行契约）。**注意这里不用 `eval` 或 `new Function`**：规格是纯数据，可读、可手改、可提交 git，格式写错最多退化成 JSON 视图，不会让页面崩掉。
- `specFromDescription(text, id)` — 离线兜底：关键词匹配猜字段（"极性"→ badge 字段、"实体"→ list 字段…）。粗糙是故意的，它的存在只是保证没有 API Key 时功能也能走通。
- `specPrompt(description, id)` — live 模式下让模型填同一份 schema 的提示词。

---

### 4.3 `io/` 数据来源

---

#### `io/sources.js` — 文档进出 + **历史数据修复**（约 210 行）

| 导出 | 作用 |
|---|---|
| `listDemos()` / `loadDemo(id)` | 读 `data/demo/` 下的内置语料 |
| `openLocalFile()` | 弹出文件选择器 → 读文本 → `parseDocument` |
| `parseDocument(text, filename)` | **归一化入口**：以 `{` 开头当作本工具的 JSON 格式；否则当纯文本，每个非空行一句，自动分词（有空格按空格切，中文按字切），`tree: []` 表示未标注 |
| `exportDocument()` / `exportDocumentFile()` | 导出：剥掉 `_trace`，加上导出时间、人工修改清单、skill 提案清单 |

**`normalizeDoc(doc)` —— 每份文档载入后必经的一步**，做三件事：

1. `fillMissingPending(tree)` — **旧数据修复**：遍历每个已解析节点，把它 `output` 里那些"模型说了要展开、但树上没有对应子节点"的位置（按 phrase 精确匹配判断是否已存在）补成待运行标记，并记一条 warn 说明补了几处。**这就是旧原型里那些"消失的 skill 调用"重新出现的地方。**
2. `advanceSentence(s)` — 给每句排好下一个待办（空文档就是排上第一个 discourse）。
3. `buildTraceIndex(doc)` — 建 `${skill} ${span} → 录制结果` 的 Map，挂到 `doc._trace` 上，供 replay 模式查询。导出时会被 `stripTrace` 剥掉。

---

#### `io/drive.js` — Google Drive（约 90 行）

- `loadScript(src)` — 按需插 `<script>`（Google 的两个 SDK 在真正用到 Drive 之前不加载，所以离线也能正常用工具的其他部分）。
- `driveClientId()` / `setDriveClientId(id)` — 读写那个单独的 localStorage 键。
- `importFromDrive()` — 完整流程：检查有没有填 Client ID（没有就抛一句解释清楚的错）→ 加载 GIS + GAPI → `initTokenClient` 弹授权 → `PickerBuilder` 弹文件选择器 → `GET /drive/v3/files/{id}?alt=media` 取原文 → **交给 `parseDocument`**。

最后一步是重点：Drive 来的文件和本地文件、GitHub 文件走的是**同一个解析函数**，所以一份未标注的 UMR 文件不管从哪来，结果都是"左栏有原文、标注树为空、等你点第一个 discourse"。

---

#### `io/github.js` — GitHub REST 封装（约 210 行）

**为什么用 PAT 而不是 OAuth 授权码流程**：GitHub 的 token 换取端点不支持跨域请求，纯静态站点没有后端去完成那一步换取。PAT 是"你自己签发、可随时吊销、权限可控"的等价物——和 Drive 要求"填你自己的 OAuth Client ID"是同一种权衡。

**两层请求封装**：`gh()` 负责加认证头、把网络异常翻译成人话、把 401/403 转成明确错误；`ghJson()` 在其上解析 JSON，并**放行 404 和 409**（这两个状态码是有意义的业务结果，不是错误——404 = 文件不存在，409 = 合并冲突）。

| 导出 | 作用 |
|---|---|
| `connectGithub(token)` | 验证 token（`GET /user`）。**失败时会把 token 回滚**——否则一个已知无效的 token 会留在 state 里，后面每次调用都用它 |
| `disconnectGithub()` / `isConnected()` | 断开 / 查询连接状态 |
| `listForks` / `getRepo` / `listBranches` | 列表接口，都会检查返回确实是数组（错误响应是对象，直接当数组用会得到莫名其妙的报错） |
| `listNetwork(owner, repo)` | 给定任意一个仓库，找到它的**上游 origin**（如果它本身是 fork）+ 所有 fork |
| `getFile(o, r, path, ref)` | 读文件，返回 `{text, sha}`（sha 是后续覆盖写入必须的），404 返回 `null` |
| `putFile(…, sha)` | 写文件（提交一次 commit） |
| `createBranch(o, r, new, from)` | 建分支；**422 视为成功**（分支已存在） |
| `mergeBranches(o, r, base, head, msg)` | **真正的 git merge**：201=合并成功，204=已是最新，409=冲突 |
| `createPullRequest(…)` | 发 PR |

`decodeBase64Utf8` / `encodeBase64Utf8`：GitHub Contents API 收发的是 base64，而 `atob`/`btoa` 只处理 Latin-1，直接用会**弄坏中文**。所以中间要过一道 `TextEncoder`/`TextDecoder`。

---

### 4.4 `ui/` 界面

---

#### `ui/toast.js`（约 15 行）

`toast(message, isError, ms)` — 往 `#toast` 里塞一条消息，加 `.show` 触发 CSS 过渡，定时移除。用模块级 `hideTimer` 保证连续弹多条时后一条会重置计时。

---

#### `ui/tree.js` — 标注树 + **点击入口**（约 160 行）

| 函数 | 作用 |
|---|---|
| `renderTree(container, format)` | 入口。并行格式：`已解析节点 + format.pendingSlots()` 拼一起；UMR：直接用 `sentence.tree` |
| `nodeEl(node, path, format)` | 画一个**已解析**节点：折叠三角 + 彩色 skill 标签 + 标题 + 摘要 + 来源圆点（绿=live/蓝=replay/灰=rule）+ 人工修改铅笔标 |
| `pendingRow(marker, path, format)` | 画一个**待运行**行：▶ 图标 + 类型名 + 角色 + 短语 + "待运行"。运行中变 ◐ 并旋转；有别的调用在跑时变灰不可点 |
| `runPending(...)` | **第 3 章那条链路的起点**，见下 |
| `expandAll()` | 清空折叠集合（切句子时调用） |

**折叠状态的设计**：`state.collapsed` 记录的是**用户主动折叠过的**节点，默认全展开。（早期版本反过来记"展开过的"，导致要写双重否定判断，读起来很别扭，后来改掉了。）

**`runPending()` 的结构**：

```js
if (state.running.size) return;       // 同一时刻只允许一个调用
state.running.add(runKey); set({}, 'tree');   // 立刻反映到界面
try {
  并行格式 → format.runSkill(...) → push 进 tree
  UMR     → runPendingAt(...)     → 树被就地更新
  set({...}, 'tree','artifact','selectedNode');  // 三个面板一起刷新
} catch (err) {
  logError(...); toast(...);        // ← 全链路唯一的 catch
} finally {
  state.running.delete(runKey); set({}, 'tree');  // 无论成败都恢复可点
}
```

---

#### `ui/panes.js` — 面板外壳（约 85 行）

面板本身与格式无关，只管滚动、标题、主题切换，具体内容全部委托给格式模块。

- `renderSource` / `renderLegend` / `renderAnnotated` / `renderSentenceBar`。
- `renderAnnotated` 的结构：主题切换条 → 成品视图（`format.renderArtifact`）→ `renderExtra` → 标注树标题（显示调用次数、完成打勾）→ 标注树。
- `renderSentenceBar` 给每个句子一个圆片，已完成的加绿色 ✓（UMR 看 `sentenceDone()`，并行格式看 `annotation` 是否非空）。

---

#### `ui/assistant.js` — 助手面板（约 110 行）

显示选中节点的**全过程**：skill 标签 + 中文名 + 来源徽章（live 还会显示模型名和耗时）→ 技能描述 → 技能文件路径 → 作用范围 → **输入原文** → 输出 JSON → 模型判断依据 → 人工修改框。

`editor(key, shown, node)` 里的「保存修改」：`JSON.parse` 用户改的文本 → 存进 `state.edits`（**原始记录不动**）→ 触发重绘 → 弹 toast 提醒"请在下方说明理由以生成 skill 提案"。解析失败就在旁边显示错误，不会丢掉用户输入。

---

#### `ui/chat.js` — 对话 + rationale 交锋（约 240 行）

这是"人机分歧 → 技能改进提案"闭环的实现。

- `renderChat` — 画作用域提示（当前针对哪个节点）+ 消息流 + 输入框 + 麦克风 + 朗读开关 + 发送按钮。
- `respond(text, sel, format)` — 分三种情况：
  - **没选节点 + live 模式有 key** → 当普通提问直接问模型；
  - **没选节点 + 没 key** → 提示先选节点或配置 key；
  - **选了节点** → 组装一个 `clash` 对象（技能、文件、文本片段、模型输出、模型依据、人工输出、人工依据），交给 `liveProposal()`（模型改写成规范条款）或 `localProposal()`（本地模板拼装）。live 调用失败会**回退到本地模板并在末尾注明失败原因**，不会让用户白打一段字。
- `exportProposals()` — 把本次会话所有提案汇总成一份 markdown 下载。

---

#### `ui/studio.js` — 格式生成器（约 100 行）

弹窗：格式 id + 文字描述 → `generate()`（live 用模型填 schema / 离线用关键词模板）→ 规格预览区**可直接编辑**（`contentEditable`）→ `apply()` 解析编辑后的 JSON → `buildFormat` → `registerRuntimeFormat` → 立刻可用。也能把规格导出成文件。

---

#### `ui/log-panel.js` — 日志抽屉（约 45 行）

`mountLogPanel()` 接好开关；订阅 `'log'` 事件；`updateBadge()` 统计 error 条数显示成红色徽章；`renderLog()` 倒序渲染（最新在上），按级别着色。

---

#### `ui/settings-panel.js` — 设置弹窗（约 110 行）

四个区块：每个厂商一行（key + 模型 + "设为默认"单选 + 保存）、Google Drive Client ID、GitHub Token、本地凭据文件导出/导入。

`providerRow(id, meta)` 里的"设为默认"单选会 `set({provider: id}, 'provider')`，`app.js` 订阅了这个 key，所以工具栏右边的状态胶囊立刻更新。

---

#### `ui/github-panel.js` — GitHub 面板（约 140 行）

`renderBody()` 按连接状态分叉：未连接 → token 输入 + 连接按钮 + 错误显示；已连接 → 显示 `@用户名` + 断开 + 仓库输入 + "浏览仓库/forks" + 仓库列表（origin 和每个 fork 各一行，可选择）。

选定仓库后出现 `branchAndFileSection`：分支下拉 + 文件路径 + 三个动作——「从此载入标注」（读文件 → `parseDocument` → 切换当前文档）、「保存标注到此分支」（先 `getFile` 拿 sha 再 `putFile` 覆盖）、「Inter-Annotator 合并…」（打开下面那个）。

---

#### `ui/iaa.js` — 一致性 = git merge（约 330 行）

**三步走**：

1. **先试真合并** — `renderCompare()` 调 `mergeBranches()`。两份独立标注几乎总会返回 409 冲突（和本地 `git merge` 一模一样），这是**预期结果不是错误**，横幅会明说。
2. **逐节点裁决** — `diffLevel(nodesA, nodesB, resolutions, path)` 是核心：按 `skill::span` 给两边建索引，取并集，每个键判定三种状态之一——`agree`（`deepEqual` 输出相同）、`disagree`（都有但不同）、`structural`（只有一方有）。**同一次递归同时产出两样东西**：给界面看的扁平分歧列表，和按当前裁决结果拼出来的合并树。`conflictRow()` 把每条分歧画成 git 冲突块（`<<<<<<< A (分支名)` / `=======` / `>>>>>>> B (分支名)`），三个按钮：采用 A / 采用 B / 两者都不用。
3. **真提交** — `commitResolution()` 重新拉两份文件 → 用裁决表跑一遍 `diffLevel` 得到最终树 → `createBranch` 建 `iaa/<文件名>-<时间戳>` 分支 → `putFile` 提交 → 提供「创建 PR」按钮。**所以一致性评审的产物是真实的 git 分支 + commit + PR，不是一份报告。**

统计口径：`pct` = 一致 / 可比节点（结构性分歧不计入分母，单独列出）；`cohenKappa()` 额外对 polarity 字段算 Cohen's κ（扣除随机一致后的一致度），只对并行格式有意义，算不出来就不显示。

---

### 4.5 顶层文件

---

#### `voice.js` — 语音（约 65 行）

纯 Web Speech API，无依赖。`sttSupported` / `ttsSupported` 是**特性检测**——不支持的浏览器上按钮根本不渲染，而不是点了才报错。

- `startDictation({lang, onResult, onEnd, onError})` — 造识别器，按文档语言设 `zh-CN`/`en-US`，开中间结果（边说边出字），返回 `{stop()}` 控制器。
- `speak(text, lang)` — 朗读前先 `cancel()` 掐断上一句；`stripForSpeech()` 去掉代码块和 markdown 符号、截断 600 字（免得念一长串括号）。
- `stopSpeaking()` — 关掉朗读开关时立刻停止当前朗读。

---

#### `app.js` — 启动与接线（约 245 行）

**`boot()` 的顺序是有讲究的**：先 `loadPersisted()` + `loadSecrets()` 恢复设置 → 缓存 DOM 节点 → 接按钮 → 接菜单 → 挂三个面板 → `subscribe()` 注册所有状态监听 → 加载两个内置格式 → 拉演示语料索引 → 填两个下拉框 → 打开第一篇文档。

**`subscribe()` —— 整个应用的"神经系统"**，值得单独看：

| 事件 key | 重绘什么 |
|---|---|
| `doc` | 全部 |
| `sentence` | 清折叠状态 + 句子条 + 左栏 + 标注树 + 助手 |
| `tree` | 标注树 + 句子条（完成打勾要更新） |
| `artifact` | 成品视图 |
| `selectedNode` | 标注树（选中高亮）+ 助手 + 对话（作用域提示） |
| `chat` / `voice` | 对话面板 |
| `format` | 全部 |
| `runMode` / `provider` | 持久化 + 状态胶囊 |
| `apiKeys` / `models` | 状态胶囊（存完 key 立刻不再显示"未设置"） |

其他：`useDoc(doc)` 换文档时会重置选中/编辑/提案/对话；`updateModeUi()` 维护工具栏右边那个状态胶囊；`importSample(lang)` 就是「模拟 Drive 导入」——和真实 Drive 走同一个 `parseDocument`，只是跳过 OAuth；`wireMenus()` 用事件委托实现下拉菜单（点别处自动关）。

---

## 第 5 章：想改 X 该动哪里（速查表）

| 我想… | 改这个文件 |
|---|---|
| 换一个 skill 的提示词 | `data/skills/shared/*.md`（**不用动 JS**） |
| 调整某个 skill 的任务输入格式 | `core/pipeline.js` 的 `taskXxx()` |
| 改标注流程顺序 / 加一个新 skill 步骤 | `core/pipeline.js` 的 `resolveByKind()` + `advanceSentence()` |
| 加一个大模型厂商 | `core/providers.js` 加一项（**别处不用动**） |
| 改递归深度上限 | `core/pipeline.js` 顶部 `MAX_DEPTH` / `FORCE_ATOMIC_DEPTH` |
| 加一种标注格式 | 新建 `formats/xxx.js` + 在 `core/registry.js` 的 `loaders` 里登记 |
| 改标注树每行显示什么 | 对应格式的 `nodeSummary()`；行的结构在 `ui/tree.js` 的 `nodeEl()` |
| 改成品视图 | 对应格式的 `renderArtifact()` |
| 改配色/间距/深色模式 | `css/app.css` 顶部的 CSS 变量 |
| 改一致性算法 | `ui/iaa.js` 的 `diffLevel()`（对齐）和 `diffDocs()`（统计） |
| 加一个 GitHub 操作 | `io/github.js` 加一个函数，UI 在 `ui/github-panel.js` |
| 改凭据存储方式 | `core/settings.js` |
| 加一条日志 | 任何文件 `import { logInfo } from '.../log.js'` |

---

## 第 6 章：已知简化与边界

这些是**有意为之**的取舍，代码注释里也都标了：

1. **没有搬运 PropBank / NER 词典**。原仓库的义项表来自 `.xlsx` 和 `.xml` 资源，体积大且需要解析器。现在的做法是在提示词里明确告诉模型"本地没有词典，请用你知道的标准义项编号"。抽象概念表（`abstract_rolesets.json`）是搬了的。
2. **一致性对齐是简化版**。按 `skill::span` 精确匹配，不是完整的 smatch / AnCast++ 图匹配。同一个跨度被两人切成不同粒度时会被判成"结构性分歧"而不是部分匹配。
3. **`doc_level` 的节点深度信息不精确**。Python 版按图中嵌套深度筛选"主事件"，浏览器版的调用树没有逐节点保留那个深度，目前统一按 depth=1 处理，可能多算入个别嵌套事件。
4. **同一时刻只允许一个 skill 调用**。刻意的：并发跑多个调用会让树的写入产生竞态，而这个工具的核心诉求是"一步步看清楚"，不是吞吐量。
5. **replay 模式对新文档必然失败**，这是**设计**而非缺陷——它会抛出一句明确的话告诉你该切到 live 模式。
6. **GitHub 用 PAT 而非 OAuth**，原因见 `io/github.js` 文件头注释（纯静态站点无法完成 token 换取）。

---

## 附：本次文档编写过程中修掉的问题

写文档需要逐行核对代码，过程中发现并修复了：

1. **并行格式完全无法标注**（真 bug）。`formats/sentiment.js` 把 `pendingSlots` / `runSkill` 写成了**具名导出**，而 `core/registry.js` 只注册 `mod.default`——于是这两个函数对界面不可见，情感格式的"待运行"行一个都不显示，任何新建的情感文档都没法标注。内置演示数据三个 skill 都已完成，所以表面上完全看不出来。这和当初要修的那个 bug 是**同一类**：靠预填数据掩盖住的、只在新文档上才暴露的路径。已把两个函数移到 default 对象上，`formats/declarative.js` 补上同样缺失的 `runSkill`，两处都加了注释警示。已用一份空白情感文档验证：3 个待运行行正常出现、依次点击全部成功、第二句同样正常。
2. **关掉朗读开关不会停止当前朗读**。`stopSpeaking()` 写了但没接线，现在 `ui/chat.js` 的开关关闭时会调用它。
3. **删掉 7 个死代码导出**（`pickFile`、`debounce`、`nodeAt`、`findSkill`、`listMyRepos`、`toggleTts`、`hasKey`）——都是我早期写下、后来换了实现方式就没人调用的残留。留着会让这份文档多出 7 条"这个函数没人用"的噪音。
