# AI 标注助手 · Annotation Workbench

面向 UMR（统一意义表示）等结构化标注任务的协作标注台。纯静态站点（无后端、无构建步骤），GitHub Pages 直接托管。

在线地址：仓库 Settings → Pages → Source 设为 "GitHub Actions" 后，合并到 `main` 即自动部署。

## 本地运行

```bash
python3 -m http.server 8899
# 打开 http://localhost:8899/
```

必须用 HTTP 打开，不能直接双击 `index.html` —— 代码是 ES modules，`file://` 协议下浏览器会拦截。

## 这个工具做什么

**标注 = 给文本加信息，每一组 label 由一个 skill 负责。** 标注树里每个节点就是一次 skill 调用；
展开一个节点，就是往同一套递归再走一层——这正是 UMR 这类"标注之上再标注"的任务的天然形状。

**一步步标注，不是一次性生成**：导入一份未标注文档后，标注树里会出现"待运行"的节点（discourse
开始，逐步展开 predicate/arguments/np_phrase/special_entity/reentrancy/doc_level），点一个就运行一次
真实的 skill 调用，把结果接回树里，同时把下一步该做什么亮出来。全过程可见 —— 每次调用是成功、
失败还是被代码规则直接判定，都会写进右上角「日志」抽屉，不吞错误。

## 功能

| 功能 | 说明 |
|---|---|
| 数据来源 | 内置语料（回放）、本地文件、Google Drive（你自己的 OAuth Client ID）、GitHub（你自己的 Personal Access Token） |
| AI 标注 | 逐 skill 点击运行，实时调用你自己配置的大模型 API（Anthropic / OpenAI），结果直接长在标注树里 |
| API Key 管理 | 只存本机 `localStorage`；可导出成一个 JSON 文件放进你自己的文件夹，也可以从文件导入 |
| 语音 | 对话框支持语音输入（Web Speech API 识别）与 AI 回复朗读（合成），浏览器原生能力，不经任何服务器 |
| GitHub 协作 | 连接账号后浏览仓库与其 fork、切换分支、读写标注文件 |
| Inter-Annotator 合并 | 把两位标注者的分支当成两个 git 分支：先真实调用 GitHub 合并 API 尝试 `git merge`；冲突（几乎总会冲突，因为两份独立标注很少逐字节相同）时给出逐节点可视化冲突解决界面，裁决结果提交到新分支并可发起 PR |
| 反馈闭环 | 人工编辑 + 写明理由，与模型自己的 rationale 对照，生成可导出的 skill 更新提案（markdown） |
| 格式生成器 | 用一段文字描述新的标注格式，生成声明式 JSON 规格并即时渲染；格式错误只会退化成 JSON 视图，不会崩页面 |

## 验收测试对应关系

1. **"Google Drive 导入未标注 UMR 文件，标注后为空，逐 skill 点击标注"**
   工具栏「导入 ▾」里有两个「示例：模拟 Drive 导入」按钮——和真实 Drive 导入走同一段
   `parseDocument()` 代码，只是跳过真实 OAuth 授权环节（授权本身需要你自己的 Google
   Cloud OAuth Client ID，见「设置」）。导入后标注树为空，标注后文件面板显示"尚未标注"，
   在标注树里点击「待运行」节点即可逐个 skill 标注。
2. **"检查旧版 skill 展示不完整的问题"**
   见下方「关于旧原型的 bug」。
3. **"GitHub fork 连接 + inter-annotator agreement 做成 git merge"**
   工具栏「GitHub」按钮：连接（Personal Access Token）→ 选仓库/fork → 选分支 → 载入/保存标注。
   「Inter-Annotator 合并…」按钮打开合并界面。

## 关于旧原型的 bug（`modular-parsing` 仓库 `claude/annotation-web-ui` 分支）

旧原型是一个只读回放工具：内置的两篇 UMR 演示语料来自真实实验记录（`trace.jsonl`），但
`scripts/build_web_demo.py` 在把记录转成前端 JSON 时，对"句子顶层是并列/从属结构"（discourse
切分出子句）的情况，只会用**整句原文**去匹配 `arguments` 调用——可是这种情况下 `arguments`
调用的是**子句**文本，不是整句，所以匹配永远找不到，导致 discourse 之下预谓词、论元、名词短语
等一整段真实发生过的调用（`callCount` 能看到 10~22 次，但树上只有 3 个节点）被完全漏掉，
且没有任何报错——数据在导出脚本这一步就没被写进 JSON，不是运行时哪里 `try/except` 吞掉的。

