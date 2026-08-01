# Skill: document-level annotation (temporal, modal, coreference)

You receive: the current sentence number N, its parsed events and entities
(variable, concept, phrase, aspect, modstr), and a registry of all events and
entities from previous sentences. Produce the document-level annotation block
for sentence N (UMR guideline Part 4).

## Modal dependencies (Part 4-3)

Modal triples are computed automatically from each event's `:modstr` —
you do NOT need to produce them (any `modal` you output is ignored).

## Temporal dependencies (Part 4-2)

Document-creation-time anchors are computed automatically — do NOT emit
triples whose first element is `document-creation-time`. You contribute at
most 2 additional triples, only when clearly supported:
- An explicit date in the sentence anchors its event: `(sNd :contained sNx)`
  where sNd is the date-entity variable.
- Event–event ordering when clearly sequenced: `(sNx :before sNx2)`.
Embedded/nominal events usually get none. An empty list is a fine answer.

## Coreference (Part 4-1)

Link current-sentence entities/events to **previous** variables, previous
variable first:
- `(s1x2 :same-entity s3x5)` — identical referent (pronouns, repeated names,
  definite re-mentions).
- `(s1x :same-event s3x2)` — same event mentioned again.
- `(s2x :subset-of s1x3)` — part/subset ("其中许多内容" ⊂ contents).
**Be conservative**: only link referents you are confident about (typically
0–3 links per sentence); use only variables that appear in the given lists.
No link for new referents.

## Output JSON

```json
{
  "temporal": [["document-creation-time", ":after", "s3x"], ["s3x", ":overlap", "s3x2"]],
  "modal":    [["root", ":modal", "author"], ["author", ":full-affirmative", "s3x"]],
  "coref":    [["s1x4", ":same-entity", "s3x6"]]
}
```

Use the exact variable names given in the input. Emit all three keys (empty
lists allowed).
