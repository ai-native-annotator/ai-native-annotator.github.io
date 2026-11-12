# registry.yaml 语法说明

一个 skillset 目录里只有一个 `registry.yaml`，用来描述三件事：

- 有哪些 skill；
- 每个 skill 跑完之后，下一步起哪些 skill；
- 整篇文档分几波处理。

Runner 读这个文件，再结合 InputHandler 读出来的 `Annotation`，把整篇文档跑完。

> 状态：解析和加载时检查在 `src/registry.py`（`Registry.load`、`evaluate`、`holds`），第 6 节的运行过程在 `src/runner.py`，把 worktree 写成输出文件的是 output handler（`src/output_handler/`）。

---

## 1. 文件结构

```yaml
waves:     # 分几波跑，每一波从哪个 skill 开始，初始输入从哪来
skills:    # 每个 skill 的目录、输入、产出、存什么
dispatcher:   # 每个 skill 跑完之后起哪些新 skill
```

这三个顶层键都必须有，不允许出现其他顶层键。

### 术语

| 词 | 意思 |
|---|---|
| wave | 一波处理。各波按顺序执行，上一波全部结束后才开始下一波。 |
| episode | 一波里的一次独立运行，比如“处理第 3 句”。每个 episode 有自己的 queue 和自己的一棵树。 |
| node | episode 里每 run 一次 skill，就生成一个节点。 |
| queue | 等待运行的节点。queue 变空，这个 episode 就结束。 |
| worktree | 一波里所有 episode 的树，同一波和后面的波都可以读取。 |

---

## 2. `waves`

`waves` 是一个列表，按顺序执行。

```yaml
waves:
  - name: sentence
    start: sent_type
    parallel: 10
    max_depth: 12
    max_nodes: 200
    init_input:
      for_each:
        sentence: annotation.sents
      context:
        sent: sentence.text
        token_sent: sentence.numbered_tokens
        lang: annotation.lang
      input:
        span: sentence.span
```

| 键 | 必填 | 说明 |
|---|---|---|
| `name` | 是 | 这一波的名字。用 `worktree.<name>` 读它的结果，所以各波的名字不能重复。 |
| `start` | 是 | 每个 episode 的第一个 skill，必须在 `skills` 里有定义。 |
| `parallel` | 否 | 同时运行的 episode 数量，默认 1，也就是串行。 |
| `max_depth` | 否 | 树的最大深度。根节点的深度为 0，超过这个深度的节点不再创建。默认不限制。 |
| `max_nodes` | 否 | 一个 episode 最多创建多少个节点，超过之后不再创建。默认不限制。 |
| `init_input` | 是 | 初始输入从 Annotation 和 worktree 里取哪些东西，见下面三个子键。 |

### 2.1 `init_input.for_each`

```yaml
for_each:
  <名字>: <列表表达式>
  <名字>: <列表表达式>    # 可以写多个
```

- 列表里的每一项各起一个 episode，这一项在表达式里用 `<名字>` 来引用。
- 可以写多个键值对，几个列表按位置配对：第 i 个 episode 拿到每个列表的第 i 项。这几个列表必须一样长，运行时检查，不一样长就报错。比如句子和上一波的树一起遍历：
  ```yaml
  for_each:
    sentence: annotation.sents
    tree: worktree.sentence
  ```
- 如果省略 `for_each`，整篇文档只起一个 episode，表达式里直接用 `annotation`。
- episode 的顺序和列表的顺序一致，`worktree.<name>` 也按这个顺序排列，所以 `worktree.<name>` 的第 i 项对应列表的第 i 项。
- 当前这一项在列表里的位置，就是 `window` 的基准，见 5.2 节。for_each 只给出当前这一项；要取前后若干项，用 `window`。

### 2.2 `init_input.context`

```yaml
context:
  <变量名>: <表达式>
```

- 这个 episode 里的每一个 skill 都会自动拿到这些变量。它们在整个 episode 里保持不变。
- 适合放整句、语言、前几句这类所有 skill 都要用、而且不会随分支变化的东西。
- context 的变量名不能和任何 skill 的 `input` 变量重名。

### 2.3 `init_input.input`

```yaml
input:
  <变量名>: <表达式>
```

- 只传给 `start` 这个 skill，也就是根节点。
- 变量必须和 `start` 这个 skill 在 `skills` 里声明的 `input` 完全一致，不多也不少。

