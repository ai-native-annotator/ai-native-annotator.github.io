# Annotation Workbench · AI 标注助手

A workbench for structured annotation — UMR, dependency-style graphs, sentiment, whatever you
define — where **the method is a set of skills you can read, edit, and argue with.** Static site:
no backend, no build step, no account. Your model key stays in your browser.

→ **[ai-native-annotator.github.io](https://ai-native-annotator.github.io/)** — the front page is the
**SkillParse workbench** (below); the earlier workbench described in the rest of this file is at
[`classic.html`](https://ai-native-annotator.github.io/classic.html).

## Run it locally

```bash
npm run serve     # then open http://localhost:8899/ (SkillParse) or /classic.html
```

**Do not double-click the HTML files.** The code is ES modules, and over `file://` the browser
refuses to load anything under `js/` on CORS grounds. The page still draws, so it looks like it
works — but not one line of JavaScript has run, and every button is dead. A red banner at the top
says so when that happens.

Use the bundled `serve.py` rather than `python3 -m http.server`: the only difference is that it
disables caching, which matters more than it sounds. `http.server` answers `304 Not Modified` per
file, so after a `git pull` you can end up running a new `i18n.js` against an old `state.js`. One
module importing a name its neighbour does not export yet fails the **whole module graph** — again
with a page that renders perfectly and does nothing.

## Development checks

The deployed site still has no build step. Node is used only for reproducible development checks:

```bash
npm install
npm run check                 # Node tests, lint, gradual JS type-check, formatting
npx playwright install chromium
npm run test:browser          # starts the local server and runs browser verification
```

Run one browser regression with `npm run test:browser -- provider-test.js`. The runner uses the
Chromium installed by this project's Playwright dependency; set `CHROME` only when deliberately
testing a different browser executable.

## What it does

**Annotation is adding information to text, and each kind of information is one skill's job.**
A skill is a markdown file of instructions — the same files the research pipeline uses — sent to a
model you choose with a key you own.

Three shapes of work, because tasks genuinely differ:

| Shape         | What a call owns                                | Example                                                           |
| ------------- | ----------------------------------------------- | ----------------------------------------------------------------- |
| **Recursive** | a span, which it decomposes into more spans     | UMR: a clause spawns its arguments, which spawn noun phrases      |
| **Flat**      | the whole sentence, independently of the others | sentiment: polarity, aspect, intensity in any order               |
| **Chained**   | the whole graph, which it rewrites              | refine: one-shot draft, then roleset → aspect → entity → validate |

A document is text; which shape you use is a separate choice you can change at any time, and each
method keeps its own work — annotate with skills, switch to refinement, switch back, nothing is lost.

**Step by step, not one shot.** Import an unannotated file and the tree shows rows waiting to run.
Click one and it makes a real call, splices the result in, and reveals what comes next. Or press
_Run the rest_ and independent slots go out in parallel.

**Everything the model produced is editable, and the edit is the annotation.** Correct a node in
Penman and the finished graph changes immediately — not a copy of it, the thing itself.

**Skills evolve from evidence, with a human-controlled publish step.** A correction, re-run, swapped
skill, or chat objection becomes feedback tied to the exact Skill revision and model call. After a
human keeps the useful evidence, reflection generates a versioned candidate and evaluates it against
targeted and holdout cases. Only a passing candidate that a human publishes reaches the next prompt;
every version remains auditable and reversible.

## What you can change

| Thing                  | Where                                                                                                                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **How a file is read** | Import ▸ _File reader…_ — per format, edit it, or describe your files and have one drafted. Ships with plain-text and CoNLL-U readers. Dry-run before adopting. |
| **What a skill says**  | Skills pane ▸ any skill ▸ _Skill file_ — it is the prompt; edit and save, the next call uses it.                                                                |
| **What a skill does**  | Some steps are programs, not prompts. The refine chain's `validate` pass is JavaScript you can edit (`data/reference/refine/validate.js`).                      |
| **A whole new format** | _Format studio_, or a `js/formats/*.js` module.                                                                                                                 |

Authored code runs in a Web Worker with no DOM, no storage, no network and a deadline. The page
itself never evaluates a string.

## SkillParse steps (`index.html`, the front page)

The front page runs a **SkillParseUMR registry the way `src/runner.py` runs it**, in the browser:
the Python files run in Pyodide in a Web Worker (`data/skillparse/`, `js/skillparse/`). Only
`sent_type` is `kind: jev` (rules list the options, **Jev** answers the closed questions, from
decision-orchestration V12); every other model skill (`discourse`, `predicate`, `np_phrase`,
`special_entity`, `document`) is `kind: agent`: its `skill.md` is the prompt and **Haiku** answers,
with the skill's tools (`get_example`, `propbank_lookup`), as `src/skill_callable.py` does. The
Chinese prompts are decision-orchestration's `umr-zh-frag` R42, the English ones the `umr-tree` seed.
Jev goes through OpenRouter; Haiku through the OpenRouter key or straight to the Anthropic API with an Anthropic key, as chosen in ⚙. The layout follows the registry:

| Pane          | What it holds                                                                                                                                                                                      |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Context**   | the waves (wave 1, 2, 3 …), each wave's `for_each` items to pick from, and its context windows: one sentence, the five before it, or any `range`                                                   |
| **Skills**    | every skill, its kind (jev / rule), what the dispatcher starts after it, and its files (`.py`, `prompts.yaml`) to edit                                                                             |
| **Generated** | top: the sentence's graph, drawn (click a box to reach the step that wrote it), and the selected step's output (as Penman and JSON), input, questions and answers; bottom: the steps, click to run |
| **AI**        | reflection on the selected step                                                                                                                                                                    |

**Import, annotate, export.** Import takes a `.txt` (one sentence per line, or split into
sentences) or a `.umr` file to annotate again: only its sentences are kept, its annotation is
dropped. Annotation goes one step at a time. A finished step gets one of three answers: **correct**
(confirm it), **re-run with a hint** (the hint is written after the step's input as
`human提示：…`, or put in the state Jev sees for sent_type, and stays with the step), or **edit
directly**. Only then can its sentence run the next step; nothing runs a sentence to the end by
itself. **All sentences: next step** runs the next step of every sentence of
the wave side by side, leaving alone any sentence whose step is not confirmed. A step's output is
shown as Penman, relations and concepts only, with `<node: …>` for a part a later step builds and
`<outside: …>` for a participant written outside the piece. **Export .umr** writes the file,
alignments counted in characters for Chinese and filled in where the output left `0-0`.

Every step can be corrected, and a correction is a skill change in one of three ways: **(1)** edit
the skill file yourself; **(2)** correct the step's output — the AI compares it with the machine's
and proposes the skill edit that would have produced it; **(3)** say what is wrong and let the AI
edit the skill. Edits are versioned in the browser and the step can be re-run to check them.
Export writes the `.umr` file, with alignments left at `0-0` filled in from the words.

Settings can also have you answer sent_type's questions instead of Jev.

## Keys and privacy

There is no server in this project. In live mode your browser calls Anthropic or OpenAI directly.

- **Model keys** live in `localStorage` only. Export them to a JSON file for backup, import on
  another machine. Nothing is transmitted anywhere except to the provider you picked.
- **Google Drive** needs your own OAuth Client ID; **GitHub** needs your own Personal Access Token.
  A static site has no backend to hold credentials on your behalf, and that is the trade.

## Layout

```
index.html  (SkillParse) css/skillparse.css  js/skillparse/  data/skillparse/
classic.html  css/app.css  serve.py
js/
  domain/   immutable feedback, Skill revisions, candidates, evaluations, run records
  application/  Skill evolution use cases: propose, evaluate, publish, roll back
  adapters/ browser storage behind a small replaceable interface
  core/     state work registry providers runner pipeline chain flat edits
            compatibility facades, reflection, importers, sandbox, penman, i18n
  formats/  umr sentiment refine declarative
  io/       document boundary, sources, drive, github
  ui/       panes tree assistant chain chat skill-panel importer-panel
            studio settings-panel github-panel iaa log-panel toast
  app.js  boot-guard.js  sandbox-worker.js  voice.js
data/
  skills/     skill instructions (verbatim from the modular-parsing repo)
  reference/  the implementations those instructions were ported from
  importers/  the shipped file readers, as editable source
  demo/       recorded corpora (replay mode)
  samples/    unannotated documents
docs/verification/   Playwright checks — see its README
```

Reusable by design: `core/pipeline.js`, `core/chain.js`, `core/flat.js` and `core/providers.js`
know nothing about the UI; a format module only decides how two panes draw.

## Reading the code

Start with **[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)** (中文) for dependency direction,
non-negotiable invariants, the feedback-to-Skill lifecycle, and extension points.

**[`docs/CODE_WALKTHROUGH.md`](docs/CODE_WALKTHROUGH.md)** (中文) is a file-by-file, function-by-function
tour: the core data structures, the full call chain behind one click, and a "to change X, edit Y" table.

**[`docs/verification/`](docs/verification/)** holds the Playwright checks. They are in the repo on
purpose — each one exists because something broke, and its header says what.

## "Chrome says CSP blocks eval"

That error is not from this page. This project ships no CSP at all and never evaluates a string;
`docs/verification/csp-test.js` proves the page boots with **zero violations** under
`script-src 'self'` (no `unsafe-eval`, no `unsafe-inline`). So the block comes from outside the page:
open an incognito window (extensions off) — if it works, it is an extension; expand the Issues entry
and look at _Source location_; check `chrome://policy` for an enterprise policy.

## Deploying

Pushing to `main` deploys (the earlier default branch is kept as `obsolete`). Two things about GitHub Pages have already bitten this
project, so they are worth stating:

- **`.nojekyll` is load-bearing.** While Pages is set to deploy _from a branch_, GitHub runs its own
  Jekyll build over the repository, and Jekyll silently drops every path whose name starts with `_`.
  Two of ours do — `js/domain/_value.js`, which eight modules import, and
  `data/skills/shared/_node_schema.md`, which four prompts include. A 404 anywhere in an ES module
  graph fails the **whole** graph, so the site served its static layout and ran no JavaScript at all
  while every local check passed. `.nojekyll` turns that build off.
- **Check the deploy, not just the checkout.** Everything else here runs against `serve.py`, which
  serves the working tree exactly as it is; a host does not have to.

```bash
npm run check:deploy      # walks the live module graph and reports anything the host won't serve
```

Setting **Settings → Pages → Source = "GitHub Actions"** makes `.github/workflows/pages.yml` the
only publisher and removes the Jekyll build from the picture entirely. Until someone with admin
rights does that, GitHub's automatic `pages build and deployment` also runs on every push and
whichever finishes last wins.

---

## 中文说明

这是一个**结构化标注工作台**：UMR、依存式图结构、情感标注，或者你自己定义的格式。核心想法是
**标注方法本身就是一组 skill，你可以读它、改它、跟它吵架**。纯静态站点，无后端、无构建步骤，
模型 key 只存在你自己的浏览器里。

**本地运行**：`python3 serve.py`，然后打开 `http://localhost:8899/`。
**不要双击 HTML 文件** —— ES module 在 `file://` 下会被浏览器以 CORS 为由全部拒绝加载，页面照样
画得出来，但一行 JS 都没跑，所有按钮都是死的（页面顶部有红色横幅专门说明这件事）。请用仓库自带的
`serve.py` 而不是 `python3 -m http.server`：区别只有「禁用缓存」一条，但 `git pull` 之后新旧模块
混用会让整张模块图链接失败，而页面看起来完全正常。

**三种标注形状**：递归（一次调用负责一个片段，并把它拆成更多片段 —— UMR）、并行（每次调用负责整句，
彼此独立 —— 情感）、串联（每次调用负责整张图并重写它 —— 精修）。**文档是文本，用哪种方法是另一件事**，
随时可以换，而且每种方法各自保存自己的成果，换来换去不会丢。

**逐步标注，不是一次性生成**：导入未标注文件后，标注树里会出现「待运行」的行，点一个就发起一次真实
调用，把结果接回树里，并亮出下一步。也可以按「跑完本句」，互不依赖的位置会并行发出。

**模型产出的一切都可以改，而且改完就是标注本身** —— 用 Penman 改一个节点，右边的成品图当场变化。

**技能会从证据中演化，但发布权在人手里**：人工修改、重跑、换技能、对话异议都会绑定到精确的
Skill 修订与调用；审核保留后，AI 自动生成带版本的候选并做 targeted / holdout / schema 检查，只有
通过且由人确认发布的候选才进入下一次提示词。所有历史都可审计、可回滚。

**可以改什么**：文件导入方法（「导入 ▸ 文件导入方法…」，每种格式一份，可以让模型按你的描述生成，
保存前先试跑）、技能说明（技能面板里直接编辑，保存后下一次调用即生效）、技能的代码（精修链最后
一步 `validate` 是真的在跑的 JavaScript）。人写的代码在 Web Worker 沙箱里执行 —— 无 DOM、无存储、
无网络、有超时；页面本身永远不求值字符串。

**SkillParse 逐步标注（首页 `index.html`；原来的工作台在 `classic.html`）**：严格按 SkillParseUMR 的
Runner（`src/runner.py`、`src/skill_callable.py`）在浏览器里跑一个 registry（Pyodide，Python 文件不改）：
只有 sent_type 是 `kind: jev`（规则列选项，Jev 回答封闭问题，来自决策编排 V12）；其余调模型的 skill
（discourse、predicate、np_phrase、special_entity、document）都是 `kind: agent`：skill.md 就是提示词，
直接交给 Haiku，带 skill 的工具（get_example、propbank_lookup）。中文提示词是决策编排的 umr-zh-frag R42，
英文是 umr-tree 种子。界面按 registry
排：左边是上下文（选 wave 1/2/3、选每个 wave 的 for_each 项、调上下文窗口：一句话还是前五句），然后是
skill 栏，中间上面是生成内容（画出来的图；点图里的框跳到写它的那一步）、下面是点击运行的步骤，右边是 AI。每一步都能改，改法三种：(1) 直接改 skill；
(2) 改生成内容，AI 自动找 skill 的问题；(3) 告诉 AI 哪里错了，由机器改。导出 `.umr` 时自动补齐 alignment。
导入可选格式：`.txt`（每行一句，或自动分句），或 `.umr` 文件重新标注（只抽出原文，忽略原来的标注）。
标注一步一步来：每一步跑完有三个选择：正确（确认）；加提示重跑（在输入后面加上「human提示：…」，
sent_type 则放进 Jev 看到的 state，以后重跑这一步也带着）；直接修改。之后这一句才能跑下一步，没有「运行到底」；
「所有句子：下一步」让这个 wave 的每一句各跑一步（句子之间同时跑），还没确认的句子不动。每一步的输出用
Penman 显示，只看关系和内容：要由下一步展开的部分写成 `<node: …>`，片段外的参与者写成 `<outside: …>`。
「导出 .umr」直接产出文件。

**Key 存在哪**：只存本机 `localStorage`，live 模式下浏览器直连厂商 API，不经过本项目的任何服务器
（本项目也没有服务器）。Google Drive 需要你自己的 OAuth Client ID，GitHub 需要你自己的 PAT。

先看 **[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)** 理解依赖方向和不变量，再看
**[`docs/CODE_WALKTHROUGH.md`](docs/CODE_WALKTHROUGH.md)** 逐文件阅读；验收脚本在
**[`docs/verification/`](docs/verification/)**，每一个都是因为出过事才写的，头注释里写着守的是什么。
