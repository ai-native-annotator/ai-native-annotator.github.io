# special_entity — worked examples

Every answer below also has `"outside": []`.

The fragment is JSON; the penman line above each answer only shows its shape.

`Angela Merkel` — `(p / individual-person :name (n / name :op1 "Angela" :op2 "Merkel"))`

```json
{"graph": {"nodes": [{"var": "p", "concept": "individual-person"}, {"var": "n", "concept": "name"}],
           "edges": [["p", "name", "n"]],
           "attrs": [["n", "op1", "Angela"], ["n", "op2", "Merkel"]]},
 "open": [], "alignment": [1, 2]}
```

`Russian` (in *a Russian court*) — the country: `(c / country :name (n / name :op1 "Russia"))`

```json
{"graph": {"nodes": [{"var": "c", "concept": "country"}, {"var": "n", "concept": "name"}],
           "edges": [["c", "name", "n"]],
           "attrs": [["n", "op1", "Russia"]]},
 "open": [], "alignment": [5, 5]}
```

`March 3, 2010` — `(d / date-entity :year 2010 :month 3 :day 3)`

```json
{"graph": {"nodes": [{"var": "d", "concept": "date-entity"}], "edges": [],
           "attrs": [["d", "year", 2010], ["d", "month", 3], ["d", "day", 3]]},
 "open": [], "alignment": [7, 10]}
```

`on Friday` — `(d / date-entity :weekday (f / friday))`

```json
{"graph": {"nodes": [{"var": "d", "concept": "date-entity"}, {"var": "f", "concept": "friday"}],
           "edges": [["d", "weekday", "f"]], "attrs": []},
 "open": [], "alignment": [9, 9]}
```

`three days` — `(t / temporal-quantity :quant 3 :unit (d / day))`

```json
{"graph": {"nodes": [{"var": "t", "concept": "temporal-quantity"}, {"var": "d", "concept": "day"}],
           "edges": [["t", "unit", "d"]], "attrs": [["t", "quant", 3]]},
 "open": [], "alignment": [4, 5]}
```

`more than eight months` — `(m / more-than :op1 (t / temporal-quantity :quant 8 :unit (m2 / month)))`

```json
{"graph": {"nodes": [{"var": "m", "concept": "more-than"}, {"var": "t", "concept": "temporal-quantity"},
                     {"var": "m2", "concept": "month"}],
           "edges": [["m", "op1", "t"], ["t", "unit", "m2"]], "attrs": [["t", "quant", 8]]},
 "open": [], "alignment": [9, 12]}
```

`$1,500` — `(m / monetary-quantity :quant 1500 :unit (d / dollar))`; `40 percent` —
`(p / percentage-entity :value 40)`; `the second time` — `(o / ordinal-entity :value 2)`:
same pattern.

`5欧元` — `(m / monetary-quantity :quant 5 :unit (o / 欧元))`

```json
{"graph": {"nodes": [{"var": "m", "concept": "monetary-quantity"}, {"var": "o", "concept": "欧元"}],
           "edges": [["m", "unit", "o"]], "attrs": [["m", "quant", 5]]},
 "open": [], "alignment": [1, 3]}
```

## Chinese names

`欧洲议会` — word-level ops, never one per character: `(g / government-organization :name (n / name :op1 "欧洲" :op2 "议会"))`

```json
{"graph": {"nodes": [{"var": "g", "concept": "government-organization"}, {"var": "n", "concept": "name"}],
           "edges": [["g", "name", "n"]],
           "attrs": [["n", "op1", "欧洲"], ["n", "op2", "议会"]]},
 "open": [], "alignment": [3, 4]}
```

`玛丽·居里` — split at `·`, the dot kept as its own op: `(p / individual-person :name (n / name :op1 "玛丽" :op2 "·" :op3 "居里"))`

```json
{"graph": {"nodes": [{"var": "p", "concept": "individual-person"}, {"var": "n", "concept": "name"}],
           "edges": [["p", "name", "n"]],
           "attrs": [["n", "op1", "玛丽"], ["n", "op2", "·"], ["n", "op3", "居里"]]},
 "open": [], "alignment": [1, 3]}
```

`伦敦交通局` — the place is split off as `poss`: `(g / government-organization :name (n / name :op1 "交通局") :poss (c / city :name (n2 / name :op1 "伦敦")))`

```json
{"graph": {"nodes": [{"var": "g", "concept": "government-organization"}, {"var": "n", "concept": "name"},
                     {"var": "c", "concept": "city"}, {"var": "n2", "concept": "name"}],
           "edges": [["g", "name", "n"], ["g", "poss", "c"], ["c", "name", "n2"]],
           "attrs": [["n", "op1", "交通局"], ["n2", "op1", "伦敦"]]},
 "open": [], "alignment": [1, 2]}
```

`第三年` — `(t / temporal-quantity :unit (y / 年) :ord (o / ordinal-entity :value 3))`

```json
{"graph": {"nodes": [{"var": "t", "concept": "temporal-quantity"}, {"var": "y", "concept": "年"},
                     {"var": "o", "concept": "ordinal-entity"}],
           "edges": [["t", "unit", "y"], ["t", "ord", "o"]], "attrs": [["o", "value", 3]]},
 "open": [], "alignment": [6, 7]}
```

`《光明日报》` (tokens 4 《 · 5 光明 · 6 日报 · 7 》) — the title marks are ops: `(n / newspaper :name (n2 / name :op1 "《" :op2 "光明" :op3 "日报" :op4 "》"))`

```json
{"graph": {"nodes": [{"var": "p", "concept": "newspaper"}, {"var": "n", "concept": "name"}],
           "edges": [["p", "name", "n"]],
           "attrs": [["n", "op1", "《"], ["n", "op2", "光明"], ["n", "op3", "日报"], ["n", "op4", "》"]]},
 "open": [], "alignment": [4, 7]}
```

`某某新闻网` (a news website) is also `newspaper`. In `德国气象学会` the country stays
inside the name: `(a / academic-organization :name (n / name :op1 "德国" :op2 "气象" :op3 "学会"))`.

`1990年代` — `(d / date-entity :era 1990)`

`《星海迷航》` (the title of a TV series; tokens 3 《 · 4 星海 · 5 迷航 · 6 》) — `show`, and the marks are not ops: `(s / show :name (n / name :op1 "星海" :op2 "迷航"))`

```json
{"graph": {"nodes": [{"var": "s", "concept": "show"}, {"var": "n", "concept": "name"}],
           "edges": [["s", "name", "n"]],
           "attrs": [["n", "op1", "星海"], ["n", "op2", "迷航"]]},
 "open": [], "alignment": [3, 6]}
```

`船长` used alone for one character of a story — not a name: `(c / 船长)`, one node, no `name`.

`克林贡人` (people of a fictional race; tokens 5 克林贡 · 6 人) — 人 is the root and the race is its `mod`; the name has no 人: `(r / 人 :mod (e / ethnic-group :name (n / name :op1 "克林贡")))`

```json
{"graph": {"nodes": [{"var": "r", "concept": "人"}, {"var": "e", "concept": "ethnic-group"},
                     {"var": "n", "concept": "name"}],
           "edges": [["r", "mod", "e"], ["e", "name", "n"]],
           "attrs": [["n", "op1", "克林贡"]]},
 "open": [], "alignment": [5, 6]}
```
