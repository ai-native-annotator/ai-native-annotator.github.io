# temporal — worked example

## A deictic date and an earlier event

Sentences:

1. `Maria wanted to leave early, but her brother refused.`
2. `She left anyway on Friday.` (the current sentence)

Nodes of sentence 2: `2:0` leave-11 (*She left anyway on Friday*), `2:0.1` date-entity (*on
Friday*). Sentence 1 has `1:0.0` want-01 and `1:0.0.1` leave-11 (*to leave early*).

```json
{"relations": [
  {"group": "temporal", "source": "document-creation-time", "relation": "depends-on", "target": "2:0.1"},
  {"group": "temporal", "source": "2:0.1", "relation": "overlap", "target": "2:0"}
]}
```

- *on Friday* is relative to the document date: `depends-on`.
- The leaving is located by that date: `overlap`, the date the parent.
- Every event and time expression of sentence 2 has exactly one parent.
