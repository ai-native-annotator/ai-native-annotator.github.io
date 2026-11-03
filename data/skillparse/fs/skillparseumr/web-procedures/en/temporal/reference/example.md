# document — worked example

Sentences:

1. `Maria wanted to leave early, but her brother refused.`
2. `She left anyway on Friday.` (the current sentence)

Relevant nodes of sentence 2's tree (node ids are paths from the root):
`0.0` predicate `leave-11`, `0.0.0.0` sent_type stop `person` (*She*),
`0.0.0.1.0` special_entity date (*on Friday*).
Earlier: sentence 1 has `0.0.0` (*Maria*, special_entity) and `0.0.0.0.1.0` the
predicate `leave-11` of *to leave early*.

```json
{"relations": [
  {"group": "temporal", "source": "document-creation-time", "relation": "depends-on", "target": "2:0.0.0.1.0"},
  {"group": "temporal", "source": "2:0.0.0.1.0", "relation": "contained", "target": "2:0.0"},
  {"group": "coref", "source": "1:0.0.0", "relation": "same-entity", "target": "2:0.0.0.0"}
]}
```

- *on Friday* is a time expression: anchored to the document creation time with
  `depends-on`, and the leaving is `contained` in it.
- No modal relation: the leaving is the author's own statement, and its
  `modstr` (full-affirmative) becomes `author` `full-affirmative` by itself.
- *She* is Maria: `same-entity`, from the earlier node to the current one.

## A reported view

Sentences:

1. `The museum announced on Monday that the old wing will close next year.`
   (the current sentence)

Relevant nodes: `0.0` predicate `announce-01`, `0.0.0` special_entity
`museum` (*The museum*), `0.0.2.0` predicate `close-01` (*will close*).

```json
{"relations": [
  {"group": "modal", "source": "author", "relation": "full-affirmative", "target": "1:0.0.0"},
  {"group": "modal", "source": "1:0.0.0", "relation": "partial-affirmative", "target": "1:0.0.2.0"}
]}
```

- The announcing is the author's own statement: nothing to write, its modstr
  does it.
- The closing is what the museum says: the museum is its conceiver
  (`partial-affirmative`: a plan for the future), and the museum itself is a
  child of `author`.
