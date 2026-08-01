# Skill: stop test (should this phrase be decomposed further?)

You receive a short phrase. Classify it:

- `atomic`  — a single concept: one common noun that is *not* an agentive/
  deverbal noun ("city", "文件"), a pronoun, a bare number. STOP: it becomes a
  leaf node (pronouns still get refer-person/number by the NP module).
- `np`      — a noun phrase with internal structure (modifiers, names,
  possessors, relative clauses, implicit heads like "player"= person who
  plays, agent nouns, kinship terms).
- `clause`  — contains its own predicate (verb, stative adjective predicate,
  nominalised event that PropBank covers).
- `special` — date/time/quantity/range/URL/score expressions.

Stop criteria (guideline-derived): a phrase stops decomposing when it is
(a) exactly one PropBank frame with no overt arguments, or (b) a noun with no
implicit event reading, or (c) a closed-class item (pronoun, number).

## Output JSON

```json
{"kind": "np", "note": "has a possessor modifier"}
```
