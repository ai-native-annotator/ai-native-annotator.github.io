# SkillParse 工作台（`index.html`）：调用方式

这份文档写的是网页现在怎么运行：从点一个按钮，到浏览器里的 Python、模型服务，再到写出 `.umr` 文件，每一层谁调用谁、传什么、存在哪。旧的标注工作台在 `classic.html`，不在本文范围内。

---

## 1. 总览

```
浏览器页面（JS，ES modules）                      Web Worker                     外部服务
┌──────────────────────────────┐   postMessage   ┌────────────────────────┐
│ app.js  启动、工具栏          │ ─────────────▶ │ py-worker.js            │
│ core.js 状态 S、运行步骤      │ ◀───────────── │  Pyodide 0.26.4 (CPython│
│ pane-*.js 四个栏              │  {id, ok|error} │  的 WebAssembly 版)     │
│ models.js 调模型（fetch）─────┼────────────────────────────────────────────▶ OpenRouter / Anthropic / OpenAI
│ save.js 暂存（IndexedDB）     │                 │  sp_bridge.py  ← 唯一入口 call(method, json)
│ store.js 改过的 skill 文件    │                 │  umr_load.py   ← 载入已有标注
└──────────────────────────────┘                 │  SkillParseUMR 源码（/sp）│
                                                  └────────────────────────┘
```

- **没有服务器**：页面是 GitHub Pages 上的静态文件。Python 在浏览器的 Web Worker 里运行（Pyodide），模型请求由浏览器用你填的 key 直接发给服务商。
- **Python 原样运行 SkillParseUMR**：`data/skillparse/fs/` 下是从 SkillParseUMR 和 modular-parsing 复制来的文件（`scripts/sync_skillparse.py` 负责组装），启动时写进 Pyodide 的虚拟文件系统 `/sp`。新写的 Python 只有 `data/skillparse/bridge/` 下的两个文件。
- **一步一步来**：每一句是一个 episode，里面是一棵步骤树。每一步跑完都要人确认（或修改、带提示重跑）后，这一句才能跑下一步。

---

## 2. 文件一览

| 文件 | 作用 |
|---|---|
| `index.html` | 页面骨架：工具栏、四个栏（上下文 / Skill / 生成内容+步骤 / AI）、对话框 |
| `css/skillparse.css` | 样式（颜色变量、深色模式、运行动画） |
| `js/skillparse/app.js` | 启动（`boot`）、工具栏按钮接线（`wire`） |
| `js/skillparse/core.js` | 页面状态 `S`、打开文档、运行步骤（`drive` / `runNext` / `runNextAll` / `runNode`）、确认、修改、暂存调度 |
| `js/skillparse/py.js` | `py(method, args)`：发给 Worker、等结果 |
| `js/skillparse/py-worker.js` | Worker：加载 Pyodide、写入文件、调 `sp_bridge.call` |
| `js/skillparse/models.js` | 设置与 key、`llm()`（带工具的模型调用）、`jev()`（Jev 封闭问题） |
| `js/skillparse/dialogs.js` | 设置、导入、导出、手答 Jev、询问是否恢复暂存 |
| `js/skillparse/pane-context.js` | 左栏：wave、for_each 项、上下文窗口 |
| `js/skillparse/pane-skills.js` | Skill 栏、skill 文件编辑器（Markdown 阅读 / 编辑原文 / 版本） |
| `js/skillparse/pane-work.js` | 中栏：图、输出（Penman + JSON）、输入、问答、提示词、工具调用、UMR 文本；下方步骤树和运行栏 |
| `js/skillparse/pane-ai.js` · `reflect.js` | 右栏 AI：三种改 skill 的方式和 AI 自查 |
| `js/skillparse/graph-view.js` | 把图画成 SVG |
| `js/skillparse/penman-view.js` | 把一步的输出写成 Penman（`<node: …>` / `<outside: …>`） |
| `js/skillparse/md.js` | skill.md 的 Markdown 渲染 |
| `js/skillparse/diff.js` | 行级 diff、JSON 显示格式（`[]` 内不换行） |
| `js/skillparse/save.js` | IndexedDB：暂存的工作、导入过的文档 |
| `js/skillparse/store.js` | localStorage：改过的 skill 文件及其版本 |
| `js/skillparse/i18n.js` · `ui.js` | 中英文字符串、DOM 小工具 |
| `data/skillparse/MANIFEST.json` | Worker 要写进 `/sp` 的文件清单 |
| `data/skillparse/bridge/sp_bridge.py` | Python 一侧：`Session`（文档、文件）和 `RegistryEngine`（一步步跑 registry） |
| `data/skillparse/bridge/umr_load.py` | 把已有 `.umr` 的标注拆成步骤 |
| `data/skillparse/fs/skillparseumr/` | SkillParseUMR：`src/`（registry、输入输出模块）、`web-procedures/zh`、`web-procedures/en`（两套流程）、`web-procedures/tools/` |
| `data/skillparse/fs/modular-parsing/resources/` | PropBank（`chinese-propbank.json`、`english-propbank/…arg-descr.txt`）和 UMR 列表（CSV） |
| `data/skillparse/docs/` | 两篇样例文档（只有句子） |
| `data/skillparse/vendor/` | penman 1.3.1 |
| `scripts/sync_skillparse.py` | 从 SkillParseUMR 组装上面这些文件 |

