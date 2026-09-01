# Skill: entity structure

Normalise every entity in the graph.

- A named entity is a typed node wrapping a `name`:
  `(p / person :name (n / name :op1 "Edmund" :op2 "Pope"))`
- Add `:wiki "Title"` where the referent is unambiguously a real-world entity;
  omit `:wiki` rather than invent one.
- Dates become `date-entity` with `:year` / `:month` / `:day`; durations become
  `temporal-quantity` with `:quant` and `:unit`.
- Countries, organisations and publications get their proper entity type
  (`country`, `organization`, `publication`) rather than a bare noun.