### 2.4 context 和 input 的区别

| | context | input |
|---|---|---|
| 在哪里设置 | 只在 `init_input.context` 里设置一次 | 根节点的在 `init_input.input` 里设置，之后每条规则的 `input:` 设置子节点的 |
| 谁能拿到 | 这个 episode 里的所有节点，自动给 | 只有那一个节点 |
| 会不会变 | 整个 episode 里不变 | 每往下一层都可能变 |
| 在 `skills` 里要不要声明 | 不用 | 要 |

---

## 3. `skills`

```yaml
skills:
  discourse:
    path: discourse
    input:
      span: list[int]
    emit:
      relation: str
      parts: list[dict]
    store: [relation]
```

| 键 | 必填 | 说明 |
|---|---|---|
| `path` | 是 | skill 的目录，相对于 registry.yaml 所在的目录。 |
| `input` | 否 | 每次调用这个 skill 时必须提供的变量，格式为 `变量名: 类型`。wave 的 context 会另外自动给，这里不用写。 |
| `emit` | 是 | 产出的字段，格式为 `字段名: 类型`。 |
| `store` | 否 | `emit` 里哪些字段存进 worktree 的节点，默认 `[]`。 |
| `kind` | 否 | `agent`（默认）：用 skill.md 调模型。`rule`：不调模型，执行目录里 `<skill 名>.py` 的 `run()`，见 3.1。 |

### 3.1 skill 目录

```
discourse/
  skill.md      # prompt 模板（必须有）
  tools/        # 可选：每个 .py 文件里不以 _ 开头的函数都会注册成工具
    foo.py
  reference/    # 可选：给 skill 看的参考资料
    example.md  # 例子，由共用工具 get_example 读出，见下
```

- `skill.md` 里用 `{变量名}` 引用变量，可用的变量是 context 加上 input。
- 模板是用 Python 的 `str.format` 填充的。如果 prompt 里要写字面的花括号，比如一段 JSON 示例，必须写成 `{{`、`}}`。
- 类型为 list 或 dict 的变量会先转成 JSON 字符串，再填进模板。

**共用工具（通用工具）。** skillsets 目录下的 `tools/`（和各个 skillset 并列，比如 `skillsets/tools/`）
里的函数，每个 `kind: agent` 的 skill 都能调用，注册方式和 skill 自己的 `tools/` 一样。
skillset 自己目录下也可以有 `tools/`（比如实验里拷贝出来的一个版本 `skills/R0/tools/`），
同样对这个 skillset 的每个 skill 都有效。同名的工具只取一个：skill 自己的优先，其次 skillset 的，
最后 `skillsets/tools/`。
共用工具的第一个参数可以是 `ctx: RunContext[dict]`，`ctx.deps` 里有：

| 键 | 值 |
|---|---|
| `skill_dir` | 当前 skill 的目录 |
| `skill` | 当前 skill 的名字 |

现有的共用工具：

| 工具 | 作用 |
|---|---|
| `get_example(skill="")` | 返回 `{"example": <文本>}`，文本是 `<skill 目录>/reference/example.md`。不传 `skill` 就是当前 skill；传了就是同一个 skillset 里那个 skill 的例子。没有这个文件时 `example` 为空，并带 `error`。 |
| `propbank_lookup(lemmas, language)` | 查 PropBank：每个词元的全部义项和论元说明（英语读 `propbank-amr-frame-arg-descr.txt`，中文读 `chinese-propbank/<词元>.xml`）。文件在 `$PROPBANK_DIR`，或上级目录里的 `resources/`、`modular-parsing/resources/`。 |

这些工具都是固定的、无害的读操作，在进程内直接执行，不进沙箱。skill.md 里写一句
"先调用 `get_example`"，模型就会去读例子。

`kind: rule` 的 skill 不需要 skill.md，目录里放一个和 skill 同名的 .py：

```
reentrancy/
  reentrancy.py   # def run(**inputs) -> dict
```

- `run` 拿到的关键字参数和模板一样，是 context 加上 input，用 `**_` 收下不用的。
- 返回的 dict 和模型的产出一样，要符合 `emit` 的类型，否则这个节点记为 error。

### 3.2 类型

| 写法 | 意思 |
|---|---|
| `str` `int` `float` `bool` | 基本类型 |
| `list[str]` `list[int]` `list[float]` `list[dict]` | 列表 |
| `dict` | 字典 |
| `[a, b, c]`（yaml 列表） | 枚举：值必须是其中之一。只能用在 `emit` 里，模型只能从这些值里选。枚举值必须是字符串。 |

