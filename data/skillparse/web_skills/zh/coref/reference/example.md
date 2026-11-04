# coref — worked examples

## A name, a pronoun and a summing-up noun

Sentences:

1. `《世界新闻周报》报导了一宗爆炸案。`
2. `该周报称，此事造成三人死亡，他们都是游客。` (the current sentence)

Nodes: sentence 1 has `1:0.0` newspaper (《世界新闻周报》) and `1:0.1` 爆炸-01 (一宗爆炸案).
Sentence 2 has `2:0` 称-01, `2:0.0` 周报 (该周报), `2:0.1` and (what it says), `2:0.1.0`
造成-01, `2:0.1.0.0` 事 (此事), `2:0.1.0.1` person (三人), `2:0.1.1` identity-91 (他们都是游客),
`2:0.1.1.0` person (他们).

```json
{"relations": [
  {"group": "coref", "source": "1:0.0", "relation": "same-entity", "target": "2:0.0"},
  {"group": "coref", "source": "1:0.1", "relation": "same-event", "target": "2:0.1.0.0"},
  {"group": "coref", "source": "2:0.1.0.1", "relation": "same-entity", "target": "2:0.1.1.0"}
]}
```

- 该周报 is the newspaper named before: linked to the newspaper node, not to its `name`.
- 此事 sums up the explosion: `same-event`, because the earlier node is an event.
- 他们 is the three people of this very sentence: the source can be a node of the current
  sentence too, the closest earlier mention.