---

## 3. 启动

`index.html` 加载 `js/skillparse/app.js`，`boot()` 依次：

1. `setLang`、`applyStatic`（界面文字）、`wire()`（按钮）、`setManualAnswerer(answerByHand)`、`setRestoreAsker(askRestore)`，并注册页面隐藏/离开时的 `saveNow()`。
2. `bootPython()`（`py.js`）新建 Worker `py-worker.js`，发 `__boot`：
   - `importScripts` 加载 `https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js`，`loadPyodide`，`loadPackage(['pyyaml'])`；
   - 读 `data/skillparse/MANIFEST.json`，把其中每个文件写到 `/sp/…`（`fs/x` 写成 `/sp/x`，`bridge/`、`docs/` 原样）；
   - 解压 `vendor/penman-1.3.1-py3-none-any.whl` 到 `/sp/vendor`；
   - `sys.path` 加上 `/sp/bridge`，`import sp_bridge`，调 `boot`。
   - 进度通过 `{type: 'progress', text}` 消息显示在状态栏。
3. 从 IndexedDB 取出这个浏览器导入过的文档（`allImports()`），逐个 `py('import_doc', {name, text, fmt})` 重新导入（Pyodide 的文件系统只在页面存在期间存在）。
4. `loadDocs()` → `py('docs')`，填文档下拉框。
5. 选要打开的文档：网址参数 `?skills=…&doc=…`，否则上次打开的（`lastOpen()`，localStorage `skillparse_last`），否则第一篇同语言文档。
6. `reopen(skillset, doc)` → `core.open()`（见第 5 节）。

---

## 4. 页面调 Python：`py()` → Worker → `call()`

```
core.js 等  py('step', {w, i, nid})
  → py.js   worker.postMessage({id, method: 'step', args})
  → py-worker.js  call(method, JSON.stringify(args))
  → sp_bridge.call  getattr(SESSION, method)(**args)
       Session 自己有的方法直接调，其余转给当前的 RegistryEngine（Session.__getattr__）
  ← '{"ok": …}' 或 '{"error": "类型: 消息", "trace": "…"}'
  ← py() resolve(ok) 或 reject(Error(error), err.trace)
```

Worker 是单线程的，所有 `py()` 调用按顺序排队执行。模型请求不在 Worker 里发，由页面发（见第 6 节），所以多句同时跑时，Python 只处理很短的步骤。

### 4.1 `Session` 的方法（文档和文件）

| 方法 | 参数 | 返回 | 谁调用 |
|---|---|---|---|
| `boot` | — | `{python}` | Worker 启动时 |
| `docs` | — | `[{id, sentences, lang}]` | `loadDocs` |
| `import_doc` | `name, text, fmt`（`txt-lines` / `txt-split` / `umr` / `umr-load`）`, lang?` | `{id, sentences, lang}` | 导入对话框、启动时重新导入 |
| `open` | `skillset`（`web-zh` / `web-en`）`, doc` | `describe()`，载入标注时多一个 `loaded` 报告 | `core.open` |
| `read_file` | `path`（`/sp` 下的相对路径） | 文件文本 | skill 编辑器、AI 栏 |
| `write_file` | `path, content` | `{ok, problem?}`（Python 文件会先编译检查） | 保存 skill、AI 改 skill、打开文档时应用这个浏览器的修改 |

### 4.2 `RegistryEngine` 的方法（一个文档 + 一套流程）