注意：PyYAML 会把没加引号的 `yes`、`no`、`on`、`off`、`true`、`false` 读成布尔值，把 `null`、`~` 读成空值。所以枚举值和 `when` 里比较的值，凡是可能撞上这些词的，都要加引号，比如 `"none"`、`"no"`。

### 3.3 `<skill>_emit`

一个 skill 跑完之后，它的产出在表达式里叫 `<skill名>_emit`，比如 `discourse_emit.relation`。

---

## 4. `dispatcher`

规定每个 skill 跑完之后起哪些新 skill。

```yaml
dispatcher:
  <skill>:
    - <规则>
    - <规则>
```

- 某个 skill 下的所有规则都会被检查，命中的都执行。它不是 if/elif，不是命中第一条就停。
- 一个 skill 在 `dispatcher` 里没有条目，或者没有任何规则命中，这条分支就到此结束。

### 4.1 规则的键

| 键 | 必填 | 说明 |
|---|---|---|
| `when` | 否 | 条件。省略就是总是执行。 |
| `each` | 否 | `{<名字>: <列表表达式>}`。列表里每一项各起一个新节点；列表为空时什么都不起。 |
| `run` | 是 | 起哪个 skill，必须在 `skills` 里有定义。 |
| `input` | 是 | `{<新 skill 的变量>: <表达式>}`，变量必须和新 skill 声明的 `input` 完全一致，不多也不少。 |
| `edge` | 否 | 新节点挂到当前节点下面时用的关系标签，可以是表达式，比如 `filler.role`。 |

### 4.2 `when`

```yaml
when: {discourse_emit.relation: "none"}            # 相等
when: {discourse_emit.relation: {not: "none"}}     # 不等
when: {a.x: foo, b.y: {not: bar}}                  # 多个条件同时成立（AND）
```

- 左边是表达式，右边是字面值，不会当作表达式去求值。
- 比较方式是值相等，字符串之间的比较区分大小写。
- 目前只支持相等和 `not`。要表达“或”，就写成几条规则。

### 4.3 规则里能引用的名字

在规则里，以下名字可以用于表达式：

1. wave 的 context 变量；
2. 当前 skill 的 input 变量；
3. 当前 skill 的产出 `<skill>_emit`；
4. 本条规则的 `each` 起的名字。

这些名字不能互相重名。规则里不能用 `annotation` 和 `worktree`：一个 skill 需要的东西，要么在 context 里，要么由上一个 skill 通过 input 传给它。

---

## 5. 表达式

`input`、`context`、`for_each`、`each`、`edge` 的值都是表达式，`when` 的右边除外。表达式有两种形式。

### 5.1 点号路径

写成 `名字.属性.属性`。

- 第一段是名字，可以是 `annotation`、`for_each` 或 `each` 起的名字、context 或 input 的变量、`<skill>_emit`、`worktree`。
- 后面的每一段依次取值：对象就取属性，dict 就取键。
- 没有运算、下标或函数调用。需要计算出来的值，要么在 Annotation 上加属性（比如 `Sentence.span`），要么让 skill 直接产出，要么用 5.2 的 `window`。

| 写法 | 指什么 |
|---|---|
| `annotation.sents` | InputHandler 读出来的句子列表 |
| `sentence.text` | for_each 当前这一句的原文 |
| `discourse_emit.parts` | discourse 产出的 parts 字段 |
| `part.span` | `each` 里当前这一项的 span |
| `worktree.sentence` | `sentence` 这一波所有 episode 的树，按句子顺序排列 |

### 5.2 `window`：取当前项前后的若干项

```yaml
<变量名>:
  window: <列表表达式>    # 和 for_each 的列表一一对应的列表
  range: [<起>, <止>)     # 相对当前项位置的偏移，左闭右开
  pick: <属性路径>        # 可选：每一项再取哪个属性
```

设当前 for_each 项的位置是 `i`，`window` 的结果就是 `列表[i+起 : i+止]`。

- `range` 左闭右开，`0` 指当前项：
  - `[-5, 0]`：前五项，不包括当前项；
  - `[-5, 1]`：前五项加当前项；
  - `[1, 4]`：后三项。
