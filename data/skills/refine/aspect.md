# Skill: aspect

Every eventive node must carry exactly one `:aspect`. Legal values:

`state`, `habitual`, `activity`, `endeavor`, `performance`,
`reversible-state`, `irreversible-state`, `inherent-state`, `point-state`

- Stative predicates take `state` (or the more specific state values).
- A completed, bounded event is `performance`; an unbounded one is `activity`.
- A repeated or characteristic event is `habitual`.
- Non-eventive nodes (entities, names, quantities) take no `:aspect` — remove
  it if the draft added one.

Add `:modstr fullaff` where modal strength is unmarked and clearly asserted.
