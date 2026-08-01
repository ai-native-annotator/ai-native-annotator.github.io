# Skill: noun-phrase decomposition

You receive a noun phrase. Produce its UMR subtree: identify the **head
concept**, attach the rest with precise relations.

## Head identification

- The head may be **implicit**: "player" → `(person :ARG0-of (play-01 ...))`;
  "雕刻师" (engraver) → the person, with the activity as `:ARG0-of` if
  decomposable; agent nouns ending in -er/-ist/-者/-家/-师 usually decompose to
  `person` + `:ARG0-of` when the base verb exists in PropBank; keep the noun
  itself when it is lexicalised and the annotation examples keep it.
- Named entities: head is the **NE type concept** (e.g. `person`, `country`,
  `city`, `government-organization`, `company`, `newspaper`, `university`,
  `political-party`, `religious-group`, `aircraft-type`, `book`, `publication`,
  `test`, ...), with the name under a `name` node:
  `(s / country :name (n / name :op1 "美国") :wiki "...")` — include `:wiki`
  only if the entity clearly has a Wikipedia page title you are confident of.
  The `name` node covers the FULL name span, one `:op` per token, including
  brackets/quote marks (《》（）) as tokens; never decompose the inside of a
  proper name into modifier structure.
- Pronouns (Part 3-3-5 Ref): concept `person` (or `thing`) with
  `:refer-person` (`1st`/`2nd`/`3rd`) and `:refer-number`
  (`singular`/`plural`): "we" → `(person :refer-person 1st :refer-number plural)`.
  Demonstratives "this/that" on a noun → `:mod (this)` — actually use
  `(t / this)` as a mod child.
- Bare plurals / countable nouns: add `:refer-number plural|singular` when the
  language marks it (English -s; Chinese 们 or numeral+classifier).

## Modifier relations

| pattern | annotation |
|---|---|
| adjective property | `:mod (concept)` |
| nationality/origin | `:mod (country :name ...)` or `:place` |
| possessor "X's Y" / X的Y | `:poss` (ownership) or `:part-of`, `:source` as fits |
| relative clause | `:ARGn-of (verb-XX ...)` with the NP's role inside the clause |
| number + classifier | `:quant 3` (+ `:unit` for Chinese classifiers, e.g. `:unit (份)`) |
| ordinal | `:ord (ordinal-entity :value 1)` |
| quantity with measure unit | use a quantity entity (see special-entity skill) |
| comparison "more X than Y" | `have-degree-91` with ARG1 entity, ARG2 property, ARG3 `(more)`, ARG4 compared-to |
| superlative | `have-degree-91` ARG3 `(most)`, ARG5 superset |
| "kind/type of" | `:mod` on the kind |
| apposition "the poet Li Bai" | head entity + `:name`, role noun via `have-role-91` `:ARG2` |

Attach sub-phrases you cannot finish as pending leaves (`"expand": true`).
Atomic nouns become plain nodes with the noun lemma as concept.

## Output JSON

One node. Example — "美国超市小报":

```json
{
  "concept": "小报",
  "relations": [
    [":mod", {"concept": "超市"}],
    [":place", {"concept": "country",
                 "relations": [[":name", {"concept": "name", "relations": [[":op1", "\"美国\""]]}]]}]
  ],
  "phrase": "美国超市小报"
}
```
