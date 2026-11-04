# Skill: temporal relations of one sentence

You annotate the **temporal dependencies** of the current sentence (the last one in the input)
for a Uniform Meaning Representation document. Modal dependencies are made by rule and
coreference by another step: write neither.

The input (under **Input** at the end) gives the language and the current sentence with up to
five sentences before it. Each sentence has its number, its text and a table of its nodes:
`node` (how you name it), `text` (the full span it covers: an event's whole clause, an entity's
whole phrase), `concept`, `kind` (`event` with its aspect and `negative` when negated,
`event (nominal)` for an event built inside a noun phrase, or `entity`) and `step` (the step
that built it; `stop` is a leaf, an entity).

## What to write

Each relation is
`{{"group": "temporal", "source": parent, "relation": label, "target": child}}`, read as "the
child is <label> the parent": `before`, `after`, `overlap`, `contained`, `depends-on`. So
`(A :after B)` means B happened after A, and the earlier of two events is the source of `after`.

- **Complete**: every event and every time expression of the current sentence gets exactly one
  parent. Leaving one out is an error.
- **Only this sentence and its context**: the child is always a node of the current sentence;
  the parent is a node of the current sentence, a node of an earlier sentence in the input, or
  `document-creation-time`. Name nodes exactly as the tables do (`"3:0.1"`, `"3:0.1/x"` for
  another node of that step's fragment).

## Time expressions

- An absolute past date (*in 1998*): `document-creation-time` `before` it; a future date:
  `after`; a deictic one (*today*, *last week*, *on Friday*): `depends-on`.
- Only the first absolute date of a sentence is anchored to `document-creation-time`; a later
  one is ordered from the events. An anaphoric *then*, *that year* is `overlap` the date it
  refers to. *Now* is not an anchor: the main event takes `document-creation-time` `depends-on`.

## Events

- **The main event**: with an explicit date, `overlap` that date (the date the parent); without
  one, a past event `document-creation-time` `before`, a present state `overlap`. In a story told
  in order, the main event of each sentence takes the previous sentence's main action event
  (`after` when it comes next, `overlap` when simultaneous).
- **Across sentences**: a report or claim about an earlier incident is `after` it; an event
  retelling an earlier one is `overlap` it; anything else new is `document-creation-time`
  `before`. Relate to the current or the previous sentence, never to an unrelated event far back.
- **The other events of the sentence chain**: each takes the event just before it (`overlap`
  unless the text orders them). A subordinate time clause (*after X*, *when X*) is a child of the
  main event; a result is `after` its cause; reported content takes the reporting verb (`before`
  for past content); planned, wanted, requested, permitted events and purpose clauses are
  `overlap` the governing event; an event in a relative clause takes the governing event.
- **Events inside noun phrases** (a concept with a sense) are events: chain them with `overlap`.
  An attributive adjective and an apposition's `identity-91` get no parent.

## Examples

To see how a case is annotated, call `search_annotations` with the language and a
few keywords: words of the text, concepts (`have-org-role-91`), roles (`:ARG1-of`). It
returns whole gold sentence annotations that contain them. To check a rule, call
`search_guidelines` with keywords: it returns the matching sections of the UMR guidelines.

## Input

Language: {lang}

{sentences}
