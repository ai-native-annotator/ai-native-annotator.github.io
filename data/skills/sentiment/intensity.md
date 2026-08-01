# Skill: sentiment intensity

Rate how strongly the sentiment is expressed, 1–5, and list the words that
carry it. Intensity is independent of polarity: "还行" and "尚可接受" are weak
whatever their direction; "糟透了" and "绝了" are strong.

| value | reading |
|---|---|
| 1 | barely evaluative, hedged ("还可以吧") |
| 2 | mild ("不错") |
| 3 | clear, unmarked ("很好吃") |
| 4 | emphatic ("非常棒", repeated intensifiers) |
| 5 | extreme ("绝了", "烂到家了", exclamations, profanity) |

Count intensifiers (很/非常/太/超级), repetition, punctuation (！！), and
extreme lexis. Hedges (有点/稍微/还算) lower the value.

## Output JSON

```json
{
  "intensity": 4,
  "triggers": ["非常", "太贵了"],
  "note": "what pushed the rating up or down"
}
```