更根本的是：旧原型完全没有"从空白继续标注"的能力——`ReplayBackend.run()` 要求节点已经在录制
数据里，`live` 模式的 `LiveBackend` 也只接在"生成 skill 更新提案"和"格式生成器"两处，从未接入
主标注流程。也就是说，导入一份新文档、切到 live 模式、点开一个句子——标注树永远是空的，无法
真正开始标注。

这份新工具的修复方式是同一套机制解决两个问题：标注树里任何"模型说了但没有对应子节点"的位置，
统一渲染成可点击的待运行行（`js/io/sources.js` 的 `normalizeTree`）；点击后调用
`js/core/pipeline.js` 里对 `umr_parser/pipeline.py` 控制流的移植，发起真实调用并把结果接回树里。
旧的两篇回放语料经过这次修复后，之前缺失的子句同样会以「待运行」出现，可以在 live 模式下当场
补完。

## API Key 从哪来、存在哪

- **Anthropic / OpenAI**：在「设置」里填写你自己申请的 key，只存本机 `localStorage`，随时可以
  导出成本地 JSON 文件备份，或从文件导入到另一台机器/浏览器。live 模式下调用直接从浏览器发到
  对应厂商的 API，不经过任何这个项目控制的服务器。
- **Google Drive**：需要你自己在 Google Cloud Console 建一个 OAuth Client ID（本工具没有后端，
  不能替你保管凭据）。
- **GitHub**：需要你自己生成一个 Personal Access Token（`repo` 权限）。之所以用 PAT 而不是标准
  OAuth 授权码流程，是因为 GitHub 的 token 换取端点不支持跨域请求，纯静态站点没有后端去完成那一步
  换取（PAT 等价于"你自己签发、可随时吊销的授权凭据"，与 Drive 的"你自己的 OAuth Client ID"是
  同一种权衡）。

## 代码结构

```
index.html  css/app.css
js/
  core/   state.js registry.js providers.js runner.js pipeline.js flat.js
          settings.js penman.js dom.js log.js
  formats/ umr.js sentiment.js declarative.js
  io/      sources.js drive.js github.js
  ui/      panes.js tree.js assistant.js chat.js studio.js toast.js
           settings-panel.js github-panel.js iaa.js log-panel.js
  voice.js
  app.js
data/
  skills/    从 modular-parsing 仓库原样搬运的技能定义（.md），live 模式下作为真实 prompt 使用
  demo/      内置语料（回放）
  samples/   未标注示例文档（"模拟 Drive 导入"用）
  resources/ 从 modular-parsing 导出的静态参考表（如 abstract rolesets）
```

设计上的复用点：`core/pipeline.js`（UMR 递归流程）、`core/flat.js`（并行格式的通用单步执行）、
`core/providers.js`（大模型厂商适配）三者都与 UI 无关；格式模块只管两块面板怎么画，
数据来源模块只管怎么把文本变成同一份文档结构。加新格式 = 加一个 `formats/*.js` 或用格式生成器
产一份规格；加新大模型厂商 = 在 `providers.js` 里加一项。

## 与 `modular-parsing` 后端 skill 框架的关系

`data/skills/` 下的文件直接搬自 `modular-parsing` 仓库的 `skills/**/*.md`，`core/pipeline.js` 的
控制流是对 `umr_parser/pipeline.py` 与 `umr_parser/modules/*.py` 的逐行移植（书面 skill 定义在
两边完全一致，只是执行环境从"headless `claude -p` 子进程"换成"浏览器直连 API"）。前端 skill id 与
后端模块名一一对应，所以这里产出的 skill 更新提案可以直接落到后端那份技能定义上。有两处受限于
纯前端环境做了简化，均在代码注释里标注：一是 PropBank/NER 参考表没有随 `.xlsx`/`.xml` 资源一起
搬运（改为提示模型使用其自身训练知识中的标准 sense id / 头概念），二是 inter-annotator 的结构
对齐是按 `skill::span` 做简化匹配，不是完整的 smatch/AnCast 图匹配算法。
