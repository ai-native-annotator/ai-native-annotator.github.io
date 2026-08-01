# Skill: overall sentiment polarity

Judge the sentiment of the whole sentence in one pass — this is a *parallel*
annotation: the input span goes to a finished label without any intermediate
structure.

Values:

| polarity | use when |
|---|---|
| `positive` | the speaker's overall evaluation is favourable |
| `negative` | the overall evaluation is unfavourable |
| `neutral` | descriptive/factual, no evaluative stance |
| `mixed` | genuinely both, with neither dominant ("好吃但太贵") |

Guidance:
- Judge the **speaker's evaluation**, not the emotion described. "他很生气"
  reports anger but is `neutral` unless the speaker endorses it.
- Negation flips: "不难吃" → `positive` (weakly).
- Rhetorical questions and irony take their intended reading, not the literal one.
- Comparatives evaluate the subject, not the reference ("比上次好多了" → positive).

## Output JSON

```json
{
  "polarity": "mixed",
  "confidence": 0.82,
  "note": "one short sentence explaining the decision"
}
```