| 方法 | 作用 |
|---|---|
| `describe()` | waves、skills（kind、emit、文件、dispatcher 规则）、共用文件、窗口设置 |
| `items(w)` | 这个 wave 的 for_each 项和各自状态（new / pending / review / error / done，可带 +stale） |
| `episode(w, i)` | 一项的步骤树（每步 id、skill、kind、状态、是否确认 / 人工 / 导入、提示、摘要）、`awaiting`、`needs` |
| `node(w, i, nid)` | 一步的全部数据：输入、输出、Jev 轮次、提示词、工具调用、错误 |
| `needs(w, i)` | 这一项读的前一波里还没完成并确认的项 |
| `start(w, i)` | （重新）开始一项：算上下文和起点输入，建根步骤（pending） |
| `next_step(w, i)` | 下一步是谁：`{node}` / `{running}` / `{awaiting}` / `{done}` |
| `step(w, i, nid, hint?)` | 开始跑一步（见 6.2）；返回 `{done…}` 或 `{need: 'jev' \| 'llm', …}` |
| `answer(w, i, nid, answers)` | 交回 Jev 这一轮的答案，返回下一轮或完成 |
| `tool(w, i, nid, name, args)` | 执行模型要调用的工具，返回文本 |
| `complete(w, i, nid, output)` | 交回模型的 `final_result`；格式不对会要求重答一次 |
| `fail(w, i, nid, error)` | 页面拿不到回答（没 key、网络、停止），这一步记为出错 |
| `confirm(w, i, nid)` | 确认这一步 |
| `set_output(w, i, nid, output)` | 人直接写这一步的输出（算确认），下面的步骤按它重建 |
| `reset(w, i, nid)` | 清空这一步及下面所有步骤，回到 pending |
| `set_window(w, var, rng)` | 改上下文窗口（如前 5 句） |
| `render(auto_align)` | 写整篇 `.umr`（见第 8 节） |
| `graph(i)` | 第 i 句拼好的图，给页面画 SVG |
| `export()` | 工作记录 JSON（导出菜单） |
| `snapshot()` / `restore(state)` | 暂存和恢复（见第 10 节） |
| `reload()` | skill 文件改了之后重新加载 registry 和模块 |

---

## 5. 打开文档：`core.open(skillset, doc)`

1. 有未存的改动就先 `saveNow()`，然后暂停自动暂存。
2. `py('open')` → `Session.open`：
   - 读 `/sp/docs/<doc>.umr`，判断语言；英文文档没有 `.txt` 时写一个（Words 用空格拼回），让输入模块按词切 token；
   - `RegistryEngine(skillset, registry.yaml, doc)`：`Registry.load`（SkillParseUMR 的 `src/registry.py`），`UMRInputHandler` 读文档（中文一字一个 token，连续的拉丁字母或数字算一个）；
   - 有 `<doc>.annotation`（以「载入已有的标注」导入的）就 `umr_load.load()`，报告放进 `loaded`。
3. 把这个浏览器改过的 skill 文件写回 `/sp`（`store.js` 的最新版本 → `write_file`），再 `describe`。
4. 查 IndexedDB 有没有这篇文档 + 这套流程的暂存（`workKey = "<skillset>|<doc>"`）：有就弹「接着上次的继续？」
   - 继续：`py('restore', {state})`，回到上次的 wave 和句子；
   - 重新开始：删掉暂存；
   - 关掉对话框：这次从头开始，但暂存先留着。
5. `refresh()` 画出各栏，记下 `lastOpen`，恢复自动暂存，状态栏显示载入 / 恢复的报告。

---

## 6. 跑一步

### 6.1 页面上的入口

| 按钮 | 位置 | 调用 |
|---|---|---|
| ▶ 运行第一步 / ▶ 运行下一步 | 步骤栏 | `runNext(i)` |
| ✓ 确认并运行下一步 | 输出栏、步骤栏 | `confirmAndNext(nid)`：`confirm` 后 `runNext` |
| ✓ 正确，确认 | 输出栏、步骤栏、步骤树的 ✓ | `confirmNode(nid)` |
| 所有句子：下一步 | 工具栏、左栏 | `runNextAll(w)` |
| ↻ 重跑这一步 | 输出栏 | `runNode(nid)` |
| 💬 加提示重跑 → 带提示重跑 | 输出栏、步骤栏 | `runNode(nid, {hint})` |
| ✎ 直接修改 → 保存修改 | 输出栏、步骤栏 | `saveOutput(json)` → `set_output` |
| 步骤树的 ▶ | 步骤树 | `runNode(nid)`（只在没有待确认步骤时出现） |
| ↺（步骤树） | 步骤树 | `resetNode(nid)` → `reset` |
| ↻ 重新开始 | 步骤栏 | `startItem()` → `start` |
| 停止 | 工具栏 | `stop()`：取消正在等的模型请求 |

