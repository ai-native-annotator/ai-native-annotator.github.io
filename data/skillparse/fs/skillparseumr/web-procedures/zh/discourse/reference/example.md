# discourse — worked examples

Sentence: `Maria wanted to leave early, but her brother refused.`
Tokens: 1 Maria · 2 wanted · 3 to · 4 leave · 5 early, · 6 but · 7 her · 8 brother · 9 refused.

```json
{"relation": "but-91",
 "parts": [{"text": "Maria wanted to leave early", "span": [1, 5], "role": "ARG1"},
           {"text": "her brother refused", "span": [7, 9], "role": "ARG2"}]}
```

Sentence: `The rain stopped, the children went outside and they played until dark.`
Tokens: 1 The · 2 rain · 3 stopped, · 4 the · 5 children · 6 went · 7 outside · 8 and · 9 they · 10 played · 11 until · 12 dark.

```json
{"relation": "and",
 "parts": [{"text": "The rain stopped", "span": [1, 3], "role": "op1"},
           {"text": "the children went outside", "span": [4, 7], "role": "op2"},
           {"text": "they played until dark", "span": [9, 12], "role": "op3"}]}
```

(`consecutive` would also be right if the sentence stresses that one happened after the other.)

Sentence: `You can take the bus or you can walk.`

```json
{"relation": "or",
 "parts": [{"text": "You can take the bus", "span": [1, 5], "role": "op1"},
           {"text": "you can walk", "span": [7, 9], "role": "op2"}]}
```

Sentence: `Although it was raining, the match went ahead.`

```json
{"relation": "but-91",
 "parts": [{"text": "it was raining", "span": [2, 4], "role": "ARG1"},
           {"text": "the match went ahead", "span": [5, 8], "role": "ARG2"}]}
```

Not coordination — answer `none`, the clause becomes one predicate and the
subordinate clause one of its roles:

- `He left because he was tired.` → `{"relation": "none", "parts": []}` (*because* → `reason` of *left*)
- `If it rains, we will stay home.` → `{"relation": "none", "parts": []}` (*if* → `condition` of *stay*)
- `She said that the shop was closed.` → `{"relation": "none", "parts": []}` (the reported clause is ARG1 of *say*)

## Chinese

Sentence: `虽然天气很冷，但比赛照常进行。`
Tokens: 1 虽然 · 2 天气 · 3 很 · 4 冷 · 5 ， · 6 但 · 7 比赛 · 8 照常 · 9 进行 · 10 。

```json
{"relation": "but-91",
 "parts": [{"text": "天气很冷", "span": [2, 4], "role": "ARG1"},
           {"text": "比赛照常进行", "span": [7, 9], "role": "ARG2"}]}
```

Sentence: `不但价格降低了，而且质量也提高了。`
Tokens: 1 不但 · 2 价格 · 3 降低 · 4 了 · 5 ， · 6 而且 · 7 质量 · 8 也 · 9 提高 · 10 了 · 11 。

```json
{"relation": "and",
 "parts": [{"text": "价格降低了", "span": [2, 4], "role": "op1"},
           {"text": "质量也提高了", "span": [7, 10], "role": "op2"}]}
```

Sentence: `工厂于1990年关闭，政府在第二年拆除了厂房。` (the second event follows the first, but Chinese comma clauses are still `and`; 第二年 stays inside op2 as its time)
Tokens: 1 工厂 · 2 于 · 3 1990年 · 4 关闭 · 5 ， · 6 政府 · 7 在 · 8 第二年 · 9 拆除 · 10 了 · 11 厂房 · 12 。

```json
{"relation": "and",
 "parts": [{"text": "工厂于1990年关闭", "span": [1, 4], "role": "op1"},
           {"text": "政府在第二年拆除了厂房", "span": [6, 11], "role": "op2"}]}
```

Also `none`:

- `这是他写的、去年出版的、很受欢迎的小说。` → `{"relation": "none", "parts": []}` (relative clauses of 小说, not coordination)
- `城里的房租一直在上涨，特别是在工厂关闭后，许多家庭搬走了，并且商店也纷纷关门。` → `{"relation": "none", "parts": []}` (上涨 is the head; the 特别是 part is its `example`, and inside it 搬走 and 关门 are joined by `and`)

## Chinese: reason, purpose, nested contrast, reporting frame

Sentence: `由于原料涨价，于是工厂提高了售价。`
Tokens: 1 由于 · 2 原料 · 3 涨价 · 4 ， · 5 于是 · 6 工厂 · 7 提高 · 8 了 · 9 售价 · 10 。

```json
{"relation": "have-reason-91",
 "parts": [{"text": "工厂提高了售价", "span": [6, 9], "role": "ARG1"},
           {"text": "原料涨价", "span": [2, 3], "role": "ARG2"}]}
```

