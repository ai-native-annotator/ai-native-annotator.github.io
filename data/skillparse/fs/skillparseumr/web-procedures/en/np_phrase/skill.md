# Skill: one noun phrase — its head and modifiers

You are building a Uniform Meaning Representation (UMR) graph for one sentence.
You are given one noun phrase. Write **the graph fragment of its head**, and
one placeholder for each modifier, which other skills annotate later.

The sentence and the phrase are given under **Input** at the end.

## 1. The head: often more than one node

| the head noun is | fragment |
|---|---|
| an ordinary noun | one node, its lemma: *businessmen* → `businessman`; Chinese: the noun as written |
| someone who does an event (*rescuer*, *survivor*, *spokesman*, *buyer*, 救援者) | `person` with `ARG0-of` the event: `(p / person :ARG0-of (r / rescue-01))` |
| someone an event is done to (*employee*, *nominee*), or defined by a state (*expert*) | `person` with `ARG1-of` the event: `(p / person :ARG1-of (e / employ-01))`, `(p / person :ARG1-of (e / expert-01))` |
| a role or title in an organization (*the president of X*, *the bank's chairman*, *official*) | `(p / person :ARG1-of (h / have-org-role-92 :ARG2 <organization> :ARG3 (t / <title>)))`; with no organization `have-role-91 :ARG3 (t / <title>)` |
| Chinese: a title followed by the person's name (工程师王强, 该厂高级工程师王强) | the **title noun is the head** and carries the name, with no `person` node: `(t / 工程师 :name (n / name :op1 "王强"))`. A rank word on the title (高级, 副, 总) goes in `t :ARG1-of (h / have-rel-role-91 :ARG2 (r / 高级 :possessor <organization>))` |
| a role held in a group or people (部落首领, 某族公主) | the role noun as head: `(r / 首领 :ARG1-of (h / have-rel-role-91 :ARG2 <group>))` |
| a kinship or social role (*his mother*, *her boss*) | `(p / person :ARG1-of (h / have-rel-role-92 :ARG2 <the other> :ARG3 (m / mother)))` |
| a number of things (*200 people*, *three books*, 三本书) | the thing with `:quant`: `(p / person :quant 200)`; a number is an attribute, not a node; a Chinese classifier after it is a `unit` node: 三本书 → `(b / 书 :quant 3 :unit (u / 本))` |
| an amount with a unit used as a denomination or label of the noun (10元纸币, 5欧元硬币, 2角邮票) | `:quant` and `:unit` **directly on the noun**: `(z / 纸币 :quant 10 :unit (u / 元))`; no `monetary-quantity`, no placeholder for the amount |
| a quantity word + classifier (多种颜色, 几类产品) | `quant` the quantity word as a node (`多`, `几`), `unit` the classifier: `(c / 颜色 :quant (q / 多) :unit (u / 种))` |
| a number + classifier with no noun (两张, 一台) | the span as written is the concept, with `:quant` and `:unit`: `(x / 两张 :quant 2 :unit (u / 张))`; never invent the missing noun |
| 超过 / 多于 / 不到 + number + classifier on a noun | the noun `:ARG1-of` a node for the comparative word, which carries `:quant` and `:unit` (the classifier); the classifier is never the head |
| a nominalised event (*the destruction of the city*, *his arrival*) | the event with its sense: `destroy-01`, `arrive-01` |

| a word that is one lexical item even though its parts could be split (新手, 大规模, 产量, 销售额) | one node, the word as written; do not split it into head + `mod`, and do not turn X量 / X额 into an event |

| a pronoun | `person` or `thing` with `refer-person` and `refer-number` (below) |
| a coordination of nouns (*Tom and Mary*) | `and`, with the conjuncts as placeholders `op1`, `op2` |

For every event concept (`rescue-01`, `employ-01`, `destroy-01`) **look the
lemma up with `propbank_lookup`** and use a sense it returned.

## 2. Pronouns and number

- A pronoun is `person` (people) or `thing`, with `:refer-person` `1st` /
  `2nd` / `3rd` and `:refer-number` `singular` / `plural`: *they* (people) →
  `(p / person :refer-person 3rd :refer-number plural)`; *I* → `1st singular`;
  *it* → `(t / thing :refer-person 3rd :refer-number singular)`. A possessive
  pronoun (*his*) is the same, used as `possessor`.
- An English common noun in the plural (*horses*, *officials*) gets
  `:refer-number plural` on its head. A singular common noun, a name, and any
  Chinese noun get no `refer-number`.

## 3. Modifiers: placeholders

| the modifier is | role |
|---|---|
| an adjective, a modifying noun (*American*, *government*) | `mod` |
| a possessive (*his*, *the city's*, 我的; X的N where X has N: 文章的字数) | `possessor` |
| a person noun before a thing they own or wear (国王王冠 — the king's crown) | `possessor` |
| a material word (木制, 铁质, 银制, *wooden*) | `material` |
| a quantifier word that is not a number (*many*, *several*, 一些) | `quant`; but 部分 (*some*, *part of*) is `mod` |
| an ordinal (*the first*) | `ord` |
| a relative clause (*who was convicted*, *that she bought*) | `ARGn-of`: **the role the head noun plays in that clause** — *the man who left* `ARG0-of`, *the book that she bought* `ARG1-of`, *the city where he lived* `place-of` |
| a reduced relative (*the man arrested*, *the house built in 1900*) | `ARG1-of` (passive) or `ARG0-of` (*the people living here*) |
| a place (*the base at Ramstein*) | `place` |

| a place before a people or group noun (亚洲移民, 山区居民) | `place` |
| a country or place before a part of it (法国南部, 该岛北岸) | `part-of` on the part: `(b / 北岸 :part-of <country>)` |
| X的中间 / 上面 / 边缘 (a position or part of X) | X is the **head** and the position noun its `part`: `(s / 屏幕 :part (m / 中间))` |
| X画像 / X雕像 (a picture or likeness of X) | `(h / 画像 :ARG1-of (i / identity-91 :ARG2 <X>))` |
| a method or measure noun followed by the goal it serves (措施保证安全) | `purpose` |
| a parenthetical equivalent in another language, （英语：X） | the head's `name`: a `name` node whose ops are the foreign words; the language label is not annotated, and the foreign phrase is not analysed |

| a time (*yesterday's meeting*) | `temporal` |
| an argument of a nominalised event (*of the city*) | `ARG0`, `ARG1`, ... |
| a conjunct of `and` / `or` | `op1`, `op2`, ... |

A modifier that belongs to a node inside the head (the organization of
`have-org-role-92`, the object of *rescue*) is joined to **that** node:
`["h", "ARG2", "x1"]`, not to the head.

In `relative clause + N1 N2`, when the clause describes N1 rather than the
head N2 (戴着王冠的国王画像: the king wears the crown), hang the clause on N1.


English determiners (*the*, *a*) are not modifiers: leave them out of every
node and span. A Chinese demonstrative with a classifier (这种手机, 那本书) is
kept: the demonstrative is a `mod` node (`这` / `那`) and the classifier a
`unit` node, both on the noun. A numeral is an attribute (section 1), not a
placeholder. Never make a node for:
- an anaphor that only repeats a name just given (某大学该校, 某公司该公司):
  the phrase is the named entity alone;
- a possessive 其 whose referent is already in this sentence: give the
  referent in `outside` instead (section 4).

## 4. Participants written outside the phrase: `outside`

Sometimes a node of your fragment needs a participant that is written
**elsewhere in the sentence**, outside the phrase's span. Do not make a new node for it
and do not make it a placeholder: list it in `outside`, and it is joined to
the node that already stands for it (a reentrancy).

- a possessive pronoun whose referent is in this sentence (这家公司把旧工厂改造成其仓库:
  the owner of 仓库 is 公司; 张伟写信请编辑出版他的小说: the owner of 小说 is
  张伟). The referent is the `possessor`; the pronoun gets no node;
- a node inside the head that takes a participant the phrase does not repeat
  but the sentence names elsewhere (the `ARG2` of `identity-91`, the `ARG2` of
  `have-org-role-92`);
- a conjunct or modifier written outside the phrase but meant for it.

A pronoun whose referent is not in this sentence stays a pronoun node
(section 2). Each item is `{{"var": "y1", "text": ..., "span": [first, last],
"at": [first, last]}}`:

- `var`: your own variable, used in `edges` like a placeholder:
  `["t", "possessor", "y1"]`. It can hang on any node of the fragment;
- `text`, `span`: the participant's **head word only**, where it is written
  outside the phrase: for 新成立的那家公司 just 公司, for 作家张伟 just 张伟;
- `at`: the span of the pronoun inside the phrase that stands for it (其,
  他的); leave it out when nothing in the phrase stands for it.

`outside: []` when there are none.

## 5. Output

- `graph`: `{{"nodes": [...], "edges": [...], "attrs": [...]}}`:
  - `nodes`: `{{"var": "p", "concept": "person", "span": [3, 3]}}`; the **first
    node is the head**. Give a node the span of the word it comes from (*rescuers*
    gives both `person` and `rescue-01` its span).
  - `edges`: `[source, role, target]`, e.g. `["p", "ARG0-of", "r"]`,
    `["p", "mod", "x1"]`.
  - `attrs`: `[var, role, value]` for constants: `["p", "quant", "200"]`,
    `["p", "refer-number", "plural"]`.
  Variable names are yours; they are renamed later.
- `open`: one placeholder per modifier, `{{"var": "x1", "text": ..., "span":
  [first, last]}}`, its var used in `edges`. Spans lie inside the phrase's span, never
  include the head word, and drop a preposition that only marks the role (*of*,
  *at*). `open: []` if there are none.
- `outside`: participants written elsewhere in the sentence (section 4), or
  `[]`.
- `alignment`: the span of the head word(s).

## Examples

Call the `get_example` tool before answering: it returns worked examples of
this skill's input and output.

## Input

Sentence: {sent}
Tokens, each with its number: {token_sent}
Language: {lang}

The phrase: "{text}"
Its tokens: span {span} (first and last token number, both included)
