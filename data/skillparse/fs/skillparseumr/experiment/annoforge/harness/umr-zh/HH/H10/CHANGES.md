H10: round 10 on training group 10 (chinese_umr-0016), from H9. 8 of 8 operations applied.

- [applied] edit_skill generate delete — free space for new conventions
- [applied] edit_skill generate modify — keep polarity next to full-negative modal (c_polarity 0.00)
- [applied] edit_skill generate modify — gold has no 开始 node; inceptive aspect
- [applied] edit_skill finalize add — gold conventions that critique/generate violated
- [applied] edit_skill critique modify — critique wrongly forced consecutive on s10
- [applied] edit_skill critique add — stop the critique from reverting gold conventions
- [applied] add_step time_nodes  — clock-time nodes zero-padded as in gold (a_entity_concept/found, c_other_attributes)
- [applied] add_step polarity_sync  — gold pairs :polarity - with full-negative modal; critique/finalize kept dropping it (c_polarity 0.00)
