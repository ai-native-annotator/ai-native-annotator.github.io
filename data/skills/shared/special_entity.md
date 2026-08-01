# Skill: special-text entities (dates, quantities, ranges, URLs, scores)

You receive a phrase that is a date/time expression, quantity, range, URL,
score, or similar special text. Produce its UMR subtree using the entity
concepts below (from SP_and_Discourse resource).

## Dates and times

- `date-entity` with `:year :month :day :time :weekday :decade :century
  :season :quarter :era :calendar`:
  "1853年2月21日" → `(d / date-entity :year 1853 :month 2 :day 21)`.
- Intervals "1854至1889年" → `(d / date-interval :op1 1854 :op2 1889)`
  (also usable under `:year2` for production periods, following the data).
- **before/after expressions**: the word *before*/*after* (之前/之后/以前/以后)
  becomes the head concept with the anchor as `:op1`:
  "after 2008" → `(a / after :op1 (d / date-entity :year 2008))`;
  "三天后" → `(a / after :op1 (n / now) :duration (t / temporal-quantity :quant 3 :unit (d / day)))` —
  follow the annotated examples' pattern.
- Relative "now/today/当时" → `now`, `today`, or `date-entity` as data shows.

## Quantities

- Measures: `<X>-quantity` concepts with `:quant` and `:unit`:
  monetary-quantity, distance-quantity, temporal-quantity, mass-quantity,
  area-quantity, volume-quantity, speed-quantity, percentage-entity...
  "3美元" → `(m / monetary-quantity :quant 3 :unit (y / 美元))` (Chinese data
  keeps the native unit word as unit concept; English uses `dollar`).
- Percentages: `(p / percentage-entity :value 25)`.
- Approximate numbers: `(a / about :op1 200)`; bounds: `more-than`,
  `less-than`, `at-least`, `at-most` with `:op1`.
- Value ranges: `(v / value-interval :op1 10 :op2 20)`.
- Ordinals: `(o / ordinal-entity :value 3)`.
- Scores "3比2" → `(s / score-entity :op1 3 :op2 2)`.

## Other special text

- URL: `(u / url-entity :value "https://...")`
- Phone: `phone-number-entity`; email: `email-address-entity`;
  string literal mention: `(s / string-entity :value "...")`.

## Output JSON

One node in the shared schema. Numbers are bare constants; unit words are
child nodes. Example — "于1854至1889年间":

```json
{"concept": "date-interval",
 "relations": [[":op1", 1854], [":op2", 1889]],
 "phrase": "1854至1889年"}
```
