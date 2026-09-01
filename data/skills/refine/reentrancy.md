# Skill: reentrancy

Within the sentence, the same referent must be ONE variable, referenced from
every place it appears — not copied.

- Find nodes that denote the same entity or event and merge them: keep the
  first variable and replace later duplicates with a bare reference to it.
- Pronouns resolve to the variable of their antecedent when the antecedent is
  in this sentence.
- Do NOT merge across sentences here; that is the document level's job.
- Merging changes structure, so re-check that no role is left dangling.
