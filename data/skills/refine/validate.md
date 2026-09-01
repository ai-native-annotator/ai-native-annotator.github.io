# Skill: validation

Last pass. Check the graph is well formed and fix only what is broken.

- Parentheses balance; every variable is defined exactly once and every
  reference resolves.
- Every role starts with `:` and every node is `(var / concept ...)`.
- No node carries two `:aspect`s; no entity carries one at all.
- Variables follow the `s<N><letter>` convention for sentence N.

If the graph is already well formed, return it unchanged with an empty
changes list. Do not take this pass as an invitation to re-annotate.
