# Skill: one-shot UMR draft

Produce a **complete** UMR sentence-level graph for the sentence in one pass.

This is a draft, not a final answer. Later passes will fix rolesets, aspect,
entities, reentrancy and document-level relations, so do not agonise here —
get the overall predicate-argument skeleton right and let the chain refine it.

- Root the graph at the main predicate, in Penman: `(v / concept :role value)`.
- Use PropBank-style senses (`taste-01`); if unsure of the number, use `-01`.
- Give every participant a variable, even if you are unsure of its role.
- Prefer a slightly under-specified graph to an invented one: a missing
  `:aspect` is cheap for pass 4 to add, a wrong participant is expensive to
  unpick.
