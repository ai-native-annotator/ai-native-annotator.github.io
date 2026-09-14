# 架构与扩展边界

这份文档回答两个维护问题：新功能应该放哪一层，以及哪些不变量不能绕过。逐文件导览见
[`CODE_WALKTHROUGH.md`](CODE_WALKTHROUGH.md)。

## 依赖方向

```text
app / ui / formats / io
          │
          ▼
core 兼容门面与运行编排
          │
          ▼
application 用例层 ──────► adapters 持久化边界
          │
          ▼
domain 纯领域对象与规则
```

- `js/domain/` 只放可确定、可单测的业务规则。它不读 DOM、`localStorage`、网络或全局状态。
- `js/application/` 组合领域对象完成一个用例，例如生成候选、评估、发布和回滚。
- `js/adapters/` 隔离浏览器存储等外部机制。应用层通过小接口使用它们；当前应用模块仍直接选择
  localStorage 作为默认 adapter，但测试和后续宿主可注入替代实现。
- `js/core/` 保留运行引擎与旧调用面的兼容门面。`core/skills.js` 不再拥有版本规则，只把旧的
  “文件路径 + 文本”调用翻译给应用层。
- `js/io/` 负责不可信字节进入或离开系统的边界；`js/ui/` 只负责交互和展示。

新增领域规则时从 `domain` 开始；不要把规则塞进按钮回调、`localStorage` 读写或导入解析器。

## 核心记录

| 记录               | 稳定身份与职责                                                                   |
| ------------------ | -------------------------------------------------------------------------------- |
| `FeedbackEvent`    | 把一次人工反馈绑定到精确的 `skillId`、`revisionId`、`callId`、文档、句子和跨度。 |
| `SkillRevision`    | Skill 内容的不可变快照；prompt 和可执行代码都使用同一个版本模型。                |
| `SkillCandidate`   | 把反馈证据、基线修订和待发布修订连在一起；候选不会自动成为当前版本。             |
| `EvaluationReport` | 保存 targeted、holdout、schema 三组门槛及结果；失败不能发布。                    |
| `RunRecord`        | 保存一次调用所用的稳定 Skill、确切修订、prompt 指纹、响应和耗时。                |
| `SkillLifecycle`   | 保存全部修订和审计事件；回滚只移动 active 指针，不删除历史。                     |

Skill 使用 `skill://<namespace>/<name>` 作为稳定身份。界面里的短名只用于显示和执行，不能用于
关联反馈；例如 `skill://sentiment/aspect` 与 `skill://refine/aspect` 是两个不同 Skill。

## 从反馈到 Skill 的闭环

```text
人工修改 / 重跑 / 换路由 / 异议
              │
              ▼
        FeedbackEvent
              │ 人工保留有效证据
              ▼
     AI 或本地模板生成候选
              │
              ▼
   targeted + holdout + schema 评估
              │ 通过后仍需人工确认
              ▼
     发布新修订 ──────► 下一次调用
              │
              └────────► 可审计回滚
```

当前自动评估是诚实的结构门：验证证据关联、候选非空、旧指令得到保留，并把 targeted 与
holdout 分开。它不冒充语义质量评测。以后接入任务级 evaluator 时，产出同一个
`EvaluationReport`，发布规则不需要改变。

直接在 Skill 文件编辑器里的人工改写属于明确的人类授权，会创建并激活一个新修订；由反馈自动
生成的内容必须经过候选、评估和人工发布，不能走这条捷径。

## 任意文件导入边界

`js/io/sources.js` 的路由顺序是固定的：

1. 只有带 `documentType: "ai-native-annotator/document"` 和受支持版本的文件，或满足严格条件的
   老导出，才作为本工具文档打开。
2. 其他所有内容原样交给当前格式的 reader，包括 `.json`、`.jsonl` 和未知扩展名。
3. 没有自定义 reader 时才使用纯文本解析。
4. reader 报错必须中止并保留当前文档；禁止静默降级成“看起来导入成功”的文本。

reader 是在无 DOM、存储和网络权限且有超时的 Worker 中运行的代码。保存 reader 前，用户必须用
当前代码和样例成功 dry-run；代码或样例变化后需要重新试跑。导出文件可以携带 reader 源码快照，
但重新打开文档绝不会自动执行或安装这些源码。

## 文档与可复现性

新导出使用显式 `documentType` 和 `schemaVersion`。文档、句子、Skill 和调用都有稳定身份；导出还会
带上与当前文档有关的反馈、Skill 修订、reader 以及完整 `RunRecord`。`workspaceSnapshot` 的激活策略
固定为 `manual-merge-required`，所以导入外部文件不会覆盖本机工作区。

## 扩展点

- 新文件类型：在“文件 reader”面板描述格式并生成/编辑 `parse(text, filename)`，不需要改文件选择器。
- 新标注格式：简单格式优先用 Format Studio 的声明式规格；需要专门流程时新增
  `js/formats/<id>.js`，并为每个 Skill 提供 namespace 或完整 `skillId`。
- 新 Skill 生成器：输出候选文本和真实 `FeedbackEvent[]`，调用应用层的候选用例；不要直接写当前文本。
- 新评估器：生成互不重叠的 targeted/holdout case 结果，再创建 `EvaluationReport`。
- 新存储：实现 `{ read(fallback), write(value), remove() }`，通过 `useSkillWorkspaceStore()` 注入；领域层无需改动。

## 当前仍需继续收口的边界

- `core/registry.js` 仍从 core 动态加载具体 format；长期应由组合根注入格式注册表。
- UI 仍直接调用部分 UMR pipeline 契约；长期应让所有格式只暴露统一的运行端口。
- importer、reflection journal 和 settings 仍各自直接访问 localStorage；应逐步迁到 adapters。
- replay 索引已经按句子、Skill 和 span 隔离；同一句中完全相同 Skill 与 span 的多次调用若要分别回放，
  还需要把节点路径或 call id 纳入查询键。

## 验证要求

提交前运行：

```bash
npm run check
npm run test:browser
```

纯领域不变量放在 `test/skill-evolution.test.mjs`，应用与持久化流程放在
`test/skill-revisions-application.test.mjs`；真实浏览器中的导入边界和 Skill 闭环分别由
`docs/verification/import-pr1-test.js` 与 `docs/verification/skill-revision-test.js` 守住。
