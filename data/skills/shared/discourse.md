# Skill: intra-sentence discourse relation detection

You receive one sentence. Decide whether the *top* of its UMR graph is a
discourse relation joining two or more clauses/conjuncts, and if so, split the
sentence into the spans each conjunct covers.

## Discourse concepts (UMR guideline Part 3-1-6)

| concept | use when |
|---|---|
| `and` | plain coordination, temporal succession ("and then"), 并列 |
| `consecutive` | pure temporal succession of events |
| `additive` | "moreover", 此外/而且 with no joint affirmation |
| `and-but` / `but-91` | contrast after coordination; `but-91` when only two clauses with :ARG1/:ARG2 |
| `contrast-91` | "however/但是/却" pure contrast (:ARG1, :ARG2) |
| `and-unexpected` / `unexpected-co-occurrence-91` | "even though / 虽然...但是" concession |
| `and-contrast` | coordination + contrast mixed |
| `or` / `inclusive-disj` / `exclusive-disj` | disjunction ("or", 或/还是) |
| `:condition` (role, not concept) | "if / 如果" — the condition clause attaches to the main clause with `:condition` |
| `:concession` | "although / despite / 尽管" attaches as role on the main event |
| `:purpose` | "in order to / 为了" |
| `:reason` / `:cause` | "because / 因为/由于" |
| `:temporal` | subordinate time clause ("when / 当...时") attaches as role |

Key distinction: coordination of equal-status clauses → a discourse **concept**
at the top with `:op1`, `:op2`, ...; subordination (condition, reason, purpose,
concession, time) → the main clause is the top and the subordinate clause is a
pending leaf attached with the **role**.

Nuance without explicit connective still counts: "他没来，我很失望" is causal.
Do not use a discourse relation for a single clause with adjuncts.

## Output JSON

```json
{
  "has_discourse": true,
  "structure": {
    "concept": "and",
    "relations": [
      [":op1", {"expand": true, "phrase": "<clause 1 exact text>", "kind": "clause"}],
      [":op2", {"expand": true, "phrase": "<clause 2 exact text>", "kind": "clause"}]
    ],
    "note": "why"
  }
}
```

For subordination, put the main clause as `structure` itself:

```json
{
  "has_discourse": true,
  "structure": {"expand": true, "phrase": "<main clause>", "kind": "clause",
                 "sub": [[":condition", {"expand": true, "phrase": "<if-clause>", "kind": "clause"}]]}
}
```

If the sentence is a single clause: `{"has_discourse": false}`.

**Coverage rule (checked programmatically): every word of the sentence must
appear in exactly one of the `phrase` spans** (connective words themselves may
be dropped — they are expressed by the concept/role). Before answering,
verify the spans concatenate back to the whole sentence; a sentence with
three coordinated clauses needs `:op1`, `:op2`, AND `:op3` — never drop a
clause.
