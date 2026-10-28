# predicate — worked examples

Each answer comes after looking the lemma up with `propbank_lookup`; `frame` is
copied from what the lookup returned. Placeholder vars (`x1`, `x2`, ...) are
filled later by other skills.

## A clause with numbered and other roles

Sentence: `The old farmer who lived near the river sold his horses last spring.`
Tokens: 1 The · 2 old · 3 farmer · 4 who · 5 lived · 6 near · 7 the · 8 river · 9 sold · 10 his · 11 horses · 12 last · 13 spring · 14 .

Clause [1, 14]:

```json
{"graph": {"nodes": [{"var": "e", "concept": "sell-01", "span": [9, 9]}],
           "edges": [["e", "ARG0", "x1"], ["e", "ARG1", "x2"], ["e", "temporal", "x3"]],
           "attrs": []},
 "open": [{"var": "x1", "text": "The old farmer who lived near the river", "span": [1, 8]},
          {"var": "x2", "text": "his horses", "span": [10, 11]},
          {"var": "x3", "text": "last spring", "span": [12, 13]}],
 "outside": [],
 "alignment": [9, 9],
 "frame": {"roleset": "sell-01", "roles": {"ARG0": "seller", "ARG1": "thing sold", "ARG2": "buyer"}},
 "aspect": "performance", "modstr": "full-affirmative", "polarity": "positive"}
```

Clause `who lived near the river` [4, 8] (a relative clause: the farmer and
*who* are not participants here; the noun phrase links to this clause):

```json
{"graph": {"nodes": [{"var": "e", "concept": "live-01", "span": [5, 5]}],
           "edges": [["e", "place", "x1"]], "attrs": []},
 "open": [{"var": "x1", "text": "the river", "span": [7, 8]}],
 "outside": [], "alignment": [5, 5],
 "frame": {"roleset": "live-01", "roles": {"ARG0": "resident", "ARG1": "residence"}},
 "aspect": "state", "modstr": "full-affirmative", "polarity": "positive"}
```

## A relation word as a node; a participant outside the clause

Sentence: `The farmers went home after the storm, but Maria wanted to stay.`
Tokens: 1 The · 2 farmers · 3 went · 4 home · 5 after · 6 the · 7 storm · 8 , · 9 but · 10 Maria · 11 wanted · 12 to · 13 stay · 14 .

Clause `The farmers went home after the storm` [1, 7]:

```json
{"graph": {"nodes": [{"var": "e", "concept": "go-02", "span": [3, 3]},
                     {"var": "a", "concept": "after", "span": [5, 5]}],
           "edges": [["e", "ARG0", "x1"], ["e", "ARG4", "x2"], ["e", "temporal", "a"], ["a", "op1", "x3"]],
           "attrs": []},
 "open": [{"var": "x1", "text": "farmers", "span": [2, 2]},
          {"var": "x2", "text": "home", "span": [4, 4]},
          {"var": "x3", "text": "storm", "span": [7, 7]}],
 "outside": [], "alignment": [3, 3],
 "frame": {"roleset": "go-02", "roles": {"ARG0": "goer", "ARG1": "extent", "ARG3": "start point", "ARG4": "end point"}},
 "aspect": "performance", "modstr": "full-affirmative", "polarity": "positive"}
```

Clause `to stay` [12, 13]: Maria is its ARG1 but is written outside the
clause. She goes in `outside`, with her span as the main clause has it:

```json
{"graph": {"nodes": [{"var": "e", "concept": "stay-01", "span": [13, 13]}], "edges": [], "attrs": []},
 "open": [],
 "outside": [{"text": "Maria", "span": [10, 10], "role": "ARG1"}],
 "alignment": [13, 13],
 "frame": {"roleset": "stay-01", "roles": {"ARG1": "thing remaining", "ARG3": "location"}},
 "aspect": "state", "modstr": "neutral-affirmative", "polarity": "positive"}
```

