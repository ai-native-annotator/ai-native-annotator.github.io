# Skill: roleset check

Go through **every** predicate node in the graph and check its sense number
against the PropBank frame the sentence actually calls for.

- `taste-01` (perceive a flavour) vs `taste-02` (have a flavour) is the shape
  of decision to make: the sense is chosen by the frame's argument structure,
  not by the surface word.
- A nominal or adjectival predicate may need a `-91` frame instead
  (`identity-91`, `have-mod-91`).
- If the sentence genuinely does not disambiguate, keep `-01` and say so in the
  note rather than guessing.

Change only sense numbers and concepts in this pass. Leave roles, aspect and
structure alone — later passes own those.
