# SkillParse Workbench · SkillParse 标注工作台

Annotate UMR one step at a time in the browser: every step is one **skill** of a SkillParseUMR
registry, a file you can read, edit and argue with; a person confirms, corrects or re-runs each step,
and a correction can be turned into a change of the skill. Static site: no backend, no build step,
no account. Your model keys stay in your browser.

→ **[ai-native-annotator.github.io](https://ai-native-annotator.github.io/)**

## Run it locally

```bash
npm run serve     # then open http://localhost:8899/
```

**Do not double-click `index.html`.** The code is ES modules, and over `file://` the browser
refuses to load anything under `js/`. The page still draws, with a red banner saying it did not
start.

Use the bundled `serve.py` rather than `python3 -m http.server`: it disables caching. `http.server`
answers `304 Not Modified` per file, so after a `git pull` a new module can run against an old one,
and one module importing a name its neighbour does not export yet fails the **whole module graph**.

## Development checks

The deployed site has no build step. Node is used only for development checks:

```bash
npm install
npm run check                 # Node tests, lint, type-check, formatting
npx playwright install chromium
npm run test:browser          # starts the local server and runs the browser verification
```

Run one browser check with `npm run test:browser -- skillparse-test.js`. The page loads Pyodide
from a CDN, so the browser checks need the network for that; every model is a stand-in. See
[`docs/verification/`](docs/verification/).

## What it does

The page runs a **SkillParseUMR registry the way `src/runner.py` runs it**, in the browser:
the Python files run in Pyodide in a Web Worker (`data/skillparse/`, `js/skillparse/`). Only
`sent_type` is `kind: jev` (rules list the options, **Jev** answers the closed questions, from
decision-orchestration V12); every other model skill (`discourse`, `predicate`, `np_phrase`,
`special_entity`, `document`) is `kind: agent`: its `skill.md` is the prompt and **Haiku** answers,
with the skill's tools (`propbank_lookup`, and the site's `search_annotations` over gold UMR data,
`search_guidelines` over the UMR guidelines), as `src/skill_callable.py` does. The
Chinese prompts are decision-orchestration's `umr-zh-frag` R42, the English ones the `umr-tree` seed.
Jev goes through OpenRouter; Haiku through the OpenRouter key or straight to the Anthropic API with an Anthropic key, as chosen in ⚙. The layout follows the registry:

| Pane          | What it holds                                                                                                                                                                                      |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Context**   | the two waves (sentence, document), each wave's `for_each` items to pick from, and its context windows: one sentence, the five before it, or any `range`                                           |
| **Skills**    | every skill, its kind (jev / rule), what the dispatcher starts after it, and its files (`.py`, `prompts.yaml`) to edit                                                                             |
| **Generated** | top: the sentence's graph, drawn (click a box to reach the step that wrote it), and the selected step's output (as Penman and JSON), input, questions and answers; bottom: the steps, click to run |
| **AI**        | reflection on the selected step                                                                                                                                                                    |

**Import, annotate, export.** Import takes a `.txt` (one sentence per line, or split into
sentences), a `.umr` file to annotate again (only its sentences are kept, its annotation is
dropped), or a `.umr` file whose annotation is **loaded**: it becomes the steps the procedure
would have made, so every step can be run again; word alignments are converted to characters, and
a file aligned by characters is loaded as it is. Annotation goes one step at a time. A finished step gets one of three answers: **correct**
(confirm it), **re-run with a hint** (the hint is written after the step's input as
`human提示：…`, or put in the state Jev sees for sent_type, and stays with the step), or **edit
directly**. Only then can its sentence run the next step; nothing runs a sentence to the end by
itself. **All sentences: next step** runs the next step of every sentence of
the wave side by side, leaving alone any sentence whose step is not confirmed. There are two waves,
sentence and document: re-entrancy has no wave of its own; when the `.umr` is written, nodes with
the same span and the same concept are one node, and an antecedent joins the node with its span.
While a model answers a step, the step is shown at work (its row spins, its sentence pulses, the
output pane says who is answering and for how long). A step's output is
shown as Penman, relations and concepts only, with `<node: …>` for a part a later step builds and
`<outside: …>` for a participant written outside the piece. **Export .umr** writes the file,
alignments counted in characters for Chinese and filled in where the output left `0-0`.

Progress is kept in the browser (IndexedDB) after every change: each step with its output,
confirmation, hint and model record, and the documents imported. Opening a document with kept work
asks whether to go on from it. Nothing is uploaded; another browser or cleared site data starts
empty. The Python runs in the page too (Pyodide, in a Web Worker); there is no server.

How the page calls everything, from a button to the Python bridge and the model services, is
written up in **[`docs/SKILLPARSE.md`](docs/SKILLPARSE.md)**.

Every step can be corrected, and a correction is a skill change in one of three ways: **(1)** edit
the skill file yourself; **(2)** correct the step's output — the AI compares it with the machine's
and proposes the skill edit that would have produced it; **(3)** say what is wrong and let the AI
edit the skill. Edits are versioned in the browser and the step can be re-run to check them.
Export writes the `.umr` file, with alignments left at `0-0` filled in from the words.

The feature list people see in the page (the **?** button) is
[`data/skillparse/FEATURES.en.md`](data/skillparse/FEATURES.en.md) ·
[`FEATURES.zh.md`](data/skillparse/FEATURES.zh.md).

## Keys and privacy

There is no server in this project. Model keys (OpenRouter, Anthropic, OpenAI, TypeSafe) live in
`localStorage` only, and the browser calls the service you picked directly. Annotation work is
kept in IndexedDB in the same browser.

## Layout

