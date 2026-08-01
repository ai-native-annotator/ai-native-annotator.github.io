# Output node schema (shared by all modules)

All modules output **JSON only** (no prose outside the JSON). A *node* is:

```json
{
  "id": "e1",
  "concept": "treat-01",
  "relations": [
    [":ARG0", { ...child node... }],
    [":ARG1", {"ref": "e1"}],
    [":aspect", "performance"],
    [":op1", "\"Beijing\""]
  ],
  "phrase": "the text span this node covers",
  "note": "one short sentence explaining your decision"
}
```

Rules:

- `relations` is an ordered list of `[role, value]` pairs. A value is either a
  nested node (JSON object), a reference `{"ref": "<id>"}` to a node defined
  elsewhere in *this* sentence (reentrancy), or a constant.
- Constants: numbers stay bare (`1853`), strings that are names/words-as-text
  are quoted with escaped quotes (`"\"世界\""`), closed-class attribute values
  stay bare (`performance`, `fullaff`, `-`, `plural`).
- Give `id` only to nodes you re-reference.
- When you cannot finish a subtree yourself, emit a **pending leaf** instead
  of a node: `{"expand": true, "phrase": "<exact text of the part>",
  "kind": "clause" | "np" | "special" | "atomic"}` — a later module expands it.
  * `clause`  = contains its own predicate (verb phrase, clause)
  * `np`      = noun phrase needing head/modifier analysis
  * `special` = date/time, quantity+unit, URL, number range, score, etc.
  * `atomic`  = single common noun / single concept, nothing left to analyse
- `phrase` must copy the exact words from the input sentence — it is how the
  system verifies no text is lost.