- 超出列表两端的部分直接截掉，不会报错。比如第一句的 `[-5, 0]` 结果是 `[]`，第三句的 `[-5, 0]` 只有两项。
- 结果按原列表的顺序排列，较早的项在前。
- `pick` 对每一项取值，写法和点号路径的后半段一样（不带第一段的名字），比如 `pick: text`。不写 `pick` 就取整项。
- 只能写在 `init_input` 的 `context` 或 `input` 里，而且这一波必须有 `for_each`，因为 `i` 就是 for_each 当前项的位置。一个 episode 里 `i` 不会变，所以一般写在 `context` 里。
- `window` 的列表要和 for_each 的列表一一对应：不能比它长，而且要取的那几项必须已经存在，否则运行时报错。`annotation.sents`，以及以它做 for_each 的 wave 的 `worktree.<name>`，都满足这一点。本波自己的 worktree 还在填充中，长度会比 for_each 列表短，但只要前面的项已经跑完就没问题。

例：句子这一波，让每个 skill 都看到前五句的原文和前五句的图：

```yaml
waves:
  - name: sentence
    start: sent_type
    parallel: 1                       # 读本波的 worktree，必须串行，见下文
    init_input:
      for_each:
        sentence: annotation.sents
      context:
        sent: sentence.text
        token_sent: sentence.numbered_tokens
        lang: annotation.lang
        prev_sents:
          window: annotation.sents
          range: [-5, 0]
          pick: text
        prev_trees:
          window: worktree.sentence   # 本波自己的结果
          range: [-5, 0]
      input:
        span: sentence.span
```

`skill.md` 里就可以直接写 `{prev_sents}`、`{prev_trees}`。它们是列表，会转成 JSON 再填进去。

#### 读本波的 worktree

如果 `window` 读的是本波自己的 `worktree.<name>`，而且 `range` 只取当前项之前的项（`止 ≤ 0`），那么第 i 个 episode 要等前面的 episode 跑完才能开始。所以：

- 这种情况下 `parallel` 必须是 1，加载时会检查；
- `range` 不能取当前项和它之后的项（`止 > 0`），因为那些还没跑完，加载时会检查。

如果只读 `annotation.sents` 或者前面波的 worktree，就没有这个限制，可以并行。

---

## 6. 运行过程

```
for wave in waves:                         # 按顺序
    items = for_each 的列表，没有就是 [annotation]
    并行（最多 parallel 个）对每个 item 跑一个 episode
    worktree[wave.name] = 各 episode 的树，按 items 的顺序

episode:
    root = 节点(skill=start, input=init_input.input, depth=0)
    queue = [root]
    while queue 不空:
        node = queue.pop(0)                # 先进先出，即广度优先
        调用 skill，输入为 context + node.input
        node 记下 store 里的字段；完整的输入和产出写进 log
        对这个 skill 的每条规则:
            when 不成立 → 跳过
            对 each 的每一项（没有 each 就只做一次）:
                新节点(skill=run, input=求值后的 input,
                       parent=node, edge=求值后的 edge, depth=node.depth+1)
                通过 6.3 的检查 → 放进 queue；没通过 → 写 log
    episode 结束后，它的节点列表就是 worktree 的一项（见 6.2）
```

### 6.1 节点

每个节点存成：

```yaml
id: "0.2.1"            # 从根到它的路径，见下
skill: predicate
input: {span: [5, 9]}  # 求值后的 input
parent: "0.2"          # 根节点为 null
edge: op2              # 根节点或没写 edge 时为 null
depth: 2
status: ok             # ok | error
<store 列出的字段>: ...
```

`id` 是从根到这个节点的路径：根节点是 `"0"`；一个节点的第 k 个子节点（从 0 数）是
`<父节点 id>.<k>`。k 是这个子节点在父节点所有规则产出的子节点里的位置：规则按
`dispatcher` 里写的顺序，`each` 按列表顺序，被 6.3 丢掉的也占一个位置。所以同样的输入
每次运行得到同样的 id，和并行时哪个调用先完成无关。排序时按数字逐段比较（`"0.10"`
排在 `"0.9"` 后面），`src/runner.py` 的 `node_key` 就是这个排序键。

### 6.2 树

`worktree.<name>` 的每一项是一个 episode 的结果：

```yaml
nodes: [...]           # 这个 episode 的全部节点，按 id 排序
```

树里只有节点。把节点拼成最终格式（比如 UMR 的 penman 图）是 output handler 的事，见 6.6。

