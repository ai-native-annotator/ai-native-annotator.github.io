# np_phrase — worked examples

Placeholder vars (`x1`, `x2`, ...) are filled later by other skills.
An answer below that shows no `outside` has `"outside": []`.

## Agent noun with a quantifier and a relative clause

Sentence: `More rescuers who arrived from Manila searched the hills.`
Tokens: 1 More · 2 rescuers · 3 who · 4 arrived · 5 from · 6 Manila · 7 searched · 8 the · 9 hills · 10 .

Phrase `More rescuers who arrived from Manila` [1, 6]. *rescuers* is a person
who rescues (looked up: `rescue-01`); the rescuers are the ARG1 (the one
arriving) of the relative clause:

```json
{"graph": {"nodes": [{"var": "p", "concept": "person", "span": [2, 2]},
                     {"var": "r", "concept": "rescue-01", "span": [2, 2]}],
           "edges": [["p", "ARG0-of", "r"], ["p", "quant", "x1"], ["p", "ARG1-of", "x2"]],
           "attrs": [["p", "refer-number", "plural"]]},
 "open": [{"var": "x1", "text": "More", "span": [1, 1]},
          {"var": "x2", "text": "who arrived from Manila", "span": [3, 6]}],
 "alignment": [2, 2]}
```

## Role noun with its organization

