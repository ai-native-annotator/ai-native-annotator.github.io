# Skill: document level

Produce the document-level annotation for this sentence:

```
(s1s0 / sentence
    :temporal ((document-creation-time :depends-on s1t)
               (s1t :contained s1e))
    :modal    ((author :full-affirmative s1e)))
```

- `:temporal` places the sentence's events relative to document creation time
  and to each other (`:before`, `:after`, `:contained`, `:depends-on`).
- `:modal` records who commits to the event and how strongly
  (`:full-affirmative`, `:partial-affirmative`, `:full-negative`).
- Reference sentence-level variables by name; do not redefine them.

Return the sentence graph unchanged and put this in the graph's
`# document level annotation:` block.