- `runNext(i)` → `nextStep`：没开始就 `start`；`next_step` 给出要跑的一步，先选中它（输出栏能看到运行动画），再 `drive`；跑完选中它，状态栏提示检查输出。
- `runNextAll(w)`：这个 wave 的所有项各跑一步。同时跑的项数不超过 registry 里这个 wave 的 `parallel`；还有待确认步骤、已完成或要等前一波的项跳过。最后报告跑了几步、几句等确认。

### 6.2 `drive(w, i, nid)`：一步从开始到完成

```
py('step') ─┬─ kind: rule  → Python run(**inputs) 立即算出 → _finish → {done}
            ├─ kind: jev   → 生成器第一轮 → {need:'jev', state, questions, round}
            │     循环：页面 jev(state, questions) → py('answer', answers) → 下一轮 …
            │     生成器结束（StopIteration 的值就是 emit）→ _finish → {done}
            └─ kind: agent → 拼提示词 → {need:'llm', system, instructions, input, tools, emit}
                  页面 llm({role:'haiku', …, callTool: py('tool')}) → final_result 的对象
                  → py('complete', output) → 格式不对：{need:'llm', retry} 再答一次
                                            → 格式对：_finish → {done}
```

**`step()` 的关卡**：要跑的是 pending 步骤时，这一项如果有正在运行的步骤，或有跑完还没确认的步骤（出错的也算），就拒绝（`confirm step … first`）。重跑一个已完成的步骤不受这个限制，它会先 `reset` 自己和下面的步骤。开始跑时状态设为 `running`，直到完成或出错。

**kind: agent 的提示词**（照 SkillParseUMR `skill_callable.prompt_parts`）：
- system：`You are an expert annotator of Uniform Meaning Representation (UMR), following the UMR guidelines. Do exactly the one task you are given.`
- instructions：`# Output Format` + emit 字段列表 + skill.md 里 `## Input` 之前的部分（用输入值 `str.format` 填好）；
- input：skill.md 从 `## Input` 开始的部分，填好输入；有提示时在最后加一行 `human提示：…`（英文 `Human hint: …`）。

**工具**：skill 自己的 `tools/`，然后 skillset 的 `tools/`，再然后上一层的 `tools/`（同名的只取第一个）。现在有 `get_example`（读 `reference/example.md`）和 `propbank_lookup`（读合并后的 PropBank）。模型要调用工具时，页面 `py('tool')` 在 Python 里执行，结果文本交还模型；记录在这一步的「工具调用」里。需要 `RunContext` 的工具得到一个 `deps = {skill_dir, skill}` 的替身（浏览器里没有 pydantic-ai）。

**`llm()` 的循环**（`models.js`）：
- 工具列表最后加一个 `final_result`，它的参数 schema 由 emit 生成（`emitSchema`）。
- 每一轮 `tool_choice` 要求必须调用工具，最后一轮强制调用 `final_result`；最多 10 轮。
- OpenRouter / OpenAI：`/v1/chat/completions`，`Authorization: Bearer <key>`。
- Anthropic：`/v1/messages`，`x-api-key`、`anthropic-version: 2023-06-01`、`anthropic-dangerous-direct-browser-access: true`；instructions 超过 2000 字时加 `cache_control`（提示词缓存）。
- 429 / 5xx 会重试，最多 4 次，退避最长 15 秒。

**`jev()`**（`models.js`）：
- 把问题按每批 40 个，POST 到 `https://openrouter.ai/api/v1/systemone`，模型 `typesafe/jev-1.13`，请求体 `{model, state, questions}`；
- 每个答案标上 `by: 'jev'`，同样的 state + 问题会用缓存；
- ⚙ 里可以改成「我自己回答」，这时弹 `answerByHand` 对话框；
- 有提示时，提示放进 state 的 `human提示` 字段。

