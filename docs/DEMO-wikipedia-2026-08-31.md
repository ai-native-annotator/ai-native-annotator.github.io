# Demo + 倒查验证报告（2026-08-31）

素材：英文维基 **Nancy Grace Roman Space Telescope**（该望远镜 2026-08-30 发射，条目当日在维基首页时事栏）。原文逐字取自条目 Launch 一节，未改写：

```
The telescope was launched as planned on 30 August 2026 at 11:26 UTC.
Soon after separation from the launch vehicle, solar panels deployed and communications were established.
The telescope will undergo a 90-day commissioning phase while traveling to the sun-Earth Lagrange Point 2.
```

存于 `data/samples/wikipedia-roman-telescope-2026.txt`，复现脚本见本文末尾。

---

## 一、逐步分解结果

三句共 **34 次真实模型调用**，全部由用户逐个点击触发（没有一次性批量生成），零控制台报错。

| 句 | 调用数 | 篇章结构 | 展开路径 |
|---|---|---|---|
| 1 | 9 | 无篇章关系（单句） | discourse → clause(predicate+arguments) → np_phrase / clause「as planned」/ special_entity「on 30 August 2026 at 11:26 UTC」→ reentrancy → doc_level |
| 2 | 13 | **并列** `and` | discourse 切出 `:op1` `:op2` 两个子句 + 共享 `:temporal`；`:temporal` 又递归出 `after` → `:op1` 名词化子句 → np |
| 3 | 12 | **从属**（while 时间从句） | discourse 用 `sub` 把 `:temporal` 从句挂到主句上；主句 np 再递归出 `90-day` 数量实体；reentrancy 把控制结构里重复的 telescope 合并成 `{ref}` |

三种篇章路径（无 / 并列 / 从属）都被这三句覆盖到了，这是有意挑的。

---

## 二、倒查验证：分解到底有没有覆盖原文

这是这次新做的东西。原来的浏览器版**根本没有覆盖率检查**——后端 `umr_parser/graph.py` 有 `coverage_report()`，而且 `pipeline.py` 用 `coverage < 0.85` 触发重解析，我当初移植时漏掉了整块。现在补上了 `js/core/coverage.js`，并接进界面（标注树上方的「覆盖率回查」条 + 丢字的节点打 ⚠）。

### 判定口径

每个原文实词被分到三个桶之一：

- **已覆盖**：作为完整词出现在某个节点的 `phrase`，或能对上某个 `concept` 的词干
- **合法省略**：技能文件明确说不标的功能词（冠词、助动词、情态词、被角色名吸收的介词/连词）
- **✖ 真正丢失**：内容词，任何节点都没有交代 —— 只有这一类才是问题

关键的记账规则：**节点自己的 `span`/`phrase` 不算证据**。它是这一步被交付的输入，不是它干了活的证明。

### 最终结果

| 句 | 严格覆盖率 | 合法省略 | 真正丢失 |
|---|---|---|---|
| 1 | 100% | The was as on at | 无 |
| 2 | 100% | from the and were | 无 |
| 3 | 100% | The will a while to the | 无 |

三句分解都是完整的，没有内容词被丢掉。

---

## 三、倒查过程中真正抓到的问题

覆盖率第一版跑出来的数字全是假的。按发现顺序：

### 1. 验证器自身写错：把输入当成了证据（严重）

第一版把每个节点自己的 `span`/`phrase` 也算进「已覆盖」。可是根节点的 phrase 就是整句，于是**任何分解都恒等于 100%**。我用一棵故意丢掉 `as planned` 和 `at 11:26 UTC` 的树去测，它照样报 100%。改成「只认 concept + 常量 + 待展开子节点的 phrase」之后，同一棵树报 66.7%，并点名 `planned / 11:26 / UTC`。

### 2. 句级与步级互相矛盾（暴露了第二个记账错误）

修完之后出现了自相矛盾的输出：句 2 句级说「无丢失」，步级却说 `arguments「separation from the launch vehicle」丢了 separation`。追下去是两个独立缺陷：

- **构词没对上**：`separation` 对 `separate-01`，只做屈折还原（-ed/-ing/-s）匹配不上，误报丢失。
- **句级偷偷多算**：`output.relations` 永远保存模型的原始回答，一个早就被解析掉的槽位在那里仍然写着 `expand:true`。句级把这些**过期的待办短语**也算成了覆盖——等于「只要被列进过 TODO 就算做过了」。改成只从 `children`（活的真相）读待展开状态。

### 3. 三个误报，全是验证器的锅不是标注的锅

改严之后跑出 3 处「丢失」，逐个查下来**标注都是对的，是验证器看不懂**：

| 报的「丢失」 | 实际情况 | 修法 |
|---|---|---|
| `planned` | `plan-01` 覆盖了它，但英语 -ed 前会双写辅音，`planned`→`plann`≠`plan` | 词干还原后折叠双写辅音 |
| `August` | 标注按规范归一成了 `:month 8`，是数字不是词 | 月份名 ↔ 数字对照 |
| `90-day` | 正确拆成了 `:quant 90` + `:unit (day)` | 连字符复合词按part逐个核对 |

每放宽一次，我都回头重跑「故意丢两个修饰语」那个用例，确认它**仍然**报 66.7% —— 否则就是把验证器改成了摆设。

### 4. ★ 后端自己的覆盖率检查是失效的（这条最值得看）

修完之后我发现「后端宽松口径」那一列的数字对不上，去核了一下，结论比预期严重。直接调用他们**自己的函数**验证：

