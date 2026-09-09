# Annotation Workbench · AI 标注助手

A workbench for structured annotation — UMR, dependency-style graphs, sentiment, whatever you
define — where **the method is a set of skills you can read, edit, and argue with.** Static site:
no backend, no build step, no account. Your model key stays in your browser.

→ **[ai-native-annotator.github.io](https://ai-native-annotator.github.io/)**

## Run it locally

```bash
python3 serve.py     # then open http://localhost:8899/
```

**Do not double-click `index.html`.** The code is ES modules, and over `file://` the browser
refuses to load anything under `js/` on CORS grounds. The page still draws, so it looks like it
works — but not one line of JavaScript has run, and every button is dead. A red banner at the top
says so when that happens.

Use the bundled `serve.py` rather than `python3 -m http.server`: the only difference is that it
disables caching, which matters more than it sounds. `http.server` answers `304 Not Modified` per
file, so after a `git pull` you can end up running a new `i18n.js` against an old `state.js`. One
module importing a name its neighbour does not export yet fails the **whole module graph** — again
with a page that renders perfectly and does nothing.

## What it does

**Annotation is adding information to text, and each kind of information is one skill's job.**
A skill is a markdown file of instructions — the same files the research pipeline uses — sent to a
model you choose with a key you own.

Three shapes of work, because tasks genuinely differ:

| Shape | What a call owns | Example |
|---|---|---|
| **Recursive** | a span, which it decomposes into more spans | UMR: a clause spawns its arguments, which spawn noun phrases |
| **Flat** | the whole sentence, independently of the others | sentiment: polarity, aspect, intensity in any order |
| **Chained** | the whole graph, which it rewrites | refine: one-shot draft, then roleset → aspect → entity → validate |

A document is text; which shape you use is a separate choice you can change at any time, and each
method keeps its own work — annotate with skills, switch to refinement, switch back, nothing is lost.

**Step by step, not one shot.** Import an unannotated file and the tree shows rows waiting to run.
Click one and it makes a real call, splices the result in, and reveals what comes next. Or press
*Run the rest* and independent slots go out in parallel.

**Everything the model produced is editable, and the edit is the annotation.** Correct a node in
Penman and the finished graph changes immediately — not a copy of it, the thing itself.

**Skills do not update themselves.** A correction, a re-run, a swapped skill, an objection in the
chat: each is filed as an issue against that skill. A human reviews the batch, reflection drafts one
amendment from what was kept, and a human applies it. A rule generalised from a single case is how
guidelines rot.

## What you can change

| Thing | Where |
|---|---|
| **How a file is read** | Import ▸ *File reader…* — per format, edit it, or describe your files and have one drafted. Ships with plain-text and CoNLL-U readers. Dry-run before adopting. |
| **What a skill says** | Skills pane ▸ any skill ▸ *Skill file* — it is the prompt; edit and save, the next call uses it. |
| **What a skill does** | Some steps are programs, not prompts. The refine chain's `validate` pass is JavaScript you can edit (`data/reference/refine/validate.js`). |
| **A whole new format** | *Format studio*, or a `js/formats/*.js` module. |

Authored code runs in a Web Worker with no DOM, no storage, no network and a deadline. The page
itself never evaluates a string.

## Keys and privacy

There is no server in this project. In live mode your browser calls Anthropic or OpenAI directly.

- **Model keys** live in `localStorage` only. Export them to a JSON file for backup, import on
  another machine. Nothing is transmitted anywhere except to the provider you picked.
- **Google Drive** needs your own OAuth Client ID; **GitHub** needs your own Personal Access Token.
  A static site has no backend to hold credentials on your behalf, and that is the trade.

## Layout

```
index.html  css/app.css  serve.py
js/
  core/     state work registry providers runner pipeline chain flat edits
            skills reflection importers sandbox penman coverage i18n net dom log settings
  formats/  umr sentiment refine declarative
  io/       sources drive github
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

**[`docs/CODE_WALKTHROUGH.md`](docs/CODE_WALKTHROUGH.md)** (中文) is a file-by-file, function-by-function
tour: the core data structures, the full call chain behind one click, and a "to change X, edit Y" table.

**[`docs/verification/`](docs/verification/)** holds the Playwright checks. They are in the repo on
purpose — each one exists because something broke, and its header says what.

## "Chrome says CSP blocks eval"

That error is not from this page. This project ships no CSP at all and never evaluates a string;
`docs/verification/csp-test.js` proves the page boots with **zero violations** under
`script-src 'self'` (no `unsafe-eval`, no `unsafe-inline`). So the block comes from outside the page:
open an incognito window (extensions off) — if it works, it is an extension; expand the Issues entry
and look at *Source location*; check `chrome://policy` for an enterprise policy.

## Deploying

**Settings → Pages → Source = "GitHub Actions"** has to be done once by someone with admin rights;
until then the URL 404s no matter how many times you push. After that, pushing to the default branch
triggers `.github/workflows/pages.yml`.

---

## 中文说明

这是一个**结构化标注工作台**：UMR、依存式图结构、情感标注，或者你自己定义的格式。核心想法是
**标注方法本身就是一组 skill，你可以读它、改它、跟它吵架**。纯静态站点，无后端、无构建步骤，
模型 key 只存在你自己的浏览器里。

**本地运行**：`python3 serve.py`，然后打开 `http://localhost:8899/`。
**不要双击 `index.html`** —— ES module 在 `file://` 下会被浏览器以 CORS 为由全部拒绝加载，页面照样
画得出来，但一行 JS 都没跑，所有按钮都是死的（页面顶部有红色横幅专门说明这件事）。请用仓库自带的
`serve.py` 而不是 `python3 -m http.server`：区别只有「禁用缓存」一条，但 `git pull` 之后新旧模块
混用会让整张模块图链接失败，而页面看起来完全正常。

**三种标注形状**：递归（一次调用负责一个片段，并把它拆成更多片段 —— UMR）、并行（每次调用负责整句，
彼此独立 —— 情感）、串联（每次调用负责整张图并重写它 —— 精修）。**文档是文本，用哪种方法是另一件事**，
随时可以换，而且每种方法各自保存自己的成果，换来换去不会丢。

**逐步标注，不是一次性生成**：导入未标注文件后，标注树里会出现「待运行」的行，点一个就发起一次真实
调用，把结果接回树里，并亮出下一步。也可以按「跑完本句」，互不依赖的位置会并行发出。

**模型产出的一切都可以改，而且改完就是标注本身** —— 用 Penman 改一个节点，右边的成品图当场变化。

**技能不会因为一次修改就更新**：人工修改、重跑、换技能、对话里的异议，都只记成该技能的一条问题记录；
人工审核整批之后才反思出一条修订，再由人按下「应用」才进入提示词。

**可以改什么**：文件导入方法（「导入 ▸ 文件导入方法…」，每种格式一份，可以让模型按你的描述生成，
保存前先试跑）、技能说明（技能面板里直接编辑，保存后下一次调用即生效）、技能的代码（精修链最后
一步 `validate` 是真的在跑的 JavaScript）。人写的代码在 Web Worker 沙箱里执行 —— 无 DOM、无存储、
无网络、有超时；页面本身永远不求值字符串。

**Key 存在哪**：只存本机 `localStorage`，live 模式下浏览器直连厂商 API，不经过本项目的任何服务器
（本项目也没有服务器）。Google Drive 需要你自己的 OAuth Client ID，GitHub 需要你自己的 PAT。

读代码请看 **[`docs/CODE_WALKTHROUGH.md`](docs/CODE_WALKTHROUGH.md)**；验收脚本在
**[`docs/verification/`](docs/verification/)**，每一个都是因为出过事才写的，头注释里写着守的是什么。