**`_finish()`**：
1. `_check_emit`：字段要齐、类型要对、取值在列表里（见第 11 节）；
2. 存 `output` 和 `stored`（registry 的 `store` 字段）；
3. 执行 dispatcher 规则：每条命中的规则都执行，`each` 展开成多个子步骤，子步骤的输入和 edge 由规则里的表达式算出；
4. `_make` 建子步骤（pending）：深度超过 `max_depth`、步数超过 `max_nodes`、或和某个上层步骤 skill 与输入都一样的，不建，记在 `dropped`；
5. 标记后面的 wave 里受影响的项为过时（stale）。

**`drive` 结束后**：`changed()` 让拼好的 .umr 和图的缓存失效，并安排一次自动暂存。

### 6.3 并发和运行动画

- **并发**：每个模型请求（Jev 一轮、一次 Haiku 调用）都要先拿到一个名额（`withSlot`），同时最多 ⚙「同时运行的步数」个（默认 6）。
- **运行中的状态**：`drive` 等模型时，把这一步记在 `S.live`（`"wave|item|node"` → 模型、轮次、开始时间）。界面上：
  - 步骤树里那一行转圈并闪动；
  - 左栏那一句的圆点闪动；
  - 输出栏显示谁在回答和已用秒数；
  - 工具栏状态前有转圈（`body.busy`）。

### 6.4 一步的数据（`node`）

| 字段 | 含义 |
|---|---|
| `id` | 在树里的路径，根是 `0`，子步骤 `0.0`、`0.1` … |
| `skill`, `input`, `parent`, `edge`, `depth` | 哪个 skill、输入、父步骤、它在父步骤里填哪个占位或角色、深度 |
| `status` | `pending` → `running` → `ok` / `error` |
| `output`, `stored`, `machine_output` | 输出、registry 要保存的字段、模型原来的输出（人改过之后用来比较） |
| `confirmed`, `human`, `loaded`, `hint` | 已确认、人工写的、从文件载入的、带的提示 |
| `rounds`, `prompt`, `tool_calls`, `problems`, `retried` | Jev 每一轮、发给模型的提示词、工具调用、第一次不合格的原因 |
| `children`, `dropped`, `rules` | 建出的子步骤、没建的子步骤和原因、命中的 dispatcher 规则 |

一个 episode：`{index, context, nodes, error, stale, missing}`。

---

## 7. 流程（registry）：两波

两套流程在 `web-procedures/zh/registry.yaml` 和 `web-procedures/en/registry.yaml`，结构一样。

| wave | for_each | 起点 | 读什么 |
|---|---|---|---|
| sentence | 每一句 | `sent_type`（输入整句） | 这一句的文本和 token |
| document | 每一句 | `document` | 前 5 句和这一句的文本，以及它们在 sentence 这一波的树（要都完成并确认） |

sentence 这一波里的流向（dispatcher）：

```
sent_type ─┬─ discourse ──┬─ relation 不是 none：每个 part → sent_type
           │              └─ relation 是 none：整段 → predicate
           ├─ predicate ──── 每个 open（占位）→ sent_type
           ├─ np_phrase ──── 每个 open → sent_type
           ├─ special_entity ─ 每个 open → sent_type
           └─ stop（叶子，自带一个小图片段）
```

| skill | kind | 交给谁 | 文件 |
|---|---|---|---|
| sent_type | jev | Jev（封闭问题，由 Python 规则出题、组装） | `sent_type/sent_type.py`、`prompts.yaml`、共用 `jevlib.py` |
| discourse | agent | Haiku | `discourse/skill.md`、`reference/example.md` |
| predicate | agent | Haiku（可查 PropBank） | `predicate/skill.md`、`reference/`、`tools/propbank.py` |
| np_phrase | agent | Haiku（可查 PropBank） | `np_phrase/…` |
| special_entity | agent | Haiku | `special_entity/…` |
| document | agent | Haiku | `document/…` |

写在一块外面的参与者（如「Pope wanted to leave」里 leave 的主语）只写在那一步输出的 `outside` 里，不再单独起步骤，写 `.umr` 时按 span 接上（第 8 节）。

---

## 8. 写 `.umr`、画图

`render(auto_align)`（导出 .umr、「UMR 文本」标签、AI 栏都用它）：

1. `_worktree_out()` 准备输出模块要读的 worktree：
   - `sentence`：`_sentence_out(i)`，每句的步骤树，再给每一步 `outside` 里的每一项临时补一个 antecedent 节点（这一项的 span 和文本，挂在那一步下面，edge 是 predicate 的角色，或其他 skill 的变量）；
   - `reentrancy`：`merges(i)` 算出的合并（SkillParseUMR 的输出模块从这里读合并）；
   - `document`：document 这一波的输出。