## Negation; an abstract concept

Clause `He did not answer the letter.` [1, 6]:

```json
{"graph": {"nodes": [{"var": "e", "concept": "answer-01", "span": [4, 4]}],
           "edges": [["e", "ARG0", "x1"], ["e", "ARG1", "x2"]], "attrs": []},
 "open": [{"var": "x1", "text": "He", "span": [1, 1]},
          {"var": "x2", "text": "letter", "span": [6, 6]}],
 "outside": [], "alignment": [4, 4],
 "frame": {"roleset": "answer-01", "roles": {"ARG0": "answerer", "ARG1": "in response to", "ARG2": "answer"}},
 "aspect": "performance", "modstr": "full-negative", "polarity": "negative"}
```

Clause `Lopez is the chairman of the bank.` [1, 7]:

```json
{"graph": {"nodes": [{"var": "e", "concept": "have-org-role-91", "span": [2, 2]}],
           "edges": [["e", "ARG1", "x1"], ["e", "ARG2", "x2"], ["e", "ARG3", "x3"]], "attrs": []},
 "open": [{"var": "x1", "text": "Lopez", "span": [1, 1]},
          {"var": "x2", "text": "bank", "span": [7, 7]},
          {"var": "x3", "text": "chairman", "span": [4, 4]}],
 "outside": [], "alignment": [2, 2],
 "frame": {"roleset": "have-org-role-91", "roles": {"ARG1": "office holder", "ARG2": "organization", "ARG3": "title"}},
 "aspect": "none", "modstr": "full-affirmative", "polarity": "positive"}
```

## Chinese: 是……的 focuses, it is not identity; a time span

Sentence: `这座桥是1920年至1925年间由工程师李明修建的。`

Clause = the whole sentence. The head is 修建, not 是:

```json
{"graph": {"nodes": [{"var": "e", "concept": "修建-01", "span": [<修建>]},
                     {"var": "d", "concept": "date-interval", "span": [<1920年至1925年间>]}],
           "edges": [["e", "ARG1", "x1"], ["e", "ARG0", "x2"], ["e", "temporal", "d"]],
           "attrs": [["d", "op1", 1920], ["d", "op2", 1925]]},
 "open": [{"var": "x1", "text": "这座桥", "span": [<这座桥>]},
          {"var": "x2", "text": "工程师李明", "span": [<工程师李明>]}],
 "outside": [], "alignment": [<修建>],
 "frame": {"roleset": "修建-01", "roles": {"ARG0": "builder", "ARG1": "thing built"}},
 "aspect": "performance", "modstr": "full-affirmative", "polarity": "positive"}
```

(`<...>` stands for the token numbers of those words in the real sentence.)

## Chinese: X 是 …V1，…V2，…V3 的一种 N — not identity, no second N, no `and`

Sentence: `蓝鹊奖是由作家协会创立，2001年获得政府批准，于2002至2010年间颁发的一种文学奖。`

Clause = the whole sentence. The head is the first verb 创立. 文学奖 and 一种
only name the kind, so they get no node. The other two verb phrases hang on
the subject's placeholder, each with the role the prize plays in it:

```json
{"graph": {"nodes": [{"var": "e", "concept": "创立-01", "span": [<创立>]}],
           "edges": [["e", "ARG1", "x1"], ["e", "ARG0", "x2"],
                     ["x1", "ARG0-of", "x3"], ["x1", "ARG1-of", "x4"]],
           "attrs": []},
 "open": [{"var": "x1", "text": "蓝鹊奖", "span": [<蓝鹊奖>]},
          {"var": "x2", "text": "作家协会", "span": [<作家协会>]},
          {"var": "x3", "text": "2001年获得政府批准", "span": [<2001年获得政府批准>]},
          {"var": "x4", "text": "于2002至2010年间颁发", "span": [<于2002至2010年间颁发>]}],
 "outside": [], "alignment": [<创立>],
 "frame": {"roleset": "创立-01", "roles": {"ARG0": "founder", "ARG1": "thing founded"}},
 "aspect": "performance", "modstr": "full-affirmative", "polarity": "positive"}
```