Phrase `the bank's chairman` [1, 3] (tokens 1 the · 2 bank's · 3 chairman):

```json
{"graph": {"nodes": [{"var": "p", "concept": "person", "span": [3, 3]},
                     {"var": "h", "concept": "have-org-role-91", "span": [3, 3]},
                     {"var": "c", "concept": "chairman", "span": [3, 3]}],
           "edges": [["p", "ARG1-of", "h"], ["h", "ARG2", "x1"], ["h", "ARG3", "c"]],
           "attrs": []},
 "open": [{"var": "x1", "text": "bank's", "span": [2, 2]}],
 "alignment": [3, 3]}
```

Phrase `officials` (no organization named) [5, 5]:

```json
{"graph": {"nodes": [{"var": "p", "concept": "person", "span": [5, 5]},
                     {"var": "h", "concept": "have-role-91", "span": [5, 5]},
                     {"var": "o", "concept": "official", "span": [5, 5]}],
           "edges": [["p", "ARG1-of", "h"], ["h", "ARG3", "o"]],
           "attrs": [["p", "refer-number", "plural"]]},
 "open": [], "alignment": [5, 5]}
```

## A number of things; a pronoun

Phrase `200 people` [4, 5]: the number is an attribute, not a node.

```json
{"graph": {"nodes": [{"var": "p", "concept": "person", "span": [5, 5]}],
           "edges": [], "attrs": [["p", "quant", "200"]]},
 "open": [], "alignment": [5, 5]}
```

Phrase `their own village` [2, 4]:

```json
{"graph": {"nodes": [{"var": "v", "concept": "village", "span": [4, 4]},
                     {"var": "p", "concept": "person", "span": [2, 2]}],
           "edges": [["v", "poss", "p"], ["v", "mod", "x1"]],
           "attrs": [["p", "refer-person", "3rd"], ["p", "refer-number", "plural"]]},
 "open": [{"var": "x1", "text": "own", "span": [3, 3]}],
 "alignment": [4, 4]}
```

## A nominalised event

Phrase `the destruction of the old bridge` [1, 6]:

```json
{"graph": {"nodes": [{"var": "d", "concept": "destroy-01", "span": [2, 2]}],
           "edges": [["d", "ARG1", "x1"]], "attrs": []},
 "open": [{"var": "x1", "text": "old bridge", "span": [5, 6]}],
 "alignment": [2, 2]}
```

## Chinese

Phrase `三本旧书` (tokens 1 三 · 2 本 · 3 旧 · 4 书): the number is an attribute,
the measure word is a `unit` node, no refer-number in Chinese.

```json
{"graph": {"nodes": [{"var": "b", "concept": "书", "span": [4, 4]}, {"var": "u", "concept": "本", "span": [2, 2]}],
           "edges": [["b", "unit", "u"], ["b", "mod", "x1"]], "attrs": [["b", "quant", "3"]]},
 "open": [{"var": "x1", "text": "旧", "span": [3, 3]}],
 "alignment": [4, 4]}
```

Phrase `该公司前董事长李·华森` (an organization, a title and the person's
name). The head is `individual-person` with the name (the middle dot is its
own op). The title is the ARG3 of `have-org-role-91`, the organization its
ARG2, and 前 is a `mod` of the title:

```json
{"graph": {"nodes": [{"var": "i", "concept": "individual-person", "span": [<李·华森>]},
                     {"var": "n", "concept": "name", "span": [<李·华森>]},
                     {"var": "h", "concept": "have-org-role-91", "span": [<董事长>]},
                     {"var": "t", "concept": "董事长", "span": [<董事长>]},
                     {"var": "m", "concept": "前", "span": [<前>]}],
           "edges": [["i", "name", "n"], ["i", "ARG1-of", "h"], ["h", "ARG2", "x1"],
                     ["h", "ARG3", "t"], ["t", "mod", "m"]],
           "attrs": [["n", "op1", "李"], ["n", "op2", "·"], ["n", "op3", "华森"]]},
 "open": [{"var": "x1", "text": "该公司", "span": [<该公司>]}],
 "alignment": [<李·华森>]}
```

(`<...>` stands for the token numbers of those words in the real sentence.)

## Chinese: denomination, demonstrative + classifier, material, part, region

Phrase `10元纸币` (tokens 1 10 · 2 元 · 3 纸币): the amount goes straight on the
noun, with no monetary-quantity and no placeholder:

```json
{"graph": {"nodes": [{"var": "z", "concept": "纸币", "span": [3, 3]},
                     {"var": "u", "concept": "元", "span": [2, 2]}],
           "edges": [["z", "unit", "u"]], "attrs": [["z", "quant", "10"]]},
 "open": [], "alignment": [3, 3]}
```

Phrase `这种木制椅子` (tokens 1 这 · 2 种 · 3 木制 · 4 椅子): the demonstrative and the classifier are one `mod` node:

```json
{"graph": {"nodes": [{"var": "c", "concept": "椅子", "span": [4, 4]},
                     {"var": "d", "concept": "这种", "span": [1, 2]}],
           "edges": [["c", "mod", "d"], ["c", "material", "x1"]], "attrs": []},
 "open": [{"var": "x1", "text": "木制", "span": [3, 3]}],
 "alignment": [4, 4]}
```

Phrase `屏幕的中间` (tokens 1 屏幕 · 2 的 · 3 中间): the whole is the head, and
the position is its part:

```json
{"graph": {"nodes": [{"var": "s", "concept": "屏幕", "span": [1, 1]},
                     {"var": "m", "concept": "中间", "span": [3, 3]}],
           "edges": [["s", "part", "m"]], "attrs": []},
 "open": [], "alignment": [1, 1]}
```

Phrase `日本南部部分城市` (tokens 1 日本 · 2 南部 · 3 部分 · 4 城市): 部分 is
`mod`, the region is `place`, and the region is part of the country:

```json
{"graph": {"nodes": [{"var": "c", "concept": "城市", "span": [4, 4]},
                     {"var": "q", "concept": "部分", "span": [3, 3]},
                     {"var": "s", "concept": "南部", "span": [2, 2]}],
           "edges": [["c", "mod", "q"], ["c", "place", "s"], ["s", "part-of", "x1"]], "attrs": []},
 "open": [{"var": "x1", "text": "日本", "span": [1, 1]}],
 "alignment": [4, 4]}
```

Phrase `戴着王冠的国王画像` (tokens 1 戴着 · 2 王冠 · 3 的 · 4 国王 · 5 画像): the
picture is identified with the king, and the relative clause describes the
king:

```json
{"graph": {"nodes": [{"var": "h", "concept": "画像", "span": [5, 5]},
                     {"var": "i", "concept": "identity-91", "span": [5, 5]},
                     {"var": "k", "concept": "国王", "span": [4, 4]}],
           "edges": [["h", "ARG1-of", "i"], ["i", "ARG2", "k"], ["k", "ARG0-of", "x1"]], "attrs": []},
 "open": [{"var": "x1", "text": "戴着王冠", "span": [1, 2]}],
 "alignment": [5, 5]}
```

## A participant written outside the phrase: `outside`

Sentence: `这家公司把旧工厂改造成其仓库。`
Tokens: 1 这 · 2 家 · 3 公司 · 4 把 · 5 旧 · 6 工厂 · 7 改造 · 8 成 · 9 其 · 10 仓库 · 11 。

Phrase `其仓库` [9, 10]. 其 is the company, which is written outside the
phrase: it goes in `outside` (head word 公司 only, not 这家公司), its var is
the `poss`, and 其 itself gets no node; `at` is the span of 其:

```json
{"graph": {"nodes": [{"var": "c", "concept": "仓库", "span": [10, 10]}],
           "edges": [["c", "poss", "y1"]], "attrs": []},
 "open": [],
 "outside": [{"var": "y1", "text": "公司", "span": [3, 3], "at": [9, 9]}],
 "alignment": [10, 10]}
```

Sentence: `张伟写信请编辑出版他的小说。`
Tokens: 1 张伟 · 2 写 · 3 信 · 4 请 · 5 编辑 · 6 出版 · 7 他 · 8 的 · 9 小说 · 10 。

Phrase `他的小说` [7, 9]: 他 is 张伟, written in this sentence, so the same:

```json
{"graph": {"nodes": [{"var": "n", "concept": "小说", "span": [9, 9]}],
           "edges": [["n", "poss", "y1"]], "attrs": []},
 "open": [],
 "outside": [{"var": "y1", "text": "张伟", "span": [1, 1], "at": [7, 7]}],
 "alignment": [9, 9]}
```

If 他 had no referent in the sentence (`他的小说出版了。`), it would be an
ordinary pronoun placeholder in `open`, and `outside: []`.

## Chinese: demonstrative without classifier, V+量, agent noun in 人, titled article

Phrase `该报` (tokens 1 该 · 2 报):

```json
{"graph": {"nodes": [{"var": "b", "concept": "报", "span": [1, 2]},
                     {"var": "d", "concept": "该", "span": [1, 2]}],
           "edges": [["b", "mod", "d"]], "attrs": []},
 "open": [], "alignment": [1, 2]}
```

(A demonstrative + noun word gives both nodes the span of the whole word.)

```text
```

Phrase `该厂的销量` (tokens 1 该厂 · 2 的 · 3 销量): 量 is the head, the selling is
an event, and the factory is what is sold by (here its ARG0):

```json
{"graph": {"nodes": [{"var": "l", "concept": "量", "span": [3, 3]},
                     {"var": "e", "concept": "销-01", "span": [3, 3]}],
           "edges": [["l", "quant-of", "e"], ["e", "ARG0", "x1"]],
           "attrs": []},
 "open": [{"var": "x1", "text": "该厂", "span": [1, 1]}], "alignment": [3, 3]}
```

Phrase `守门人` (one token): the suffix 人 is the head, and the guarding is a
routine activity:

```json
{"graph": {"nodes": [{"var": "r", "concept": "人", "span": [1, 1]},
                     {"var": "e", "concept": "守门-01", "span": [1, 1]}],
           "edges": [["r", "ARG0-of", "e"]], "attrs": [["e", "aspect", "habitual"]]},
 "open": [], "alignment": [1, 1]}
```

Phrase `一篇「市长骑马上班」` (tokens 1 一 · 2 篇 · 3 「 · 4 市长 · 5 骑马 · 6 上班 · 7 」):
the title is a name, not a clause:

```json
{"graph": {"nodes": [{"var": "p", "concept": "publication", "span": [3, 7]},
                     {"var": "n", "concept": "name", "span": [3, 7]},
                     {"var": "u", "concept": "篇", "span": [2, 2]}],
           "edges": [["p", "name", "n"], ["p", "unit", "u"]],
           "attrs": [["p", "quant", "1"], ["n", "op1", "「"], ["n", "op2", "市长"], ["n", "op3", "骑马"],
                     ["n", "op4", "上班"], ["n", "op5", "」"]]},
 "open": [], "alignment": [3, 7]}
```

Phrase `文章的标题` (tokens 1 文章 · 2 的 · 3 标题): a component is `part-of` the
whole:

```json
{"graph": {"nodes": [{"var": "t", "concept": "标题", "span": [3, 3]}],
           "edges": [["t", "part-of", "x1"]], "attrs": []},
 "open": [{"var": "x1", "text": "文章", "span": [1, 1]}], "alignment": [3, 3]}
```

## Chinese: agent noun in 者

Phrase `抢劫者` (one token): the suffix 者 is the head, never `人` or `person`:

```json
{"graph": {"nodes": [{"var": "z", "concept": "者", "span": [1, 1]},
                     {"var": "e", "concept": "抢劫-01", "span": [1, 1]}],
           "edges": [["z", "ARG0-of", "e"]], "attrs": [["e", "aspect", "performance"]]},
 "open": [], "alignment": [1, 1]}
```

Phrase `中东裔移民` (tokens 1 中东 · 2 裔 · 3 移民): the origin is `mod`, never `place`:

```json
{"graph": {"nodes": [{"var": "m", "concept": "移民", "span": [3, 3]},
                     {"var": "y", "concept": "裔", "span": [2, 2]}],
           "edges": [["m", "mod", "y"], ["y", "mod", "x1"]], "attrs": []},
 "open": [{"var": "x1", "text": "中东", "span": [1, 1]}], "alignment": [3, 3]}
```

## Chinese: coordinated modifiers that make separate items

Phrase `英语及法语新闻时段` (tokens 1 英语 · 2 及 · 3 法语 · 4 新闻 · 5 时段): two slots, one per language. The head is copied; each copy has its own language as `medium` and its own 新闻:

```json
{"graph": {"nodes": [{"var": "a", "concept": "and", "span": [2, 2]},
                     {"var": "t1", "concept": "时段", "span": [5, 5]},
                     {"var": "t2", "concept": "时段", "span": [5, 5]},
                     {"var": "n1", "concept": "新闻", "span": [4, 4]},
                     {"var": "n2", "concept": "新闻", "span": [4, 4]}],
           "edges": [["a", "op1", "t1"], ["a", "op2", "t2"], ["t1", "mod", "n1"], ["t2", "mod", "n2"],
                     ["t1", "medium", "x1"], ["t2", "medium", "x2"]], "attrs": []},
 "open": [{"var": "x1", "text": "英语", "span": [1, 1]},
          {"var": "x2", "text": "法语", "span": [3, 3]}],
 "alignment": [5, 5]}
```

Phrase `市政府（简称「市府」）` : 政府 phrase `:ARG1-of (j / 简称-01 :ARG2 (n / name :op1 "市府"))`, 简称-01 with aspect `state`; the brackets and quote marks get no op, and no second organization node is made.

## Chinese: 给 as a light verb inside a 的-phrase

Sentence: `经理上周给我们的建议很有用。`
Tokens: 1 经理 · 2 上周 · 3 给 · 4 我们 · 5 的 · 6 建议 · 7 很 · 8 有用 · 9 。

Phrase `经理上周给我们的建议` [1, 6]. 建议 is the event and 给 gets no node. The giver is ARG0 of 建议-01, the time is its `temporal`, and the recipient is the addressee (ARG2), never ARG1. There is no separate 给-01 event:

```json
{"graph": {"nodes": [{"var": "j", "concept": "建议-01", "span": [6, 6]}],
           "edges": [["j", "ARG0", "x1"], ["j", "temporal", "x2"], ["j", "ARG2", "x3"]],
           "attrs": [["j", "aspect", "performance"]]},
 "open": [{"var": "x1", "text": "经理", "span": [1, 1]},
          {"var": "x2", "text": "上周", "span": [2, 2]},
          {"var": "x3", "text": "我们", "span": [4, 4]}],
 "alignment": [6, 6]}
```

Phrase `小王等人` (tokens 1 小王 · 2 等 · 3 人): 人 is the head and the named member is an `example`:

```json
{"graph": {"nodes": [{"var": "r", "concept": "人", "span": [3, 3]},
                     {"var": "a", "concept": "and", "span": [2, 2]},
                     {"var": "d", "concept": "等", "span": [2, 2]}],
           "edges": [["r", "example", "a"], ["a", "op1", "x1"], ["a", "op2", "d"]], "attrs": []},
 "open": [{"var": "x1", "text": "小王", "span": [1, 1]}],
 "alignment": [3, 3]}
```