2. `merges(i)`：
   - span 一样、概念也一样的两个节点是同一个，后出现的并进先出现的，但不会并进自己的上层。这里的节点指写概念的步骤：predicate、np_phrase、special_entity、sent_type 叶子；span 是这一步输入的 span。
   - outside 里的参与者：并到 span 一样的第一个节点，没有就并到中心词 span 一样的第一个节点，不并进自己所在的上层。
   - 如果这一项写明了概念（载入的文件会写），节点的概念也要一样，这时可以并进上层，例如从句的参与者就是它修饰的名词。
3. `UMROutputHandler().render(doc, worktree)`（SkillParseUMR 的 `src/output_handler/umroutputhandler.py`，未改）：
   - 把每一步的图片段拼成整句的图，变量改名为 `s<句号><字母>`；
   - 被合并的节点变成重入边；
   - predicate 的 aspect、polarity 写成属性，modal strength 移到文档级；
   - 写对齐（span → `a-b`），写文档级的 temporal / modal / coref。
4. `auto_align`（导出时默认开）：对齐是 `0-0`、而概念在句子里出现的变量，补上那几个字的位置；抽象概念、名字、实体类型保持 `0-0`。
5. 另外算 `provenance`：每个变量是哪一步写的。点图里的框跳到那一步就靠它。

`graph(i)`：从 render 结果里取第 i 句，用 penman 解出节点、边、属性、对齐、文档级关系，交给 `graph-view.js` 画 SVG。重入画虚线，当前步骤写的框高亮，悬停显示对齐的字。

**导出菜单**：`.umr`（补齐对齐）、`.umr`（对齐保持原样）、工作记录 JSON（`export()`）、改过的 skill 文件 JSON。工具栏的「导出 .umr」等于第一项。

---

## 9. 导入

导入对话框（`openImport`）→ `py('import_doc', {name, text, fmt})`：

| 格式 | 做什么 |
|---|---|
| `txt-lines` | 每行一句 |
| `txt-split` | 用输入模块的 `split_sentences` 自动分句 |
| `umr` | 只取每个 `# :: sntN` 块的 Words 行，丢掉原来的标注 |
| `umr-load` | 同上取句子，另外把整个文件存成 `<name>.annotation`，打开时 `umr_load.load()` 载入标注 |

导入的文档写成只有句子的 `.umr`，放在 `/sp/docs`，同时存进 IndexedDB 的 `imports`（下次启动重新导入）；同名文档的旧暂存会删掉。

**`umr_load.load(engine, text)`**：
1. **判断对齐方式**（`unit_spans`）：
   - 中文 Words 每个都只有一个字（或一串拉丁字母、数字）：按字对齐，照原样用；
   - Words 是多字词，但对齐编号超过词数：编号按字算；
   - 否则：编号按词算，每个词换成它所占的那几个字；
   - 英文：词就是 token。
2. **拆图**：用 penman 解析每句的图，第二次出现的变量当作重入。从根开始，按它会走的路径建步骤（暂时不受深度、步数和循环检查的限制）：
   - 每个节点先是一个 sent_type 步骤，输出它的类型：
     - 有 `:name` 或是日期、数量等：special_entity；
     - 概念带 `-数字` 或有 `:aspect`：predicate；
     - 没有孩子：stop 叶子；
     - 是篇章关系、孩子都是 `opN` / `ARGn`、且至少有一个是事件：discourse；
     - 其余：np_phrase。
   - 然后这个类型的步骤写出节点的图片段：每个孩子一个 open 占位，名字、单位并进 special_entity 的固定结构，aspect、polarity、modal strength 放进 predicate 的字段。
   - dispatcher 由此建出子步骤，再对孩子重复以上过程。
3. **span**：节点自己和子树里的对齐取并集；名字的 op 字词在句子里能找到的也算。都没有就在句子里找概念的字，再不行用上层的 span。
4. **重入**：写成 outside 的一项，带上被指节点那一步的 span、文本和概念，让写 .umr 时的合并接到它。
5. **文档级关系**：写成 document 那一步的输出，引用写成 `"<句号>:<步骤 id>/<变量>"`。
6. 所有步骤标「导入」、算已确认。报告内容：对齐方式、句数、步数、有几处文件把同一个词、同一个概念写成了两个节点（按规则合成一个）、放不进去的地方。

---

## 10. 暂存

**存在哪**：IndexedDB，库名 `skillparse`。