Clause `2001年获得政府批准`: 获得 is the head (not a light verb); 批准 is a plain
noun. The prize is already linked by `ARG0-of`, so `outside` is empty. The date
is `temporal`:

```json
{"graph": {"nodes": [{"var": "e", "concept": "获得-01", "span": [<获得>]}],
           "edges": [["e", "ARG1", "x1"], ["e", "temporal", "x2"]], "attrs": []},
 "open": [{"var": "x1", "text": "政府批准", "span": [<政府批准>]},
          {"var": "x2", "text": "2001年", "span": [<2001年>]}],
 "outside": [], "alignment": [<获得>],
 "frame": {"roleset": "获得-01", "roles": {"ARG0": "getter", "ARG1": "thing gotten"}},
 "aspect": "performance", "modstr": "full-affirmative", "polarity": "positive"}
```

Clause `于2002至2010年间颁发`: a completed event over a stated period is
`performance`; the range is one `date-interval`:

```json
{"graph": {"nodes": [{"var": "e", "concept": "颁发-01", "span": [<颁发>]},
                     {"var": "d", "concept": "date-interval", "span": [<2002至2010年间>]}],
           "edges": [["e", "temporal", "d"]],
           "attrs": [["d", "op1", 2002], ["d", "op2", 2010]]},
 "open": [], "outside": [], "alignment": [<颁发>],
 "frame": {"roleset": "颁发-01", "roles": {"ARG0": "giver", "ARG1": "thing given", "ARG2": "recipient"}},
 "aspect": "performance", "modstr": "full-affirmative", "polarity": "positive"}
```

(Frames abbreviated; in a real answer copy them from the lookup.)

## Chinese: reporting frame, phase verb as head, `quote`

Sentence: `据当地媒体报导，该厂去年开始生产电池。`
Tokens: 1 据 · 2 当地 · 3 媒体 · 4 报导 · 5 ， · 6 该 · 7 厂 · 8 去年 · 9 开始 · 10 生产 · 11 电池 · 12 。

Clause = the whole sentence. 报导 is the head; 据 gets no node; the reported
clause is one ARG1:

```json
{"graph": {"nodes": [{"var": "e", "concept": "报导-01", "span": [4, 4]}],
           "edges": [["e", "ARG0", "x1"], ["e", "ARG1", "x2"]], "attrs": []},
 "open": [{"var": "x1", "text": "当地媒体", "span": [2, 3]},
          {"var": "x2", "text": "该厂去年开始生产电池", "span": [6, 11]}],
 "outside": [], "alignment": [4, 4],
 "frame": {"roleset": "报导-01", "roles": {"ARG0": "reporter", "ARG1": "thing reported"}},
 "aspect": "performance", "modstr": "full-affirmative", "polarity": "positive"}
```

Clause `该厂去年开始生产电池` [6, 11]: the phase verb 开始 is the head and the
production is its ARG1. The clause is reported content, so 报导 goes in
`outside` with role `quote`:

```json
{"graph": {"nodes": [{"var": "e", "concept": "开始-01", "span": [9, 9]}],
           "edges": [["e", "ARG1", "x2"], ["x2", "ARG0", "x1"], ["e", "temporal", "x3"]], "attrs": []},
 "open": [{"var": "x1", "text": "该厂", "span": [6, 7]},
          {"var": "x2", "text": "生产电池", "span": [10, 11]},
          {"var": "x3", "text": "去年", "span": [8, 8]}],
 "outside": [{"text": "报导", "span": [4, 4], "role": "quote"}],
 "alignment": [9, 9],
 "frame": {"roleset": "开始-01", "roles": {"ARG0": "starter", "ARG1": "thing started"}},
 "aspect": "performance", "modstr": "full-affirmative", "polarity": "positive"}
```

