# Skill: sense selection, argument structure, and event attributes

You receive: a clause, its core predicate (text + candidate PropBank frames or
an abstract concept with its role inventory). Build the **event node**: choose
the numbered sense, attach every remaining part of the clause as an argument
or modifier (as pending leaves), and set the event attributes.

## 1. Sense

Pick the PropBank roleset whose role inventory matches the clause meaning
(`decide-01`). If the verb is missing from PropBank, use `<lemma>-01` (the gold data's convention for out-of-PropBank verbs).
Abstract concepts keep their given name (`identity-91`).

## 2. Arguments and modifiers

- Use the frame's numbered args: `:ARG0` (agent-like), `:ARG1`, ... exactly as
  the frame file defines them. Never invent numbers the frame doesn't list.
- Everything else in the clause attaches with a semantic role. Choose the most
  specific applicable one; `:mod` is a last resort. Common ones:

| role | scenario |
|---|---|
| `:temporal` | when — dates, "yesterday", time clauses |
| `:duration` | for how long |
| `:place` | where |
| `:start` / `:goal` / `:source` | from/to (motion, transfer) |
| `:manner` | how (adverbs of manner, 方式) |
| `:degree` | intensifiers on gradable predicates ("very") |
| `:instrument` | with what tool |
| `:companion` | with whom |
| `:cause` / `:reason` | because-phrases |
| `:purpose` | in-order-to phrases |
| `:condition` / `:concession` | if- / although-clauses |
| `:quant` | event quantity ("twice") |
| `:extent` | by how much |
| `:affectee` | benefactive/malefactive ("for him") |
| `:vocative` | addressee called by name |
| `:topic` | aboutness ("about X", 关于) |
| `:medium` | language/channel ("in English") |
| `:poss` / `:possessor` | possession inside NPs |
| `:ord` | ordinal ("first") |
| `:li` | list marker |
| `:polarity -` | negation (not/没/不/未) |

- For languages **with** a PropBank (English, Chinese) prefer `:ARGn`; roles
  like `:actor :theme :recipient :undergoer :causer :experiencer :stimulus`
  are for languages without frames — do not use them here.
- Inverse roles: a relative clause modifying an entity uses `:ARGn-of` on the
  entity ("the tabloid that stopped publishing" → tabloid `:ARG1-of` stop-01).

Each argument value is a pending leaf `{"expand": true, "phrase": "...",
"kind": "np|clause|special|atomic"}` — copy the exact words; do not analyse
argument internals here. Pronouns and single nouns are `atomic`.

## 3. Event attributes (obligatory on every event node)

- `:aspect` — pick from: `state` (stative predicates, properties, identity),
  `habitual` (regular/repeated, 经常), `activity` (ongoing, no endpoint
  reached), `process` (unspecified dynamic, used for present/ongoing),
  `atelic-process`, `endeavor` (ended without result), `performance`
  (completed with result — most past/perfective events, Chinese 了/已经),
  `imperfective` (ambiguous state/process), `perfective` (ended, result
  unspecified). Nominalised or irrealis complement events still get an aspect.
- `:modstr` — modal strength (Part 4-3 pre-annotation):
  `fullaff` asserted fact; `partaff` "probably"; `neutaff` "maybe/want/plan/
  未然 future, questions"; `fullneg` negated fact; `partneg`; `neutneg`.
  Complements of "think/say" are still `fullaff` unless hedged.
  (The document-level module will convert these into the modal dependency.)
- `:polarity -` for negation; `:mode imperative|interrogative|expressive` for
  non-declarative main clauses; `umr-unknown` as ARG for wh-questions.
- `:modpred` when the event is under a modal predicate ("can", "must").

## Output JSON

One event node (schema in the node-schema section), e.g.:

```json
{
  "concept": "decide-01",
  "relations": [
    [":ARG0", {"expand": true, "phrase": "the city", "kind": "np"}],
    [":ARG1", {"expand": true, "phrase": "to treat its guests more like royalty", "kind": "clause"}],
    [":aspect", "performance"],
    [":modstr", "fullaff"]
  ],
  "phrase": "<the full clause>",
  "note": "sense -01 'come to a conclusion' fits"
}
```
