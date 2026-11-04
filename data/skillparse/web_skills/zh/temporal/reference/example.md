# temporal — worked examples

## A date, a chain and a cause

Sentences:

1. `2007年7月，该台开始播出普通话节目。`
2. `节目受到欢迎，收视率随后上升。` (the current sentence)

Nodes of sentence 2: `2:0` and (the two clauses), `2:0.0` 受到-01 (受到欢迎), `2:0.0.1`
欢迎-01, `2:0.1` 上升-02 (收视率随后上升). Sentence 1 has `1:0` 开始-01 and `1:0.0` its date.

```json
{"relations": [
  {"group": "temporal", "source": "1:0", "relation": "after", "target": "2:0.0"},
  {"group": "temporal", "source": "2:0.0", "relation": "overlap", "target": "2:0.0.1"},
  {"group": "temporal", "source": "2:0.0", "relation": "after", "target": "2:0.1"}
]}
```

- The main event 受到 has no date of its own: it comes after the broadcasting begins in the
  sentence before (`after`, that event the parent).
- 欢迎 is an event built inside the clause: it chains to 受到 with `overlap`.
- 随后 orders 上升 after 受到: the earlier event is the source of `after`.
- Every event of sentence 2 has exactly one parent; `and` is not an event.
