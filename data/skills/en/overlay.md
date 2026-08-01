# English-specific guidance (applies on top of the shared skill)

- Lemmatise predicates (decided → decide) and use English PropBank senses
  (`decide-01`). Verb-particle constructions use the multiword frame when it
  exists (`give_up` → `give-up-07`-style ids appear as `give-up-07`).
- Copular sentences: "X is Y(category)" → `have-role-91` for professions/roles,
  `identity-91` for naming equations, `have-mod-91` for adjectival predicates
  ("X is red"), `belong-91` possession, `exist-91` existentials.
- Articles (a/the), infinitive "to", auxiliary do/be/have are dropped —
  express their meaning through attributes (definiteness is NOT annotated;
  tense feeds `:aspect` and document-level temporal).
- Modals: can/may/must → `:modstr` weakening (`neutaff`) and/or `:modpred`;
  "will" future → `neutaff`; negation "not/never" → `:polarity -` + `fullneg`.
- Aspect defaults: simple past telic → `performance`; past stative → `state`;
  progressive → `activity`; present habitual → `habitual`; generic statements
  → `habitual` or `state` per the examples.
- Agent nouns decompose: "owners" → `(person :ARG0-of (own-01))`; "guests" in
  role context → `have-rel-role-92` per the annotated examples.
- Plural marking → `:refer-number plural` on entity nodes.
- `:wiki` values use English page titles.
