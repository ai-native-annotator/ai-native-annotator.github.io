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
                     {"var": "h", "concept": "have-org-role-92", "span": [3, 3]},
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
           "edges": [["v", "possessor", "p"], ["v", "mod", "x1"]],
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

Phrase `该厂高级工程师王强` (a title in an organization followed by the
person's name). The title noun is the head and carries the name, with no
`person` node. The rank word goes in `have-rel-role-91`, and the organization is
its `possessor`:

```json
{"graph": {"nodes": [{"var": "t", "concept": "工程师", "span": [<工程师>]},
                     {"var": "n", "concept": "name", "span": [<王强>]},
                     {"var": "h", "concept": "have-rel-role-91", "span": [<高级>]},
                     {"var": "r", "concept": "高级", "span": [<高级>]}],
           "edges": [["t", "name", "n"], ["t", "ARG1-of", "h"], ["h", "ARG2", "r"],
                     ["r", "possessor", "x1"]],
           "attrs": [["n", "op1", "王强"]]},
 "open": [{"var": "x1", "text": "该厂", "span": [<该厂>]}],
 "alignment": [<工程师>]}
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

Phrase `这种木制椅子` (tokens 1 这 · 2 种 · 3 木制 · 4 椅子):

```json
{"graph": {"nodes": [{"var": "c", "concept": "椅子", "span": [4, 4]},
                     {"var": "d", "concept": "这", "span": [1, 1]},
                     {"var": "u", "concept": "种", "span": [2, 2]}],
           "edges": [["c", "mod", "d"], ["c", "unit", "u"], ["c", "material", "x1"]], "attrs": []},
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
the `possessor`, and 其 itself gets no node; `at` is the span of 其:

```json
{"graph": {"nodes": [{"var": "c", "concept": "仓库", "span": [10, 10]}],
           "edges": [["c", "possessor", "y1"]], "attrs": []},
 "open": [],
 "outside": [{"var": "y1", "text": "公司", "span": [3, 3], "at": [9, 9]}],
 "alignment": [10, 10]}
```

Sentence: `张伟写信请编辑出版他的小说。`
Tokens: 1 张伟 · 2 写 · 3 信 · 4 请 · 5 编辑 · 6 出版 · 7 他 · 8 的 · 9 小说 · 10 。

Phrase `他的小说` [7, 9]: 他 is 张伟, written in this sentence, so the same:

```json
{"graph": {"nodes": [{"var": "n", "concept": "小说", "span": [9, 9]}],
           "edges": [["n", "possessor", "y1"]], "attrs": []},
 "open": [],
 "outside": [{"var": "y1", "text": "张伟", "span": [1, 1], "at": [7, 7]}],
 "alignment": [9, 9]}
```

If 他 had no referent in the sentence (`他的小说出版了。`), it would be an
ordinary pronoun placeholder in `open`, and `outside: []`.
