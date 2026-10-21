H10: round 10 on training group 10 (english_umr-0580), from H9. 14 of 14 operations applied.

- [applied] replace_tool roleset_lookup  — Phrasal rolesets (pick-up-04, get-up-26) were invisible because of the 14-line truncation; append verb-particle rolesets and fall back to the base verb.
- [applied] edit_skill generate delete — Free space (date-entity rule is also in finalize).
- [applied] edit_skill generate delete — Free space (stop is already an event).
- [applied] edit_skill generate delete — Free space; rule repeated in finalize.
- [applied] edit_skill generate add — Gold uses fused phrasal rolesets and :direction with a sense id for other particles.
- [applied] edit_skill generate modify — Gold uses consecutive for clause-joining 'and' with sequential events.
- [applied] edit_skill finalize modify — Gold fuses phrasal rolesets and uses :direction with sense ids.
- [applied] edit_skill finalize modify — Gold has :part-of for 'side of the road'; the critique forced include-91.
- [applied] edit_skill finalize add — Harmful critique rewrites, missing senses, incomplete coref.
- [applied] edit_skill critique modify — The critique removed a correct and-root, which turned throw-01 into :mod.
- [applied] edit_skill critique modify — Conflict with gold: :direction off-07, fused phrasal concepts, kept verb lemma.
- [applied] edit_skill critique modify — Allow fused phrasal concepts.
- [applied] edit_skill critique modify — Prevent the include-91 rewrite for part nouns.
- [applied] add_step drop_aspectless_modal  — add_modal gave modal tuples to aspect-less sense-id nodes (particles, adjective ARG2). Gold gives tuples only to events with :aspect.
