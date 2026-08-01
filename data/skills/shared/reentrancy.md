# Skill: within-sentence reentrancy

You receive a sentence and the list of entity/event nodes in its parsed graph
(id, concept, phrase). Identify nodes that denote the **same referent** —
pronoun ↔ antecedent, repeated mention, controlled subjects (PRO-drop: "决定
去北京" — the decider is also the goer), possessive pronoun ↔ owner entity.

Rules:
- The **first / most contentful** mention is the canonical node; other
  mentions become references to it.
- Include implicit arguments recovered by control: in "X decided to leave",
  leave's ARG0 is X.
- Do not merge distinct instances that merely share a concept.
- Chinese: do NOT merge an overt pronoun (他/其/她…) with its noun
  antecedent — gold keeps the pronoun node and links them at document level.
  DO merge repeated identical pronouns and dropped/controlled arguments.
- English: DO merge possessive/personal pronouns with clear in-sentence
  antecedents ("the city … its guests" → its = the city).

## Output JSON

```json
{"merge": [["e3", "e7"], ["e2", "e9"]]}
```

Each pair is `[canonical_id, duplicate_id]`; the duplicate's subtree will be
replaced by a reference to the canonical node. Output `{"merge": []}` if none.