Sentence: `为了节省成本，公司关闭了两家工厂。` (not reified: 关闭 is the head and 节省 its `purpose`)
Tokens: 1 为了 · 2 节省 · 3 成本 · 4 ， · 5 公司 · 6 关闭 · 7 了 · 8 两 · 9 家 · 10 工厂 · 11 。

```json
{"relation": "none", "parts": []}
```

Sentence: `墙上挂着一幅画，画框已经破损，但画面依然清晰。` (但 contrasts only the last two clauses)
Tokens: 1 墙 · 2 上 · 3 挂着 · 4 一 · 5 幅 · 6 画 · 7 ， · 8 画框 · 9 已经 · 10 破损 · 11 ， · 12 但 · 13 画面 · 14 依然 · 15 清晰 · 16 。

```json
{"relation": "and",
 "parts": [{"text": "墙上挂着一幅画", "span": [1, 6], "role": "op1"},
           {"text": "画框已经破损，但画面依然清晰", "span": [8, 15], "role": "op2"}]}
```

(op2 is cut again later: `but-91` with ARG1 画框已经破损 and ARG2 画面依然清晰.)

- `据报社报导，大桥昨天倒塌，三人受伤。` → `{"relation": "none", "parts": []}` (报导 is the head; the two reported clauses together are its content, and are joined by `and` inside it)

## Connectives inside a longer span; one-clause contrast; describing clause

Sentence: `他说那人跑得太快，以致于摔倒了，因为地上有冰。`
Tokens: 1 他 · 2 说 · 3 那 · 4 人 · 5 跑 · 6 得 · 7 太 · 8 快 · 9 ， · 10 以致于 · 11 摔倒 · 12 了 · 13 ， · 14 因为 · 15 地上 · 16 有 · 17 冰 · 18 。

Piece [3, 17] (the reported content). It holds connectives, so it is never `none`:

```json
{"relation": "have-reason-91",
 "parts": [{"text": "那人跑得太快，以致于摔倒了", "span": [3, 12], "role": "ARG1"},
           {"text": "地上有冰", "span": [15, 17], "role": "ARG2"}]}
```

Piece [3, 12], cut again:

```json
{"relation": "have-reason-91",
 "parts": [{"text": "摔倒了", "span": [11, 12], "role": "ARG1"},
           {"text": "那人跑得太快", "span": [3, 8], "role": "ARG2"}]}
```

Sentence: `然而，第二天大桥突然倒塌了。`
Tokens: 1 然而 · 2 ， · 3 第二天 · 4 大桥 · 5 突然 · 6 倒塌 · 7 了 · 8 。

```json
{"relation": "but-91",
 "parts": [{"text": "第二天大桥突然倒塌了", "span": [3, 7], "role": "ARG2"}]}
```

Also `none`:

- `这是一家老牌书店，以收藏古籍而闻名。` → `{"relation": "none", "parts": []}` (闻名 describes 书店 and hangs on it)
- `杂志登出一幅画，画中有一条龙。` → `{"relation": "none", "parts": []}` (the second clause describes 画: 画 is `ARG0-of` it, with no second 画 node)

## Chinese: a story told in order; 原来

Sentence: `少年醒来，发现村子已被烧毁，便独自踏上了寻找父亲的路。` (a story's plot: the events follow one another)
Tokens: 1 少年 · 2 醒来 · 3 ， · 4 发现 · 5 村子 · 6 已 · 7 被 · 8 烧毁 · 9 ， · 10 便 · 11 独自 · 12 踏上 · 13 了 · 14 寻找 · 15 父亲 · 16 的 · 17 路 · 18 。

```json
{"relation": "consecutive",
 "parts": [{"text": "少年醒来", "span": [1, 2], "role": "op1"},
           {"text": "发现村子已被烧毁", "span": [4, 8], "role": "op2"},
           {"text": "独自踏上了寻找父亲的路", "span": [11, 17], "role": "op3"}]}
```

(In a news report the same comma clauses would be `and`.)

Sentence: `原来，那封信早已被人调换。` (`none`: the predicate step builds have-reason-91 with an implicit-predicate ARG1 and the rest as ARG2)
Tokens: 1 原来 · 2 ， · 3 那 · 4 封 · 5 信 · 6 早已 · 7 被 · 8 人 · 9 调换 · 10 。

```json
{"relation": "none", "parts": []}
```

- `其次是人手问题，队里一直缺少会开船的人。` → `{"relation": "none", "parts": []}` (the second clause says what the 问题 is: 问题 `:ARG1-of identity-91 :ARG2` that clause)