### 6.3 停止和检查

新节点创建之前要通过以下检查，没通过的不放进 queue，只写一条 `dropped` log 并说明原因。这些检查只看节点的 skill、input、深度和数量，不看 input 里具体是什么字段，所以适用于任何 skillset。

1. **深度**：`depth > max_depth` 时不创建。
2. **数量**：这个 episode 的节点数已经达到 `max_nodes` 时不创建。
3. **重复**：新节点的 skill 和求值后的 input 跟当前节点或它的任一祖先完全相同时，不创建。这一条能挡住“原样又交给自己”造成的循环，比如 discourse 切出来的一块就是整句、argument 的某个 filler 就是整个从句。

### 6.4 出错

- skill 调用失败，或者产出不符合 `emit` 的类型或枚举：这个节点的 `status` 记为 `error`，写 log，这条分支结束。同一个 episode 的其他分支照常运行。
- 表达式取不到值（名字或属性不存在）：同样按上一条处理。不过这类错误大多数应该在加载时就被检查出来，见第 7 节。

### 6.5 log

每个节点写一条 log：节点 id、skill、完整输入、完整产出、命中了哪些规则、起了哪些子节点、被丢弃的项及原因。log 只用来查看，不会被任何一波读取。

### 6.6 输出和 judge

所有波跑完之后：

1. Runner 把 worktree 交给 output handler，写成 `<out_dir>/<doc_id><后缀>`，比如 UMR 的 `.umr`；
2. 如果给了 judge，就调用 `judge(输出文件, annotation)`，返回值放进结果的 `judgement`。

output handler 和 judge 跟 input handler 一样，由调用方传给 Runner，不写在 registry.yaml 里。

---

## 7. 加载时检查

`Registry.load` 加载 registry.yaml 时检查以下各项。所有问题收集起来一起报出（`RegistryError.errors`），任何一项不通过都不开始运行。检查分两步：先检查结构（键名、类型、写法），结构没问题才检查交叉引用。所以改完结构错误后，可能还会冒出新的错误。

- 顶层只有 `waves`、`skills`、`dispatcher` 三个键，每一层都不能有未知的键（用来抓拼写错误）；
- 类型写法合法，枚举只出现在 `emit` 里，枚举值都是字符串；
- 每个 `start` 和 `run` 都在 `skills` 里；
- 每个 skill 的 `path` 目录存在，而且目录里有 `skill.md`（`kind: rule` 的是 `<skill 名>.py`）；
- `skill.md` 里出现的每个 `{占位符}`，都是 context 或 input 里的变量（对这个 skill 能到达的每一波分别检查）；
- `init_input.input` 和每条规则的 `input`，变量和目标 skill 的 `input` 完全一致；
- 每处表达式的第一段只用该处允许的名字：`for_each` 只能用 `annotation`、`worktree`；`context` 和 `input` 能用这两个再加上 for_each 起的名字；规则里能用的见 4.3；
- 引用 `<skill>_emit.<字段>` 时，字段在这个 skill 的 `emit` 里；
- 每个 `store` 里的字段都在这个 skill 的 `emit` 里；
- `when` 里写成 `<skill>_emit.<字段>` 的字段存在；如果这个字段是枚举，比较的值必须在枚举里；
- `worktree.<name>` 引用的波，要么排在当前这一波前面，要么就是当前这一波。如果是当前这一波，必须用在 `window` 里，`range` 的 `止 ≤ 0`，而且 `parallel` 是 1；
- `window` 只出现在有 `for_each` 的 wave 的 `init_input` 里，`range` 是两个整数且起 < 止；
- `parallel`、`max_depth`、`max_nodes` 都是正整数；
- 名字不重名：wave 名之间、context 变量和 input 变量之间。

---

## 8. umr-tree 的约定

以下约定只属于 umr-tree 这个 skillset，语法本身不要求。