Clause `生产电池` [10, 11]: the factory is already hung on it as ARG0 by the clause above, so it is not in `outside`; producing from then on is routine, so `habitual`:

```json
{"graph": {"nodes": [{"var": "e", "concept": "生产-01", "span": [10, 10]}],
           "edges": [["e", "ARG1", "x1"]], "attrs": []},
 "open": [{"var": "x1", "text": "电池", "span": [11, 11]}],
 "outside": [{"text": "报导", "span": [4, 4], "role": "quote"}],
 "alignment": [10, 10],
 "frame": {"roleset": "生产-01", "roles": {"ARG0": "producer", "ARG1": "thing produced"}},
 "aspect": "habitual", "modstr": "full-affirmative", "polarity": "positive"}
```

## Chinese: superlative and excess degree

Clause `最受欢迎的` (a relative clause on 歌手): `have-degree-91` is the first node, so the noun links to it as `ARG1-of`:

```json
{"graph": {"nodes": [{"var": "h", "concept": "have-degree-91", "span": [<最>]},
                     {"var": "e", "concept": "受欢迎-01", "span": [<受欢迎>]},
                     {"var": "m", "concept": "最", "span": [<最>]}],
           "edges": [["h", "ARG2", "e"], ["h", "ARG3", "m"]], "attrs": []},
 "open": [], "outside": [], "alignment": [<最>],
 "frame": {"roleset": "have-degree-91", "roles": {"ARG1": "domain", "ARG2": "property", "ARG3": "degree"}},
 "aspect": "state", "modstr": "full-affirmative", "polarity": "positive"}
```

Clause `这碗汤太咸了` (a main clause): `have-degree-91` is still first. The soup is its ARG1, and 咸-01 has no argument and no aspect:

```json
{"graph": {"nodes": [{"var": "h", "concept": "have-degree-91", "span": [<太>]},
                     {"var": "e", "concept": "咸-01", "span": [<咸>]},
                     {"var": "m", "concept": "太", "span": [<太>]}],
           "edges": [["h", "ARG1", "x1"], ["h", "ARG2", "e"], ["h", "ARG3", "m"]], "attrs": []},
 "open": [{"var": "x1", "text": "这碗汤", "span": [<这碗汤>]}],
 "outside": [], "alignment": [<太>],
 "frame": {"roleset": "have-degree-91", "roles": {"ARG1": "domain", "ARG2": "property", "ARG3": "degree"}},
 "aspect": "state", "modstr": "full-affirmative", "polarity": "positive"}
```

## Chinese: 直到 + time

Clause `该说法直到去年仍被教材引用` (the head is 引用; 直到 is a node over the time):

```json
{"graph": {"nodes": [{"var": "e", "concept": "引用-01", "span": [<引用>]},
                     {"var": "a", "concept": "直到", "span": [<直到>]}],
           "edges": [["e", "ARG1", "x1"], ["e", "ARG0", "x2"], ["e", "temporal", "a"], ["a", "op1", "x3"]], "attrs": []},
 "open": [{"var": "x1", "text": "该说法", "span": [<该说法>]},
          {"var": "x2", "text": "教材", "span": [<教材>]},
          {"var": "x3", "text": "去年", "span": [<去年>]}],
 "outside": [], "alignment": [<引用>],
 "frame": {"roleset": "引用-01", "roles": {"ARG0": "quoter", "ARG1": "thing quoted"}},
 "aspect": "performance", "modstr": "full-affirmative", "polarity": "positive"}
```

(曾 / 曾经 / 一直 / 原 / 再度 are not times: each is a `mod` placeholder. Only 从 in 从不 stays `temporal`.)

## Chinese: X引用报导 — two coordinated events

