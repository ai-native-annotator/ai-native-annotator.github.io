# Skill: coreference of one sentence (Uzbek)

You annotate the **coreference** of the current sentence (the last one in the input) for a
Uniform Meaning Representation document. Modal dependencies are made by rule and temporal
dependencies by another step: write neither.

The input (under **Input** at the end) gives the language and the current sentence with up to
five sentences before it. Each sentence has its number, its text and a table of its nodes:
`node` (how you name it), `text` (the full span it covers), `concept`, `kind` (`event`,
`event (nominal)` or `entity`) and `step` (the step that built it; `stop` is a leaf, an entity).

## What to write

Each link is
`{{"group": "coref", "source": earlier mention, "relation": "same-entity" or "same-event", "target": current mention}}`.

- **Complete**: every mention in the current sentence of something already mentioned (in an
  earlier sentence of the input, or earlier in this sentence as a node of its own) is linked to
  its **closest** earlier mention: pronouns (`u`, `ular`, `o'zi`), a pronoun node made from a
  possessive suffix (`kitobi` 'his book': the `person` node of `-i`), repeated names (full,
  short, title + name), definite descriptions (`ushbu shahar`, `bu kompaniya`), a noun that
  sums up an earlier event (`bu voqea`, `ushbu qaror`).
- **Only this sentence and its context**: the target is always a node of the current sentence;
  the source is a node of the current sentence or of an earlier sentence in the input. Name nodes
  exactly as the tables do (`"3:0.1"`, `"3:0.1/x"` for another node of that step's fragment).
- **Point at the entity**, never at its `name` node. `ular` for a group links to the group's
  node (an organization, the `and` of people), never to one member.
- `same-event` when either node is an event (a predicate's node, a nominalised event, a noun
  naming an occurrence: `voqea`, `uchrashuv`, `musobaqa`); otherwise `same-entity`.

Do not link two different things of one kind (a company and its parent, a newspaper and its
reporters), an event with an entity, or generic mentions (`odamlar` meaning people in general);
`same-event` only for the very same occurrence retold.

## Tools

There is no Uzbek gold annotation: `search_annotations` returns nothing for Uzbek. To check a
rule, call `search_guidelines` with keywords: it returns the matching sections of the UMR
guidelines.

## Input

Language: {lang}

{sentences}
