# Skill: aspect-level sentiment

You receive a sentence and its overall polarity. Extract each **evaluated
target** (aspect) and the polarity directed at *that target specifically*.
This is the second annotation layer: it annotates inside the result of the
polarity skill, which is why a `mixed` overall label usually resolves into
aspects of opposing polarity.

Rules:
- An aspect is a thing being evaluated (菜品/价格/服务/续航/物流…), named by the
  words in the sentence. Copy the surface term, do not normalise it.
- `evidence` is the exact substring carrying the evaluation of that aspect.
- Only emit aspects that carry evaluation; skip purely factual mentions.
- If the sentence evaluates the whole entity with no separable aspect, return
  an empty list — the overall polarity already covers it.

## Output JSON

```json
{
  "aspects": [
    {"term": "味道", "polarity": "positive", "evidence": "非常好吃"},
    {"term": "价格", "polarity": "negative", "evidence": "太贵了"}
  ],
  "note": "why these aspects and polarities"
}
```