Sentence: `某周刊引用报导，一名渔民在湖中看到了怪兽。`
Tokens: 1 某 · 2 周刊 · 3 引用 · 4 报导 · 5 ， · 6 一 · 7 名 · 8 渔民 · 9 在 · 10 湖 · 11 中 · 12 看到 · 13 了 · 14 怪兽 · 15 。

Clause = the whole sentence. 报导 is not the object of 引用: the two are joined by `and`, both done by the weekly. The cited source is an `implicit-argument`, and the reported clause is the ARG1 of 报导:

```json
{"graph": {"nodes": [{"var": "a", "concept": "and", "span": [3, 4]},
                     {"var": "e1", "concept": "引用-01", "span": [3, 3]},
                     {"var": "i", "concept": "implicit-argument", "span": [3, 3]},
                     {"var": "e2", "concept": "报导-01", "span": [4, 4]}],
           "edges": [["a", "op1", "e1"], ["a", "op2", "e2"], ["e1", "ARG0", "x1"], ["e1", "ARG1", "i"],
                     ["e2", "ARG0", "x1"], ["e2", "ARG1", "x2"]],
           "attrs": [["e1", "aspect", "performance"], ["e2", "aspect", "performance"]]},
 "open": [{"var": "x1", "text": "某周刊", "span": [1, 2]},
          {"var": "x2", "text": "一名渔民在湖中看到了怪兽", "span": [6, 14]}],
 "outside": [], "alignment": [3, 4],
 "frame": {},
 "aspect": "none", "modstr": "full-affirmative", "polarity": "positive"}
```

The clause 一名渔民在湖中看到了怪兽 then gives `[{"text": "报导", "span": [4, 4], "role": "quote"}]` in `outside`.

Clause `该厂未经批准扩建了仓库` (Chinese negation): `扩建-01` has polarity `positive`, but the negated verb `经-01` (alignment 经, without 未) has modstr `full-negative`, polarity `negative`, and aspect `process`.

Clause `她并没有受伤` : `受伤-01`, alignment 受伤 only, modstr `full-negative`, polarity `negative`.

## Chinese: V X 是/为 Y with a judging verb — no identity-91

Sentence: `专家认定这块石头是陨石。`
Tokens: 1 专家 · 2 认定 · 3 这 · 4 块 · 5 石头 · 6 是 · 7 陨石 · 8 。

```json
{"graph": {"nodes": [{"var": "e", "concept": "认定-02", "span": [2, 2]}],
           "edges": [["e", "ARG0", "x1"], ["e", "ARG1", "x2"], ["e", "ARG2", "x3"]], "attrs": []},
 "open": [{"var": "x1", "text": "专家", "span": [1, 1]},
          {"var": "x2", "text": "这块石头", "span": [3, 5]},
          {"var": "x3", "text": "陨石", "span": [7, 7]}],
 "outside": [], "alignment": [2, 2],
 "frame": {"roleset": "认定-02", "roles": {"ARG0": "judge", "ARG1": "thing judged", "ARG2": "what it is judged to be"}},
 "aspect": "performance", "modstr": "full-affirmative", "polarity": "positive"}
```

是 gets no node. The same applies to 宣布X为Y, 确认X是Y and 称X是Y.

## Chinese: 发生 + event noun; scene-setting clause; 致使

Sentence: `会议临近结束，大楼发生停电，致使三人受伤。`
Tokens: 1 会议 · 2 临近 · 3 结束 · 4 ， · 5 大楼 · 6 发生 · 7 停电 · 8 ， · 9 致使 · 10 三 · 11 人 · 12 受伤 · 13 。

The event noun is the head, and its node covers 发生 too. The first clause gives the time, and the result hangs on the event with `cause-of`:

