# discourse — worked examples

Sentence: `Maria wanted to leave early, but her brother refused.`
Tokens: 1 Maria · 2 wanted · 3 to · 4 leave · 5 early, · 6 but · 7 her · 8 brother · 9 refused.

```json
{"relation": "but-91",
 "parts": [{"text": "Maria wanted to leave early", "span": [1, 5], "role": "op1"},
           {"text": "her brother refused", "span": [7, 9], "role": "op2"}]}
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
 "parts": [{"text": "it was raining", "span": [2, 4], "role": "op1"},
           {"text": "the match went ahead", "span": [5, 8], "role": "op2"}]}
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
 "parts": [{"text": "天气很冷", "span": [2, 4], "role": "op1"},
           {"text": "比赛照常进行", "span": [7, 9], "role": "op2"}]}
```

Sentence: `不但价格降低了，而且质量也提高了。`
Tokens: 1 不但 · 2 价格 · 3 降低 · 4 了 · 5 ， · 6 而且 · 7 质量 · 8 也 · 9 提高 · 10 了 · 11 。

```json
{"relation": "and",
 "parts": [{"text": "价格降低了", "span": [2, 4], "role": "op1"},
           {"text": "质量也提高了", "span": [7, 10], "role": "op2"}]}
```

Sentence: `工厂于1990年关闭，政府在第二年拆除了厂房。` (the second event follows the first)
Tokens: 1 工厂 · 2 于 · 3 1990年 · 4 关闭 · 5 ， · 6 政府 · 7 在 · 8 第二年 · 9 拆除 · 10 了 · 11 厂房 · 12 。

```json
{"relation": "consecutive",
 "parts": [{"text": "工厂于1990年关闭", "span": [1, 4], "role": "op1"},
           {"text": "政府在第二年拆除了厂房", "span": [6, 11], "role": "op2"}]}
```

Also `none`:

- `这是他写的、去年出版的、很受欢迎的小说。` → `{"relation": "none", "parts": []}` (relative clauses of 小说, not coordination)
- `城里的房租一直在上涨，特别是在工厂关闭后，许多家庭搬走了，并且商店也纷纷关门。` → `{"relation": "none", "parts": []}` (上涨 is the head; the 特别是 part is its `example`, and inside it 搬走 and 关门 are joined by `and`)