```
index.html  css/skillparse.css  serve.py
js/skillparse/     the page: core (state, running steps), the four panes, models, the Python worker
data/skillparse/   what the Python runs — see its README
  bridge/            the page's own Python: runs a registry one step at a time, loads .umr files
  skills/            every skill: <lang>/ is a procedure (registry.yaml and its skills), shared/ what
                     several procedures use, tools/ the tools any skill may call
  engine/            the registry parser and the UMR input and output handlers
  MANIFEST.json      which file holds each path of the Python file system (scripts/build_manifest.py)
  resources/         gold annotations, UMR guidelines, PropBank: fetched when a tool first needs them
  docs/              sample documents
docs/SKILLPARSE.md   how the page calls everything (中文)
docs/verification/   Playwright checks
scripts/  test/      manifest and resource builders, deploy check, test runners; Node tests
```

The workbench this page replaced (recursive / flat / chained annotation with editable importers,
sentiment and refine formats, Drive and GitHub sources) is no longer in this tree; it is in the
git history and on the `obsolete` branch.

## Deploying

`.github/workflows/pages.yml` publishes the repository root from the default branch.

- **`.nojekyll` is load-bearing.** While Pages deploys _from a branch_, GitHub runs Jekyll over the
  repository, and Jekyll silently drops every path whose name starts with `_`: the page's Python
  packages have `__init__.py` files, and without them Python does not boot. `.nojekyll` turns that
  build off.
- **Check the deploy, not just the checkout.** Everything else here runs against `serve.py`, which
  serves the working tree exactly as it is; a host does not have to.

```bash
npm run check:deploy      # fetches every file the live page reaches for and reports what is missing
```

---

## 中文说明

在浏览器里一步一步标注 UMR：每一步是 SkillParseUMR registry 里的一个 **skill**，一个可以读、可以改的文件；
每一步由人确认、修改或带提示重跑，修改还能变成对 skill 的修改。纯静态站点，无后端、无构建步骤，模型 key
只存在你自己的浏览器里。

**本地运行**：`npm run serve`，然后打开 `http://localhost:8899/`。不要双击 `index.html`（`file://` 下
ES module 不加载，页面顶部会有红色横幅）；请用仓库自带的 `serve.py`（禁用缓存），不要用
`python3 -m http.server`。

**它做什么**：严格按 SkillParseUMR 的
Runner（`src/runner.py`、`src/skill_callable.py`）在浏览器里跑一个 registry（Pyodide，Python 文件不改）：
只有 sent_type 是 `kind: jev`（规则列选项，Jev 回答封闭问题，来自决策编排 V12）；其余调模型的 skill
（discourse、predicate、np_phrase、special_entity、document）都是 `kind: agent`：skill.md 就是提示词，
直接交给 Haiku，带 skill 的工具（propbank_lookup；本站的 search_annotations 搜金标数据，search_guidelines 搜 UMR 指南）。中文提示词是决策编排的 umr-zh-frag R42，
英文是 umr-tree 种子。界面按 registry
排：左边是上下文（选 wave：sentence 或 document；选每个 wave 的 for_each 项、调上下文窗口：一句话还是前五句），然后是
skill 栏，中间上面是生成内容（画出来的图；点图里的框跳到写它的那一步）、下面是点击运行的步骤，右边是 AI。每一步都能改，改法三种：(1) 直接改 skill；
(2) 改生成内容，AI 自动找 skill 的问题；(3) 告诉 AI 哪里错了，由机器改。导出 `.umr` 时自动补齐 alignment。
导入可选格式：`.txt`（每行一句，或自动分句）；`.umr` 文件重新标注（只抽出原文，忽略原来的标注）；或载入
`.umr` 文件已有的标注：拆成流程本来会走的步骤，每一步都能重跑；按词对齐的转成按字对齐，按字对齐的照原样载入。
标注一步一步来：每一步跑完有三个选择：正确（确认）；加提示重跑（在输入后面加上「human提示：…」，
sent_type 则放进 Jev 看到的 state，以后重跑这一步也带着）；直接修改。之后这一句才能跑下一步，没有「运行到底」；
「所有句子：下一步」让这个 wave 的每一句各跑一步（句子之间同时跑），还没确认的句子不动。只有两波：sentence 和
document；重入没有单独的一波，写 .umr 时自动合并：span 和概念都一样的节点是同一个，antecedent 并到同 span 的节点上。
模型运行时有动画：步骤树里那一步在转、左边那句在闪、输出栏显示谁在回答、已经多少秒。每一步的输出用
Penman 显示，只看关系和内容：要由下一步展开的部分写成 `<node: …>`，片段外的参与者写成 `<outside: …>`。
「导出 .umr」直接产出文件。标注进度每改一次就自动暂存在这个浏览器里（IndexedDB，不上传）：每一步的输出、确认、
提示、模型记录，以及导入的文档；再打开同一篇文档时会问要不要接着上次继续。Python 也在网页里运行（Pyodide），
没有服务器。

网页每一层怎么调用（按钮 → 浏览器里的 Python → 模型服务 → .umr），详见
**[`docs/SKILLPARSE.md`](docs/SKILLPARSE.md)**。

**Key 存在哪**：只存本机 `localStorage`，浏览器直连模型服务（OpenRouter、Anthropic、OpenAI、TypeSafe），
不经过任何服务器（本项目也没有服务器）。标注进度存在同一个浏览器的 IndexedDB 里。

**以前的工作台**（递归 / 并行 / 串联三种标注方式、可改的导入方法、情感和精修格式）已经不在这个目录树里，
在 git 历史和 `obsolete` 分支上。

验收脚本在 **[`docs/verification/`](docs/verification/)**。