```json
{"graph": {"nodes": [{"var": "e", "concept": "停电-01", "span": [6, 7]}],
           "edges": [["e", "place", "x1"], ["e", "temporal", "x2"], ["e", "cause-of", "x3"]], "attrs": []},
 "open": [{"var": "x1", "text": "大楼", "span": [5, 5]},
          {"var": "x2", "text": "会议临近结束", "span": [1, 3]},
          {"var": "x3", "text": "三人受伤", "span": [10, 12]}],
 "outside": [], "alignment": [6, 7], "frame": {},
 "aspect": "performance", "modstr": "full-affirmative", "polarity": "positive"}
```

(Use the sense the lookup returns for the event noun.)

## Chinese: 获 + verb is a passive; 启播 is two events

Sentence: `该电台于2015年获政府批准，次年启播。`
Tokens: 1 该 · 2 电台 · 3 于 · 4 2015年 · 5 获 · 6 政府 · 7 批准 · 8 ， · 9 次年 · 10 启播 · 11 。

Clause [1, 7]: 批准 is the head, the station is what is approved (ARG1), 获 gets no node:

```json
{"graph": {"nodes": [{"var": "e", "concept": "批准-01", "span": [7, 7]}],
           "edges": [["e", "ARG1", "x1"], ["e", "ARG0", "x2"], ["e", "temporal", "x3"]], "attrs": []},
 "open": [{"var": "x1", "text": "该电台", "span": [1, 2]},
          {"var": "x2", "text": "政府", "span": [6, 6]},
          {"var": "x3", "text": "2015年", "span": [4, 4]}],
 "outside": [], "alignment": [7, 7],
 "frame": {"roleset": "批准-01", "roles": {"ARG0": "approver", "ARG1": "thing approved"}},
 "aspect": "performance", "modstr": "full-affirmative", "polarity": "positive"}
```

Clause [9, 10]: 启播 is 'begin' + 'broadcast'; the broadcasting is a node, habitual:

```json
{"graph": {"nodes": [{"var": "e", "concept": "启-02", "span": [10, 10]},
                     {"var": "b", "concept": "播-01", "span": [10, 10]}],
           "edges": [["e", "ARG1", "b"], ["e", "temporal", "x1"]],
           "attrs": [["b", "aspect", "habitual"]]},
 "open": [{"var": "x1", "text": "次年", "span": [9, 9]}],
 "outside": [],
 "alignment": [10, 10],
 "frame": {"roleset": "启-02", "roles": {"ARG0": "starter", "ARG1": "thing started"}},
 "aspect": "performance", "modstr": "full-affirmative", "polarity": "positive"}
```

(Frames abbreviated; copy them from the lookup.)

## Chinese: a sentence-initial connective

Sentence: `此外，该乐队还在海边录制了一首新歌。`
Tokens: 1 此外 · 2 ， · 3 该 · 4 乐队 · 5 还 · 6 在 · 7 海边 · 8 录制 · 9 了 · 10 一 · 11 首 · 12 新歌 · 13 。

Clause = the whole sentence. 此外 adds to the previous sentence: `and` with an implicit first op:

```json
{"graph": {"nodes": [{"var": "a", "concept": "and", "span": [1, 1]},
                     {"var": "i", "concept": "implicit-predicate", "span": [1, 1]}],
           "edges": [["a", "op1", "i"], ["a", "op2", "x1"]], "attrs": []},
 "open": [{"var": "x1", "text": "该乐队还在海边录制了一首新歌", "span": [3, 12]}],
 "outside": [], "alignment": [1, 1], "frame": {},
 "aspect": "none", "modstr": "full-affirmative", "polarity": "positive"}
```

Clause [3, 12]: `录制-01` with ARG0 该乐队 [3, 4], `place` 海边 [7, 7] and ARG1 一首新歌 [10, 12]. 还 gets no placeholder. 然而 / 但是 opening a sentence are the same, with `but-91` and only `ARG2`.

Clause `观众不太满意`: `满意-01`, modstr `partial-negative`, polarity `positive`; no 太 node and no `degree`.