- `token_sent` 是带编号的 token 列表 `[[1, "Edmund"], [2, "Pope"], ...]`，编号从 1 开始，和 gold 的 Index 行一致。
- `span` 一律写成 `[第一个, 最后一个]` token 的编号，两头都包含，编号指**整句**的 `token_sent`，不是子块里的位置。比如 `Edmund Pope` 是 `[1, 2]`，单个 token `freedom` 是 `[4, 4]`。`alignment` 也是这样写。
- 切分类的 skill（discourse、argument、np_phrase）产出的每一项都写成 `{text, span, role}`。`text` 和 `span` 传给下一个 skill，`role` 作为 `edge`。
- **图片段（graph + open）。** 产出图的 skill（predicate、np_phrase、special_entity，以及 type 为 stop 的 sent_type）都写一个 JSON 图片段 `graph = {nodes, edges, attrs}`：`nodes` 每个 `{var, concept, span}`，第一个是根；`edges` 每条 `[源, 角色, 目标]`；`attrs` 每条 `[var, 角色, 常量]`。还没展开的部分写成占位变量，列在 `open` 里（每个 `{var, text, span}`），也出现在 `edges` 里。dispatcher 用 `each` 把每个占位交给 sent_type，`edge` 写成占位变量；output handler 用这个子节点的根去填那个占位。没人填的占位变成以原文为概念的叶子。子节点的 edge 不是占位变量时，当作角色挂在片段的根上。
- **predicate 一步写完一个从句。** 查 PropBank 选定义项，按框架直接写出事件节点和论元占位（原来的 argument 并进来了）。`aspect`、`modstr`、`polarity` 仍是必填的单独字段，output handler 写成 `:aspect`、`:modal-strength`、`:polarity -`（`none`、`positive` 不写）。相对时间词（*after*、*before*、*between*……）是节点，带 `op1`。
- **np_phrase 的中心可以是几个节点**：施事名词 `person :ARG0-of 事件`，角色名词 `person :ARG1-of (have-org-role-92 :ARG2 机构 :ARG3 职位)`，数量加名词 `:quant` 属性；它也能查 PropBank。代词是 `person`/`thing` 加 `refer-person`、`refer-number`；英语复数普通名词加 `refer-number plural`。
- **coverage（规则）。** predicate 和 np_phrase 之后各跑一次：算出这一块里没有分给任何占位、也不在任何节点 span 里的实词，按连续的段送回 sent_type，挂在片段的根上（`mod`）。虚词（冠词、助动词、体标记、否定、情态、只标记角色的介词）不算。
- **当前成分之外的参与者。** predicate 发现某个参与者不在当前从句里（控制、并列共用主语、指向句中别处名字的代词），把它在整句里的 span 放进 `outside`，规则为每一项起一个 `antecedent` 节点（`kind: rule`，只记下 span），edge 是它的角色。
- **reentrancy 合并。** 句子这一波结束后，规则 `reentrancy` 合并两类节点，都并进 id 顺序靠前的那个，且从不并进自己的祖先：
  1. 同类型（predicate、np_phrase、special_entity、`stop`）且同 span 的节点；
  2. `antecedent` 节点并进同 span 的第一个产出图的节点（任意类型）；找不到就不输出。

  output handler 把合并写成指向保留节点根变量的重入边；被合并节点的子树是重复的，不输出。
- **文档级引用。** `"3:0.2.1"` 指那个树节点片段的根，`"3:0.2.1/r"` 指片段里变量为 `r` 的节点。

### 例子：一句话怎么跑

句子：`Edmund Pope tasted freedom today for the first time in more than eight months.`，共 14 个 token。

| 节点 | skill | input.span | parent / edge | 产出 → 规则 |
|---|---|---|---|---|
| 0 | sent_type | [1,14] | – | `type: predicate` → 起 predicate |
| 0.0 | predicate | [1,14] | 0 / – | `concept: taste-01`，`aspect: performance`，`frame` → 起 argument |
| 0.0.0 | argument | [1,14] | 0.0 / – | 4 个 filler → 各起一个 sent_type |
| 0.0.0.0 | sent_type | [1,2] | 0.0.0 / ARG0 | `special_entity` → 起 special_entity |
| 0.0.0.1 | sent_type | [4,4] | 0.0.0 / ARG1 | `predicate` → 起 predicate（`free-04`） |
| 0.0.0.2 | sent_type | [5,5] | 0.0.0 / temporal | `stop`，`concept: today` |
| 0.0.0.3 | sent_type | [6,14] | 0.0.0 / temporal | `np_phrase` → 起 np_phrase |
| 0.0.0.0.0 | special_entity | [1,2] | 0.0.0.0 / – | 结束 |
| 0.0.0.3.0 | np_phrase | [6,14] | 0.0.0.3 / – | modifiers → 各起一个 sent_type … |

queue 变空时，这一句的树就完成了，存进 `worktree.sentence[0]`。
