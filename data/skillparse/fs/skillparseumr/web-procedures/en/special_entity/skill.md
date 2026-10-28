# Skill: names, dates, quantities, ordinals

You are building a UMR graph for one sentence. You are given one piece that is
a proper name, a date, a quantity, a percentage or an ordinal. Write **its whole UMR
graph fragment** as JSON. The structures are fixed; they are written in penman
below only to show their shape.

The sentence and the piece are given under **Input** at the end.

## Named entities

A type concept with a `:name` child; each **word** of the name is one quoted
`:opN`, exactly as written:

    (p / person :name (n / name :op1 "Edmund" :op2 "Pope"))
    (c / country :name (n / name :op1 "Russia"))
    (c2 / city :name (n2 / name :op1 "Tacloban"))

- Chinese names are split into words, never into single characters:
  欧洲议会 → `:op1 "欧洲" :op2 "议会"`.
- A transliterated foreign name is split at the middle dot `·`, and the dots
  are dropped: 玛丽·居里 → `:op1 "玛丽" :op2 "居里"`.
- A code with a hyphen, slash or digits (A-12, 747-400) stays one op.
- A model or version designation with its type noun (A-12型, 2004-B版) is one
  `product` whose name has both parts: `:op1 "A-12" :op2 "型"`.
- A place name before an institution's own name (伦敦交通局, 日本气象厅) is
  split off. The institution is named by its own word(s) and takes the place
  as `:possessor`, an entity with its own type and name:
  `(g / government-organization :name (n / name :op1 "交通局") :possessor (c / city :name (n2 / name :op1 "伦敦")))`.


Choose the most specific type: person, country, city, state, province,
organization, company, government-organization, military, publication,
newspaper, facility, island, continent, world-region, ... . Do not add `:wiki`.
A state body (parliament, congress, ministry, bureau, court, central bank,
a government mint or agency) is `government-organization`, not
`organization`. A name used as a modifier
(*Russian* in *Russian prison*) is still the entity: `(c / country :name (n /
name :op1 "Russia"))`.

## Dates

    (d / date-entity :year 2006 :month 2 :day 17)
    (d / date-entity :weekday (f / friday))

Numbers only, never strings. *today*, *last week*, 今天 are not dates.

## Quantities

    (t / temporal-quantity :quant 20 :unit (y / year))
    (m / monetary-quantity :quant 3499 :unit (d / dollar))
    (p / percentage-entity :value 4.6)

`:quant` is a plain number (*1,500* → 1500, *二十* → 20, *5 million* →
5000000). The unit is a concept in the sentence's language (English `dollar`,
`year`; Chinese `欧元`, `年`). *more than eight months* →
`(m / more-than :op1 (t / temporal-quantity :quant 8 :unit (m2 / month)))`.

## Ordinals

*the first time* → `(o / ordinal-entity :value 1)`; 第三次 → `:value 3`.
An ordinal with a time unit (第三年, *the second day*) is a temporal quantity
with that ordinal: `(t / temporal-quantity :unit (y / 年) :ord (o / ordinal-entity :value 3))`.

## Output

- `graph`: the fragment, `{{"nodes": [...], "edges": [...], "attrs": [...]}}`.
  Every `(v / concept` of the shapes above is a node `{{"var": "v", "concept":
  "concept"}}` (the **first node is the root**); every `:role (child ...)` is an
  edge `[parent, role, child]`; every `:role constant` is an attribute
  `[var, role, value]`. *Edmund Pope* is

      nodes  [{{"var": "p", "concept": "person"}}, {{"var": "n", "concept": "name"}}]
      edges  [["p", "name", "n"]]
      attrs  [["n", "op1", "Edmund"], ["n", "op2", "Pope"]]

  Write name parts and wiki titles as plain strings (no extra quotes) and
  numbers as numbers. Variable names are yours; they are renamed later.
- `open`: usually `[]`. Only if the piece contains something that is not part
  of the fixed structure and needs its own annotation (*the Russian court in
  Moscow* given to you whole), make it a placeholder `{{"var": "x1", "text":
  ..., "span": [first, last]}}` joined by an edge.
- `outside`: almost always `[]`. Only if a node of the entity takes a
  participant that is written elsewhere in this sentence and not in the piece,
  give it as `{{"var": "y1", "text": ..., "span": [first, last]}}`, its var
  used in `edges` like a placeholder; `text` and `span` are the participant's
  **head word only**. It is joined to the node that already stands for it.
- `alignment`: the span of the whole piece: the numbers of its first and last
  token as listed in Tokens, both included (one token: [4, 4]).

## Examples

Call the `get_example` tool before answering: it returns worked examples of
this skill's input and output.

## Input

Sentence: {sent}
Tokens, each with its number: {token_sent}
Language: {lang}

The piece: "{text}"
Its tokens: span {span} (first and last token number, both included)