```python
from umr_parser import graph as G
# 一棵故意丢掉 "as planned" 和 "at 11:26 UTC" 的树
cov, missing = G.coverage_report(lossy_root, tokens)
#   根节点带 phrase（= _expand_pending 给每个无篇章关系句子设的整句）
#   → coverage = 1.0, missing = []      ← 丢了两个修饰语，却报满分
#   根节点不带 phrase（并列结构的形状）
#   → coverage = 0.462, missing = ['was','launched','as','planned','on','11:26','UTC.']
```

原因：`coverage_report()` 把每个节点的 `phrase` 也拼进比对用的 blob，再做**子串**匹配。而 `pipeline.py` 的 `_expand_pending()` 对每个展开出来的节点都会 `node.setdefault("phrase", phrase)`——对于 `has_discourse=False` 的句子，根节点的 phrase 就是整句原文。整句原文进了 blob，于是每个 token 都是它的子串，**覆盖率恒为 1.0**。

后果：`pipeline.py` 里那句

```python
if used_discourse and coverage < self.COVERAGE_RETRY_THRESHOLD:
```

对无篇章关系的句子**永远不可能触发**（`used_discourse` 是 False 直接跳过），而对有篇章关系的句子，指标又因为子串比对的另一头——屈折/名词化/归一化对不上——**偏低**（上面 0.462 那次，实际只丢了两个修饰语）。一头过松一头过紧。

顺带解释了 `results/*/report/*.json` 里 250 条 coverage 的分布：154 条是 `0.0`，那是 `parse_document()` 异常分支里写死的值（解析抛异常的句子），不是测量结果；剩下 96 条里 63 条正好 1.0，其中相当一部分就是上面这种恒等于满分的情况。

> 这一条我只在文档里记录，**没有去改 `modular-parsing`** —— 那是另一个仓库，也不在这次的改动范围里。要不要修、怎么修，你定。

---

## 四、AI 聊天到底能不能更新 skill

**验证前的答案是：不能。** 原来的 `ui/chat.js` 只会生成一段 markdown 提案，给个「导出为 .md」按钮，然后就没有然后了——你得自己去改文件。模型下一次调用用的还是原来的技能说明。那不是反馈闭环，是意见箱。

现在补上了 `js/core/skills.js`：技能文本的加载全部改走它，接受的修订以「本地修订」形式追加到技能 markdown 末尾，并在**组装 prompt 时生效**。对话面板的提案上多了一个「应用到技能文件」按钮。

### 验证标准与结果

标准定得很死：**接受修订后，下一次该 skill 的 prompt 里必须真的出现这条新规则**。低于这个标准都算没做到。

```
1. 修订前 arguments 的 prompt 含新规则?          false   ← 基线
2. 对分歧发表意见 → 生成提案                      ✓
3. 点「应用到技能文件」→ 写入 localStorage        ✓
   {"skills/shared/arguments.md":"- 当时间状语同时含日期与时刻时，必须用一个
     :temporal 覆盖完整跨度，不得只保留日期。"}
4. ★ 下一次 arguments 调用的 prompt 含这条规则?   true  ✓ 技能真的被更新了
   prompt 片段：…## 人工修订（本地生效，尚未合入仓库）
                - 当时间状语同时含日期与时刻时，必须用一个 :temporal 覆盖完整跨度…
5. 刷新页面后仍然生效?                            true  ✓
```

零控制台报错。所以现在的答案是：**能**，而且是真的作用在下一次调用上，不是写进一个没人读的文件。

### 边界（老实说）

- 修订存在浏览器本地，**还没有自动提交回仓库**。`io/github.js` 里读写文件和发 PR 的能力都有，把「本地修订」推成一次 commit 是现成的下一步，但我没接，因为往仓库写是不可逆的外部动作，想先让你看过再决定。
- 规则是**追加**到技能文件末尾，不会去改写原文里矛盾的段落。追加式修订在提示词里通常够用（后写的约束会覆盖先写的），但技能文件长期会越滚越长，需要人工定期整理。
- 目前只抽提案里 `>` 引用块内的条款。模型没按格式给引用块时，按钮会明确报错而不是悄悄写入空规则。

---

## 五、复现方式

```bash
python3 -m http.server 8899          # 仓库根目录
# 另开一个终端：
NODE_PATH=/opt/node22/lib/node_modules node wiki-demo.js        # 分解 + 倒查
NODE_PATH=/opt/node22/lib/node_modules node skill-update-test.js # 技能更新验证
```

两个脚本已放进 `docs/verification/`。脚本里的模型回答是我按真实技能文件写的分解，**不是为了让覆盖率好看而调的**——第一版跑出来 3 处「丢失」，是回头查证后确认为验证器误报才修的，修的是验证器不是标注。

## 六、这次改了仓库里的什么

| 文件 | 改动 |
|---|---|
| `js/core/coverage.js` | 新增。严格/宽松两套覆盖率 + 逐步定位 |
| `js/core/skills.js` | 新增。技能文本的加载与本地修订，使修订对下次调用生效 |
| `js/core/pipeline.js` | 技能文本改走 `skills.js`（原来是自己 fetch + 缓存） |
| `js/core/flat.js` | 同上 |
| `js/ui/chat.js` | 提案增加「应用到技能文件」；补上漏掉的 `toast` import |
| `js/ui/panes.js` | 标注树上方增加覆盖率回查条 |
| `js/ui/tree.js` | 丢字的节点打 ⚠ 并在 tooltip 里列出丢了哪些词 |
| `css/app.css` | 覆盖率条与冲突块样式 |
| `data/samples/wikipedia-roman-telescope-2026.txt` | 新增。本次 demo 素材 |

途中还修了一个自己引入的回归：加覆盖率条时把 `artifact` 从 `container.append()` 的参数里漏掉了，导致成品视图整块消失——是回归测试抓出来的，已修复并重跑全套。