| store | 键 | 内容 |
|---|---|---|
| `work` | `"<skillset>|<doc>"` | `{at, skillset, doc, wave, item, steps, confirmed, state}`，`state` 是 `snapshot()` |
| `imports` | 文档名 | `{name, text, fmt, at}` |

**什么时候存**：
- `changed()`（每次运行、确认、修改、重跑之后）过 1.5 秒存一次；
- 有步骤在跑时等它跑完；
- 页面隐藏或离开时立刻存；
- 存好后工具栏显示「已暂存 时:分」，有未存的改动时这行字先消失。

**`snapshot()` 存什么**：每一波每一项的所有步骤和窗口设置。为了变小：
- 每项第一步的输入不存，恢复时重算（document 那一步的输入是整棵树）；
- 300 字以上的文本放进一张共用的表，相同的只存一份；提示词、Jev 的问题这类反复出现的长文本因此只存一次。

51 句、约 1800 步的文档约 1.5 MB。

**`restore(state)`**：
- 存的时候还在跑的步骤回到 pending；
- 流程里已经没有的 skill（如旧暂存里的 antecedent）的步骤去掉；
- 按 wave 顺序重算每项的上下文和第一步输入。

**其他保存在浏览器里的东西**（localStorage）：

| 键 | 内容 |
|---|---|
| `annotator_secrets` | API key（和旧工作台共用） |
| `skillparse_settings_v4` | 模型、服务商、Jev 设置、并发数 |
| `skillparse_files:<skillset>` | 改过的 skill 文件，每次保存一个版本 |
| `skillparse_lang` | 界面语言 |
| `skillparse_last` | 上次打开的文档 |

这些都只在这个浏览器里，不上传。

---

## 11. 检查

**输出格式**（`_check_emit`，对应 SkillParseUMR 用 pydantic 按 emit 生成数据模型的校验）：

| skill | 检查 | 不合格 |
|---|---|---|
| sent_type | `type` ∈ {discourse, predicate, np_phrase, special_entity, stop}；`graph` 是对象；`outside` 是列表 | 规则代码算出的，直接出错 |
| discourse | `relation` 是字符串（不查取值）；`parts` 是列表 | 发回模型重答一次，再错就出错 |
| predicate | `graph`、`frame` 是对象；`open`、`outside`、`alignment` 是列表；`aspect` ∈ 27 个值；`modstr` ∈ 6 个值；`polarity` ∈ {positive, negative} | 同上 |
| np_phrase、special_entity | `graph` 是对象；`open`、`outside`、`alignment` 是列表 | 同上 |
| document | `relations` 是列表 | 同上 |

只查字段和类型，不查列表里每一项的内容。

**其他检查**：

| 什么时候 | 检查 | 不合格 |
|---|---|---|
| Jev 回答时 | 每个问题都有答案 | 这一步出错 |
| 模型调用工具时 | 工具存在；工具没报错 | 错误信息作为工具结果交还模型 |
| 建子步骤时 | 深度不超过 12、一句不超过 200 步、不和上层步骤重复 | 不建，列在「没有建的子节点」 |
| 写 .umr 时 | 边指向不存在的变量、占位没人填、概念有特殊字符、节点没连到根、outside 找不到节点、文档级关系指向不存在的节点 | 分别是：丢掉这条边（像常量的当属性）、用占位原文当节点、换成 `-`、用 `:mod` 挂到根、丢掉这条重入、丢掉这条关系 |

---

## 12. 改 skill 和反思（右栏 AI、编辑器）

- **直接改 skill**（方式 1）：
  - Skill 栏点文件 → `openEditor`：`.md` 默认显示渲染后的 Markdown，「编辑原文」是可保存的文本；
  - 保存时 `write_file`（Python 文件先编译检查），同时在 `store.js` 记一个版本；
  - 可以看版本 diff、恢复某个版本、回到原始版本（从服务器重新取）。
- **改输出，让 AI 找原因**（方式 2）：先「✎ 直接修改」保存人工结果，再点「找出 skill 的问题」。
- **说哪里错了，让 AI 改**（方式 3）：在右栏写一句话。
- **AI 自查**：不给反馈，让 AI 自己看这一步。

