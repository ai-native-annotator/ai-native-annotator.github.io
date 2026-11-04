# coref — worked example

## A pronoun

Sentences:

1. `Maria wanted to leave early, but her brother refused.`
2. `She left anyway on Friday.` (the current sentence)

Nodes: sentence 1 has `1:0.0.0` person (*Maria*) and `1:0.1.0` person (*her brother*);
sentence 2 has `2:0.0` person (*She*).

```json
{"relations": [
  {"group": "coref", "source": "1:0.0.0", "relation": "same-entity", "target": "2:0.0"}
]}
```

- *She* is Maria, not her brother: `same-entity`, from the earlier node to the current one.
