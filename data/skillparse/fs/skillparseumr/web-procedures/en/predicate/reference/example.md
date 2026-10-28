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
{"graph": {"nodes": [{"var": "e", "concept": "have-org-role-92", "span": [2, 2]}],
           "edges": [["e", "ARG1", "x1"], ["e", "ARG2", "x2"], ["e", "ARG3", "x3"]], "attrs": []},
 "open": [{"var": "x1", "text": "Lopez", "span": [1, 1]},
          {"var": "x2", "text": "bank", "span": [7, 7]},
          {"var": "x3", "text": "chairman", "span": [4, 4]}],
 "outside": [], "alignment": [2, 2],
 "frame": {"roleset": "have-org-role-92", "roles": {"ARG1": "office holder", "ARG2": "organization", "ARG3": "title"}},
 "aspect": "none", "modstr": "full-affirmative", "polarity": "positive"}
```

## Chinese: 是……的 focuses, it is not identity; a time span

Sentence: `这座桥是1920年至1925年间由工程师李明修建的。`

Clause = the whole sentence. The head is 修建, not 是:

```json
{"graph": {"nodes": [{"var": "e", "concept": "修建-01", "span": [<修建>]},
                     {"var": "d", "concept": "date-interval", "span": [<1920年至1925年间>]}],
           "edges": [["e", "ARG1", "x1"], ["e", "ARG0", "x2"], ["e", "time", "d"]],
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
is `time`:

```json
{"graph": {"nodes": [{"var": "e", "concept": "获得-01", "span": [<获得>]}],
           "edges": [["e", "ARG1", "x1"], ["e", "time", "x2"]], "attrs": []},
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
           "edges": [["e", "time", "d"]],
           "attrs": [["d", "op1", 2002], ["d", "op2", 2010]]},
 "open": [], "outside": [], "alignment": [<颁发>],
 "frame": {"roleset": "颁发-01", "roles": {"ARG0": "giver", "ARG1": "thing given", "ARG2": "recipient"}},
 "aspect": "performance", "modstr": "full-affirmative", "polarity": "positive"}
```

(Frames abbreviated; in a real answer copy them from the lookup.)
