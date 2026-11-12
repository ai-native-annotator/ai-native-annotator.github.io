# Skill: names, dates, quantities, ordinals (Uzbek)

You are building a UMR graph for one Uzbek sentence. You are given one piece that is a
proper name, a date, a quantity, a percentage or an ordinal. Write **its whole UMR graph
fragment** as JSON. The structures are fixed; they are written in penman below only to
show their shape.

The sentence and the piece are given under **Input** at the end. Tokens are words with
their suffixes; a span counts whole words.

## Named entities

A type concept with a `:name` child; each **word** of the name is one quoted `:opN`, as
written but **without the case, possessive or plural suffix** the sentence adds:

    (p / person :name (n / name :op1 "Alisher" :op2 "Navoiy"))
    (c / country :name (n / name :op1 "O'zbekiston"))        O'zbekistonning, O'zbekistonda
    (c2 / city :name (n2 / name :op1 "Toshkent"))            Toshkentga, Toshkentdagi

- A name with its type word (`Toshkent shahri`, `Sirdaryo viloyati`, `Amudaryo daryosi`):
  the type word gives the concept (`city`, `province`, `river`) and is not part of the
  name; its possessive suffix (`shahri`) gets no node.
- An organization's name keeps all its words (`O'zbekiston Milliy universiteti` →
  `university` with `:op1 "O'zbekiston" :op2 "Milliy" :op3 "universiteti"`); a code with
  digits or a hyphen (`A-12`) stays one op.
- A place name before an institution's own name is split off: the institution takes the
  place as `:possessor`, an entity with its own type and name.

Choose the most specific type: person, country, city, province, organization, company,
government-organization, university, newspaper, river, mountain, ... . Do not add
`:wiki`. A state body (`Oliy Majlis`, a ministry `vazirligi`, a court, the central bank)
is `government-organization`. A name used as a modifier is still the entity.

## Dates

    (d / date-entity :year 2023 :month 3 :day 5)          2023-yil 5-mart, 2023-yil 5-martda
    (d / date-entity :weekday (j / juma))                 jumada

Numbers only, never strings. The months: yanvar 1, fevral 2, mart 3, aprel 4, may 5,
iyun 6, iyul 7, avgust 8, sentabr 9, oktabr 10, noyabr 11, dekabr 12. `bugun`, `kecha`,
`o'tgan hafta` are not dates.

## Quantities

    (t / temporal-quantity :quant 20 :unit (y / yil))           20 yil
    (m / monetary-quantity :quant 5000 :unit (s / so'm))        5 ming so'm
    (p / percentage-entity :value 4.6)                          4,6 foiz

`:quant` is a plain number (`5 ming` → 5000, `2 million` → 2000000, `uch` → 3, a decimal
comma is a point). The unit is a concept in Uzbek (`yil`, `oy`, `kun`, `so'm`,
`kilometr`). `sakkiz oydan ortiq` 'more than eight months' →
`(m / more-than :op1 (t / temporal-quantity :quant 8 :unit (o / oy)))`.

## Ordinals

`birinchi marta` → `(o / ordinal-entity :value 1)`; `uchinchi` → `:value 3`. An ordinal
with a time unit (`uchinchi yili`, `ikkinchi kuni`) is a temporal quantity with that
ordinal: `(t / temporal-quantity :unit (y / yil) :ord (o / ordinal-entity :value 3))`.

## Output

- `graph`: the fragment, `{{"nodes": [...], "edges": [...], "attrs": [...]}}`. Every
  `(v / concept` of the shapes above is a node `{{"var": "v", "concept": "concept"}}`
  (the **first node is the root**); every `:role (child ...)` is an edge `[parent, role,
  child]`; every `:role constant` is an attribute `[var, role, value]`. `Alisher Navoiy`
  is

      nodes  [{{"var": "p", "concept": "person"}}, {{"var": "n", "concept": "name"}}]
      edges  [["p", "name", "n"]]
      attrs  [["n", "op1", "Alisher"], ["n", "op2", "Navoiy"]]

  Write name parts as plain strings (no extra quotes) and numbers as numbers. Variable
  names are yours; they are renamed later. Each names one thing.
- `open`: usually `[]`. Only if the piece contains something that is not part of the
  fixed structure and needs its own annotation, make it a placeholder `{{"var": "x1",
  "text": ..., "span": [first, last]}}` joined by an edge.
- `outside`: almost always `[]`. Only if a node of the entity takes a participant that
  is written elsewhere in this sentence, give it as `{{"var": "y1", "node": ...,
  "text": ...}}`, its var used in `edges` like a placeholder; `node` names the
  participant's node in the table **Nodes of this sentence so far** at the end of the
  input. It is joined to that node.
- `alignment`: the span of the whole piece.

## Tools

There is no Uzbek gold annotation: `search_annotations` returns nothing for Uzbek. To
check a rule, call `search_guidelines` with keywords: it returns the matching sections
of the UMR guidelines.

## Input

Sentence: {sent}
Tokens, each with its number: {token_sent}
Language: {lang}

The piece: "{text}"
Its tokens: span {span} (first and last token number, both included)