方式 2、方式 3 和 AI 自查的调用都一样：
- `reflect()`（`reflect.js`）以 `reflect` 角色（默认 Sonnet）调 `llm`，提示里有这一步的输入、输出、上下文、人工结果或说明、skill 的文件（jev skill 加上 `jevlib.py`）和整句的 .umr；
- 回答 `{diagnosis, layer, edits: [{file, op: modify|add|delete, find, replace, why}]}`；
- 勾选后「应用」→ `applyToFiles`：每条 `find` 必须在文件里正好出现一次；Python 编译不过就整个文件撤回；成功的存成一个新版本；
- 「重跑这一步验证」：`runNode` 后比较新输出和人工结果。

---

## 13. 设置和模型

⚙ 设置（`openSettings`）：

| 项 | 默认 |
|---|---|
| API key | OpenRouter / Anthropic / OpenAI 各一个 |
| Haiku（跑 agent skill） | OpenRouter `anthropic/claude-haiku-5.5`；换成 Anthropic key 时是 `claude-haiku-5-5` |
| 反思 | OpenRouter `anthropic/claude-sonnet-5.5`；Anthropic 是 `claude-sonnet-5-5` |
| sent_type 的封闭问题 | Jev（`https://openrouter.ai/api/v1/systemone`，`typesafe/jev-1.13`，默认用 OpenRouter key），或「我自己回答」 |
| 同时运行的步数 | 6 |

**页面发出的外部请求**：

| 地址 | 什么时候 |
|---|---|
| `cdn.jsdelivr.net/pyodide/v0.26.4/full/…` | 启动时下载 Python（之后浏览器会缓存） |
| `openrouter.ai/api/v1/chat/completions` | 用 OpenRouter key 跑 Haiku 或反思 |
| `openrouter.ai/api/v1/systemone` | sent_type 问 Jev |
| `api.anthropic.com/v1/messages` | 用 Anthropic key 跑 Haiku 或反思 |
| `api.openai.com/v1/chat/completions` | 选了 OpenAI 时 |

---

## 14. 和 SkillParseUMR 的差别

`scripts/sync_skillparse.py` 组装 `web-procedures/<lang>` 时做了这些改动，重新同步不会还原：

| 改动 | 原来 | 现在 |
|---|---|---|
| 流程来源 | — | 中文：决策编排 `umr-zh-frag/versions/R42` 的 registry 和 agent skill，`sent_type` 来自 `umr-zh-v11/versions/V12`；英文：`skillsets/umr-tree`，`sent_type` 来自 `umr-en-v11/versions/V12` |
| sent_type | — | 标为 `kind: jev`，其余调模型的 skill 都是 agent |
| coverage | predicate、np_phrase 之后检查漏掉的词 | 去掉 |
| reentrancy | 单独一波，按类型和 span 合并 | 去掉；写 .umr 时按 span 和概念合并（`merges`） |
| antecedent | 每个 outside 一个规则步骤 | 去掉；outside 留在原步骤里，写 .umr 时接上 |
| document 的树 | reentrancy 那一波的输出 | sentence 那一波的树（skill.md 里那句说明也改了） |
| discourse 的 relation | 17 个值的列表 | 任意字符串 |
| jieba | sent_type 的 jevlib 用它切词 | 不用：中文只在标点处切，英文用原来的词 |
| PropBank | 每个词条一个 XML（中文 24,521 个） | 合并成一个 JSON，`propbank.py` 改成读它，查询结果相同 |

另外，网页的运行方式和 SkillParseUMR 的命令行 Runner 有这些不同：
- 每一步要人确认才继续；
- 可以带提示重跑、直接修改；
- 可以载入已有的标注；
- 浏览器里没有 pydantic-ai，它的工具调用循环和输出校验由 `models.js` 和 `_check_emit` 实现。

---

## 15. 测试

| 命令 | 内容 |
|---|---|
| `npm run check` | Node 单元测试（含 `test/skillparse-penman.test.mjs`、`test/skillparse-json.test.mjs`）、ESLint、TypeScript 检查、Prettier |
| `npm run test:browser -- skillparse-test.js` | 整个流程：启动、确认关卡、提示重跑、Penman、图、修改与 AI 反思、导出、英文流程、Anthropic key、运行动画、刷新后恢复 |
| `npm run test:browser -- skillparse-fullrun-test.js` | 导入、所有句子逐步跑完两波、导出、文本导入、载入已有标注（按词转按字、重跑载入的步骤、按字文件原样载入）、刷新后文档还在 |

浏览器测试里的模型都是 `docs/verification/_skillparse-mocks.js` 里的替身，不需要 key。Pyodide 仍要从 CDN 下载。
